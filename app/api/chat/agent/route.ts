import { NextRequest } from "next/server";
import { z } from "zod";
import { ResearchState, SSEEvent } from "@/lib/agents/types";
import { runKeywordAgent, handleKeywordIntervention } from "@/lib/agents/keyword-agent";
import { runCompetitorAgent } from "@/lib/agents/competitor-agent";
import { generateOutline, applyOutlineIntervention } from "@/lib/agents/outline-agent";
import { streamArticle } from "@/lib/agents/writer-agent";
import { db } from "@/lib/db";
import { markdownToBlocks } from "@/lib/markdown-to-blocknote";

const schema = z.object({
  state: z.object({
    topic: z.string(),
    country: z.string().default("us"),
    contentType: z.enum(["blog", "landing-page"]).default("blog"),
    primaryKeyword: z.string().default(""),
    secondaryKeywords: z.array(z.any()).default([]),
    keywordsApproved: z.boolean().default(false),
    competitorUrls: z.array(z.string()).default([]),
    competitorData: z.array(z.any()).default([]),
    outline: z.array(z.any()).default([]),
    outlineApproved: z.boolean().default(false),
    articleContent: z.string().default(""),
    articleId: z.string().nullable().default(null),
    currentStep: z.string().default("init"),
    messages: z.array(z.any()).default([]),
  }),
  userMessage: z.string().optional(),
});

function send(controller: ReadableStreamDefaultController, enc: TextEncoder, event: SSEEvent) {
  controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function sendText(controller: ReadableStreamDefaultController, enc: TextEncoder, delta: string) {
  send(controller, enc, { type: "text", delta });
}

function isApproval(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return /^(yes|ok|okay|approve|looks good|perfect|great|go ahead|confirmed|✓|👍|sure|proceed|let's go|do it|start writing|write it)/.test(lower);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
  }

  const { state: rawState, userMessage } = parsed.data;
  const state = rawState as ResearchState;

  const enc = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const step = state.currentStep;

        // Step: keywords — fetch and present keyword suggestions
        if (step === "init" || step === "keywords") {
          send(controller, enc, { type: "step", step: "keywords", label: "Researching keywords…" });
          sendText(controller, enc, `Let me find the best keywords for **"${state.topic}"**…\n\n`);

          const { primary, keywords } = await runKeywordAgent(state.topic, state.country);

          send(controller, enc, { type: "keywords", keywords: [{ keyword: primary, volume: 0, kd: 0, intent: "primary" }, ...keywords] });

          sendText(controller, enc, `Here are the keywords I found:\n\n`);
          sendText(controller, enc, `**Primary:** ${primary}\n\n`);
          sendText(controller, enc, `**Secondary keywords:**\n${keywords.map(k => `- **${k.keyword}** — vol: ${k.volume.toLocaleString()}, KD: ${k.kd}, intent: ${k.intent}`).join("\n")}\n\n`);
          sendText(controller, enc, `Does this look good? Or would you like easier keywords, more volume, or a different focus?`);

          send(controller, enc, {
            type: "done",
            state: {
              primaryKeyword: primary,
              secondaryKeywords: keywords,
              currentStep: "keywords_approval",
            },
          });
        }

        // Step: keywords_approval — handle approval or revision
        else if (step === "keywords_approval" && userMessage) {
          if (isApproval(userMessage)) {
            // Move to competitors
            send(controller, enc, { type: "step", step: "competitors", label: "Analyzing competitors…" });
            sendText(controller, enc, `Great! Now analyzing top competitors for **"${state.primaryKeyword}"**…\n\n`);

            const competitors = await runCompetitorAgent(state.primaryKeyword, state.country);

            send(controller, enc, { type: "competitors", competitors });

            sendText(controller, enc, `Here's what the top-ranking pages cover:\n\n`);
            for (const c of competitors.slice(0, 3)) {
              sendText(controller, enc, `**${c.title || c.url}**\n`);
              if (c.keyPoints?.length) {
                sendText(controller, enc, (c.keyPoints.slice(0, 3).map(p => `- ${p}`).join("\n")) + "\n\n");
              }
            }

            sendText(controller, enc, `Now I'll generate a content outline. One moment…\n\n`);

            // Generate outline immediately
            send(controller, enc, { type: "step", step: "outline", label: "Building outline…" });
            const outline = await generateOutline(
              state.topic,
              state.primaryKeyword,
              state.secondaryKeywords,
              competitors,
              state.contentType
            );

            send(controller, enc, { type: "outline", outline });

            sendText(controller, enc, `Here's the outline I've built:\n\n`);
            for (const item of outline) {
              const prefix = item.level === 2 ? "## " : "### ";
              const badge = item.type !== "general" ? ` \`${item.type.toUpperCase()}\`` : "";
              sendText(controller, enc, `${prefix}${item.text}${badge}\n`);
            }
            sendText(controller, enc, `\nWould you like to proceed with this outline, or make changes? (e.g. "add a section about pricing", "remove the introduction")`);

            send(controller, enc, {
              type: "done",
              state: {
                competitorUrls: competitors.map(c => c.url),
                competitorData: competitors,
                outline,
                currentStep: "outline_approval",
              },
            });
          } else {
            // Revise keywords
            sendText(controller, enc, `Got it — let me adjust the keywords based on your feedback…\n\n`);
            const { primary, keywords } = await handleKeywordIntervention(
              userMessage,
              state.secondaryKeywords,
              state.topic
            );
            send(controller, enc, { type: "keywords", keywords: [{ keyword: primary, volume: 0, kd: 0, intent: "primary" }, ...keywords] });
            sendText(controller, enc, `Updated keywords:\n\n**Primary:** ${primary}\n\n`);
            sendText(controller, enc, `**Secondary:** ${keywords.map(k => `${k.keyword} (vol: ${k.volume}, KD: ${k.kd})`).join(", ")}\n\n`);
            sendText(controller, enc, `Does this work now?`);
            send(controller, enc, {
              type: "done",
              state: {
                primaryKeyword: primary,
                secondaryKeywords: keywords,
                currentStep: "keywords_approval",
              },
            });
          }
        }

        // Step: outline_approval — approve or edit outline
        else if (step === "outline_approval" && userMessage) {
          if (isApproval(userMessage)) {
            // Start writing
            send(controller, enc, { type: "step", step: "writing", label: "Writing article…" });
            sendText(controller, enc, `Perfect! Starting to write your **${state.contentType}** now…\n\n---\n\n`);

            // Get tone profile if available
            let toneProfile: string | undefined;
            try {
              const tone = await db.toneProfile.findFirst({
                where: { type: state.contentType },
                orderBy: { updatedAt: "desc" },
              });
              if (tone?.profile) toneProfile = String(tone.profile);
            } catch { /* ignore */ }

            let fullContent = "";
            const stream = streamArticle(
              state.topic,
              state.primaryKeyword,
              state.secondaryKeywords.map(k => k.keyword),
              state.outline,
              state.contentType,
              toneProfile
            );

            for await (const delta of stream) {
              fullContent += delta;
              sendText(controller, enc, delta);
            }

            sendText(controller, enc, `\n\n---\n\nSaving your article…`);

            // Save to DB
            const blocks = markdownToBlocks(fullContent);
            const article = await db.article.create({
              data: {
                title: state.primaryKeyword || state.topic,
                targetKeyword: state.primaryKeyword,
                content: blocks as never,
                status: "draft",
              },
            });

            send(controller, enc, { type: "article_saved", articleId: article.id });
            sendText(controller, enc, ` Done! Your article has been saved.`);

            send(controller, enc, {
              type: "done",
              state: {
                articleContent: fullContent,
                articleId: article.id,
                currentStep: "complete",
              },
            });
          } else {
            // Edit outline
            sendText(controller, enc, `Got it — updating the outline…\n\n`);
            const updated = await applyOutlineIntervention(userMessage, state.outline, state.topic);
            send(controller, enc, { type: "outline", outline: updated });
            sendText(controller, enc, `Updated outline:\n\n`);
            for (const item of updated) {
              const prefix = item.level === 2 ? "## " : "### ";
              const badge = item.type !== "general" ? ` \`${item.type.toUpperCase()}\`` : "";
              sendText(controller, enc, `${prefix}${item.text}${badge}\n`);
            }
            sendText(controller, enc, `\nReady to write with this outline?`);
            send(controller, enc, {
              type: "done",
              state: { outline: updated, currentStep: "outline_approval" },
            });
          }
        }

        // Fallback
        else {
          sendText(controller, enc, `I'm not sure what to do next. Please refresh and start a new research session.`);
          send(controller, enc, { type: "done", state: {} });
        }
      } catch (err) {
        send(controller, enc, { type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
