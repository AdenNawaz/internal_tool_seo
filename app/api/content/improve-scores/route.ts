export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractPlainText } from "@/lib/text-analysis";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const MODELS = [
  "anthropic/claude-sonnet-4-5",
  "meta-llama/llama-3.3-70b-instruct:free",
];

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildImprovementInstructions(
  categories: string[],
  eeatScore: number,
  geoScore: number,
  seoScore: number,
  keyword: string
): string {
  const lines: string[] = [];

  if (categories.includes("eeat")) {
    if (eeatScore < 40) {
      lines.push(`EEAT TRUST (${eeatScore}/100): Add source citations using phrases like "According to [Source]..." and "Research by [Organization] shows...". Include at least 2 external links to authoritative sources.`);
      lines.push(`EEAT EXPERTISE: Add 2-3 specific statistics with numbers, percentages, or concrete data. Ensure heading hierarchy is logical.`);
      lines.push(`EEAT AUTHORITY: Integrate first-person expertise signals: "In our experience...", "We've seen..." or third-person author attribution.`);
    } else if (eeatScore < 70) {
      lines.push(`EEAT (${eeatScore}/100): Strengthen trust signals — add at least one source citation and one specific statistic. Reference credible data sources where relevant.`);
    }
  }

  if (categories.includes("geo")) {
    if (geoScore < 50) {
      lines.push(`GEO QUOTABILITY (${geoScore}/100): Add 2-3 short, standalone declarative sentences (8-20 words) that make sense as extracted quotes. Example: "Effective content marketing drives 3x more leads than paid advertising."`);
      lines.push(`GEO DEFINITIONS: Add clear definitional statements for key terms: "[Term] is defined as..." or "[Term] refers to...".`);
      lines.push(`GEO STRUCTURE: If missing, add a brief FAQ section with 2-3 common questions and direct answers.`);
    } else {
      lines.push(`GEO (${geoScore}/100): Add 1-2 more quotable, specific statements and strengthen any definitions of key terms.`);
    }
  }

  if (categories.includes("seo")) {
    if (seoScore < 50) {
      lines.push(`SEO KEYWORDS (${seoScore}/100): Naturally include the target keyword "${keyword}" one additional time in the content if density is below 0.5%. Ensure it appears in the first paragraph.`);
    } else {
      lines.push(`SEO: Ensure the first paragraph references the target keyword "${keyword}" naturally.`);
    }
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    articleId: string;
    categories: Array<"eeat" | "geo" | "seo">;
    currentScores: { eeat: number; geo: number; seo: number };
  };

  const { articleId, categories, currentScores } = body;
  if (!articleId || !categories?.length) {
    return new Response(sse("error", { message: "articleId and categories required" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article) {
    return new Response(sse("error", { message: "Article not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const plainText = Array.isArray(article.content)
    ? extractPlainText(article.content as unknown[])
    : "";

  const keyword = article.targetKeyword ?? "this topic";
  const instructions = buildImprovementInstructions(
    categories,
    currentScores.eeat,
    currentScores.geo,
    currentScores.seo,
    keyword
  );

  const prompt = `You are an expert content editor improving an SEO article for better EEAT, GEO, and SEO scores.

CURRENT CONTENT:
"""
${plainText.slice(0, 10000)}
"""

TARGET KEYWORD: ${keyword}

IMPROVEMENT INSTRUCTIONS:
${instructions}

Rules:
- Preserve the article's structure, voice, and all existing correct information
- Only add or refine — do not remove or rewrite correct sections
- Keep changes minimal and targeted to the specific improvements listed
- Do not add fake statistics — use hedged language if no real data available
- Return the FULL improved article as markdown

After the article, add a JSON changes block:
[CHANGES]
{
  "wordsAdded": N,
  "wordsRemoved": N,
  "keywordsInserted": ["keyword", "context snippet (first 60 chars of sentence)"],
  "improvementsApplied": ["description of each change made"]
}
[/CHANGES]`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullText = "";

      try {
        for (const model of MODELS) {
          try {
            const stream = await openai.chat.completions.create({
              model,
              messages: [{ role: "user", content: prompt }],
              stream: true,
              max_tokens: 4000,
            });

            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content ?? "";
              if (text) {
                fullText += text;
                controller.enqueue(enc.encode(sse("chunk", { text })));
              }
            }
            break;
          } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 429 || status === 404 || status === 402) continue;
            throw err;
          }
        }

        // Parse the changes block
        const changesMatch = fullText.match(/\[CHANGES\]([\s\S]*?)\[\/CHANGES\]/);
        let changes = {};
        let articleMarkdown = fullText;

        if (changesMatch) {
          try {
            changes = JSON.parse(changesMatch[1].trim());
            articleMarkdown = fullText.replace(/\[CHANGES\][\s\S]*?\[\/CHANGES\]/, "").trim();
          } catch { /* ignore parse error */ }
        }

        controller.enqueue(enc.encode(sse("done", { articleMarkdown, changes })));
      } catch (err) {
        controller.enqueue(enc.encode(sse("error", { message: String(err) })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
