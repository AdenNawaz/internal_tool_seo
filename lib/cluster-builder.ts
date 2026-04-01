import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const MODEL = "meta-llama/llama-4-maverick:free";

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

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  });

  // Wrap in object so response_format: json_object is satisfied
  let started = false;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!started && delta) started = true;
    if (delta) yield delta;
  }
}
