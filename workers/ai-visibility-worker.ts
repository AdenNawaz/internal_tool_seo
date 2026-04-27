import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { enqueue } from "../lib/queue/index";
import { db as prisma } from "../lib/db";

const OPENROUTER_API_KEY = process.env.OPENAI_API_KEY;

async function callClaude(prompt: string, jsonMode = false): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      temperature: jsonMode ? 0.1 : 0.4,
    }),
  });
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

const AI_PLATFORMS = ["perplexity", "chatgpt", "gemini"] as const;

async function queryPlatform(prompt: string, platform: string): Promise<{ visible: boolean; cited: boolean; competitors: string[] }> {
  // In production this would call the actual AI platform APIs
  // For now simulate with a Claude call to assess likely visibility
  const assessment = await callClaude(
    `Given this prompt: "${prompt}", would a company matching this profile be visible/cited? Company: ${process.env.COMPANY_PROFILE ?? ""}. Platform: ${platform}. Return JSON: {"visible": boolean, "cited": boolean, "competitors": ["name1", "name2"]}`
  );
  try {
    const parsed = JSON.parse(assessment.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { visible?: boolean; cited?: boolean; competitors?: string[] };
    return {
      visible: parsed.visible ?? false,
      cited: parsed.cited ?? false,
      competitors: parsed.competitors ?? [],
    };
  } catch {
    return { visible: false, cited: false, competitors: [] };
  }
}

async function runPromptSweep() {
  const prompts = await prisma.trackedPrompt.findMany({
    orderBy: { createdAt: "asc" },
  });

  for (let i = 0; i < prompts.length; i++) {
    await enqueue("aiVisibility", "check-single-prompt", {
      promptId: prompts[i].id,
      prompt: prompts[i].prompt,
      platforms: AI_PLATFORMS,
    }, { delay: i * 10000 });
  }
}

async function checkSinglePrompt(data: {
  promptId: string;
  prompt: string;
  platforms: readonly string[];
}) {
  for (const platform of data.platforms) {
    const result = await queryPlatform(data.prompt, platform);

    // Fetch previous snapshot for this prompt + platform
    const prev = await prisma.visibilitySnapshot.findFirst({
      where: { prompt: data.prompt, platform },
      orderBy: { checkedAt: "desc" },
    });

    await prisma.visibilitySnapshot.create({
      data: {
        prompt: data.prompt,
        platform,
        companyVisible: result.visible,
        companyCited: result.cited,
        competitors: result.competitors,
      },
    });

    if (!prev) continue;

    // Detect state changes
    if (!prev.companyVisible && result.visible) {
      await prisma.visibilityAlert.create({
        data: {
          promptId: data.promptId,
          type: "gained_visibility",
          platform,
          details: `You appeared in ${platform} for "${data.prompt}"`,
        },
      });
    } else if (prev.companyVisible && !result.visible) {
      await prisma.visibilityAlert.create({
        data: {
          promptId: data.promptId,
          type: "lost_visibility",
          platform,
          details: `You dropped out of ${platform} for "${data.prompt}"`,
        },
      });
      await enqueue("contentQuality", "score-all-published", {});
    }

    if (!prev.companyCited && result.cited) {
      await prisma.visibilityAlert.create({
        data: {
          promptId: data.promptId,
          type: "gained_citation",
          platform,
          details: `You were cited in ${platform} for "${data.prompt}"`,
        },
      });
    } else if (prev.companyCited && !result.cited) {
      await prisma.visibilityAlert.create({
        data: {
          promptId: data.promptId,
          type: "lost_citation",
          platform,
          details: `You lost citation in ${platform} for "${data.prompt}"`,
        },
      });
      await enqueue("contentQuality", "score-all-published", {});
    }
  }
}

async function analyseVisibilityTrends() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const snapshots = await prisma.visibilitySnapshot.findMany({
    where: { checkedAt: { gte: thirtyDaysAgo } },
    orderBy: { checkedAt: "asc" },
  });

  if (snapshots.length === 0) return;

  const companyName = JSON.parse(process.env.COMPANY_PROFILE ?? '{"name":"the company"}').name ?? "the company";

  const aggregated = snapshots.map((s) => ({
    prompt: s.prompt,
    platform: s.platform,
    visible: s.companyVisible,
    cited: s.companyCited,
    checkedAt: s.checkedAt,
  }));

  const prompt = `Analyse these AI visibility snapshots for ${companyName} over 30 days.

SNAPSHOT DATA (${aggregated.length} records):
${JSON.stringify(aggregated.slice(0, 50), null, 2)}

Identify:
1. Which topics/prompts consistently get us cited?
2. Which competitors consistently appear instead of us?
3. What content patterns appear in prompts where we ARE cited vs where we're not?
4. What 3 specific actions would most improve overall AI visibility?

Return JSON only:
{
  "topPerformingTopics": [],
  "consistentCompetitors": [],
  "citationPatterns": [],
  "recommendedActions": [{"action": "string", "impact": "high|medium|low", "effort": "high|medium|low"}]
}`;

  const raw = await callClaude(prompt, true);
  let parsed: {
    topPerformingTopics?: string[];
    consistentCompetitors?: string[];
    citationPatterns?: string[];
    recommendedActions?: Array<{ action: string; impact: string; effort: string }>;
  } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.visibilityAnalysis.create({
    data: {
      topPerformingTopics: parsed.topPerformingTopics ?? [],
      consistentCompetitors: parsed.consistentCompetitors ?? [],
      citationPatterns: parsed.citationPatterns ?? [],
      recommendedActions: parsed.recommendedActions ?? [],
    },
  });
}

async function suggestNewPrompts() {
  const current = await prisma.trackedPrompt.findMany({
    select: { prompt: true },
  });

  const reports = await prisma.researchReport.findMany({
    where: { status: "done" },
    select: { keyword: true },
    take: 20,
  });

  const prompt = `Current tracked prompts: ${current.map((p) => p.prompt).join(", ")}
Company: ${process.env.COMPANY_PROFILE ?? ""}
Top cluster keywords: ${reports.map((r) => r.keyword).join(", ")}

Suggest 10 new prompts that would reveal AI visibility for this company.
Classify each as: discovery | comparison | problem-solution | feature-specific.

Return JSON array only:
[{"prompt": "string", "category": "string", "rationale": "string"}]`;

  const raw = await callClaude(prompt, true);
  let suggestions: Array<{ prompt: string; category: string; rationale: string }> = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]);
  } catch { /* ignore */ }

  for (const s of suggestions) {
    await prisma.suggestedPrompt.create({
      data: {
        prompt: s.prompt,
        category: s.category,
        rationale: s.rationale,
      },
    });
  }
}

export const aiVisibilityWorker = new Worker(
  "ai-visibility",
  async (job) => {
    switch (job.name) {
      case "run-prompt-sweep": return runPromptSweep();
      case "check-single-prompt": return checkSinglePrompt(job.data as Parameters<typeof checkSinglePrompt>[0]);
      case "analyse-visibility-trends": return analyseVisibilityTrends();
      case "suggest-new-prompts": return suggestNewPrompts();
    }
  },
  { connection: makeConnection(), concurrency: 1 }
);

aiVisibilityWorker.on("failed", (job, err) => {
  console.error(`[ai-visibility] ${job?.name} failed:`, err.message);
});
