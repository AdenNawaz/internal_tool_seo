import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

// Free models in priority order — tries next if one is rate-limited
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "google/gemma-3-12b-it:free",
];

export interface KeywordCluster {
  clusterName: string;
  primaryKeyword: string;
  keywords: string[];
  searchIntent: "informational" | "commercial" | "transactional" | "navigational";
  estimatedVolume: number;
  difficulty: number | null;
  addressesCompetitorGap: boolean;
  notes: string;
}

export async function* streamClusters(
  seedKeyword: string,
  competitorKeywords: string[],
  ownKeywords: string[]
): AsyncGenerator<string> {
  const companyProfile = process.env.COMPANY_PROFILE ?? "";
  const ownSet = new Set(ownKeywords.map((k) => k.toLowerCase()));

  const gaps = competitorKeywords
    .filter((k) => !ownSet.has(k.toLowerCase()))
    .slice(0, 80);

  const systemPrompt = `You are an SEO strategist. Group the provided keywords into content clusters.
${companyProfile ? `Company context: ${companyProfile}` : ""}

Return ONLY valid JSON as an array of clusters matching this shape:
[
  {
    "clusterName": "descriptive cluster name",
    "primaryKeyword": "main keyword for this cluster",
    "keywords": ["keyword1", "keyword2", ...],
    "searchIntent": "informational|commercial|transactional|navigational",
    "estimatedVolume": 1000,
    "difficulty": 30,
    "addressesCompetitorGap": true,
    "notes": "why this cluster matters, content angle"
  }
]`;

  const userPrompt = `Seed keyword: "${seedKeyword}"

Keywords that competitors rank for but we don't (gap opportunities):
${gaps.slice(0, 60).join(", ")}

Keywords we already rank for (to avoid cannibalization):
${ownKeywords.slice(0, 30).join(", ")}

Group these into 4–8 content clusters. Mark addressesCompetitorGap as true for clusters built from gap keywords.`;

  // Try each model in order until one works
  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      });
      break;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404) { lastError = err; continue; }
      throw err;
    }
  }
  if (!stream) throw lastError ?? new Error("All models rate-limited, try again in a moment");

  let started = false;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!started && delta) started = true;
    if (delta) yield delta;
  }
}
