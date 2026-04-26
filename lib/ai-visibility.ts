import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

export interface PlatformResult {
  platform: "claude" | "perplexity" | "chatgpt_web";
  response: string;
  citedUrls: string[];
  mentionedBrands: string[];
  companyAppears: boolean;
  companyCited: boolean;
  companyMentioned: boolean;
  competitorsCited: string[];
  competitorsMentioned: string[];
  confidence: "high" | "medium" | "low";
}

export interface AIOpportunity {
  type: "uncovered_topic" | "brand_not_mentioned" | "competitor_advantage" | "citation_gap";
  priority: "high" | "medium";
  title: string;
  description: string;
}

export interface AIVisibilityResult {
  query: string;
  platforms: PlatformResult[];
  summary: {
    totalPlatforms: number;
    platformsWhereVisible: number;
    platformsWhereCited: number;
    competitorsCited: string[];
    aiSourcesCount: number;
    totalCitations: number;
    opportunities: AIOpportunity[];
  };
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s\])"']+/g) ?? [];
  return Array.from(new Set(matches));
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function extractBrands(text: string, knownDomains: string[]): string[] {
  return knownDomains.filter((domain) => {
    const brand = domain.split(".")[0];
    return text.toLowerCase().includes(brand.toLowerCase());
  });
}

async function queryViaOpenRouter(query: string, model: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Answer as you normally would. Include sources where relevant." },
        { role: "user", content: query },
      ],
      max_tokens: 1000,
    });
    return res.choices[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

async function queryPerplexity(query: string): Promise<{ response: string; citations: string[] }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { response: "", citations: [] };
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: query }],
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { response: "", citations: [] };
    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };
    return {
      response: data.choices[0]?.message?.content ?? "",
      citations: data.citations ?? [],
    };
  } catch {
    return { response: "", citations: [] };
  }
}

async function queryChatGPTProxy(query: string): Promise<string> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return "";
  try {
    const params = new URLSearchParams({
      q: `${query} according to chatgpt`,
      api_key: key,
      num: "5",
      engine: "google",
    });
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const data = await res.json() as { organic_results?: Array<{ snippet?: string }> };
    return (data.organic_results ?? [])
      .map((r) => r.snippet ?? "")
      .filter(Boolean)
      .join(" ");
  } catch {
    return "";
  }
}

function buildPlatformResult(
  platform: PlatformResult["platform"],
  response: string,
  citedUrls: string[],
  companyDomain: string,
  competitorDomains: string[],
  confidence: PlatformResult["confidence"]
): PlatformResult {
  const companyName = process.env.COMPANY_NAME ?? companyDomain.split(".")[0];
  const lower = response.toLowerCase();

  const companyCited = citedUrls.some((u) => u.includes(companyDomain));
  const companyMentioned = lower.includes(companyName.toLowerCase()) || lower.includes(companyDomain);
  const companyAppears = companyCited || companyMentioned;

  const competitorsCited = competitorDomains.filter((d) => citedUrls.some((u) => u.includes(d)));
  const competitorsMentioned = competitorDomains.filter((d) => lower.includes(d.split(".")[0].toLowerCase()));
  const mentionedBrands = extractBrands(response, [companyDomain, ...competitorDomains]);

  return { platform, response, citedUrls, mentionedBrands, companyAppears, companyCited, companyMentioned, competitorsCited, competitorsMentioned, confidence };
}

function generateOpportunities(platforms: PlatformResult[], query: string, companyDomain: string): AIOpportunity[] {
  const opps: AIOpportunity[] = [];
  const companyName = process.env.COMPANY_NAME ?? companyDomain.split(".")[0];

  const visibleOnAny = platforms.some((p) => p.companyAppears);
  const citedOnAny = platforms.some((p) => p.companyCited);
  const allCompetitorsCited = Array.from(new Set(platforms.flatMap((p) => p.competitorsCited)));

  if (!visibleOnAny) {
    opps.push({
      type: "brand_not_mentioned",
      priority: "high",
      title: `${companyName} is not mentioned by any AI platform`,
      description: `None of the AI platforms mention ${companyName} when asked about "${query}". Focus on building authoritative, well-structured content that AI models will pick up.`,
    });
  }

  if (allCompetitorsCited.length > 0 && !citedOnAny) {
    opps.push({
      type: "competitor_advantage",
      priority: "high",
      title: "Competitors are being cited, you are not",
      description: `${allCompetitorsCited.join(", ")} ${allCompetitorsCited.length === 1 ? "is" : "are"} cited by AI platforms for this topic. They have content that AI tools trust as authoritative — yours needs the same signals.`,
    });
  }

  const hasThinnResponses = platforms.some((p) => p.response.length < 200 && p.response.length > 0);
  if (hasThinnResponses) {
    opps.push({
      type: "uncovered_topic",
      priority: "medium",
      title: "AI platforms lack authoritative content on this topic",
      description: `AI tools struggle to answer "${query}" with confidence — an opportunity to become the authoritative source before competitors do.`,
    });
  }

  return opps;
}

export async function queryAIPlatforms(params: {
  query: string;
  companyDomain: string;
  competitorDomains: string[];
}): Promise<AIVisibilityResult> {
  const { query, companyDomain, competitorDomains } = params;

  const [claudeResponse, perplexityData, chatgptProxy] = await Promise.all([
    queryViaOpenRouter(query, "anthropic/claude-sonnet-4-5"),
    queryPerplexity(query),
    queryChatGPTProxy(query),
  ]);

  const platforms: PlatformResult[] = [];

  if (claudeResponse) {
    platforms.push(buildPlatformResult(
      "claude",
      claudeResponse,
      extractUrls(claudeResponse),
      companyDomain,
      competitorDomains,
      "high"
    ));
  }

  if (perplexityData.response) {
    platforms.push(buildPlatformResult(
      "perplexity",
      perplexityData.response,
      [...perplexityData.citations, ...extractUrls(perplexityData.response)],
      companyDomain,
      competitorDomains,
      "high"
    ));
  }

  if (chatgptProxy) {
    platforms.push(buildPlatformResult(
      "chatgpt_web",
      chatgptProxy,
      extractUrls(chatgptProxy),
      companyDomain,
      competitorDomains,
      "low"
    ));
  }

  const opportunities = generateOpportunities(platforms, query, companyDomain);
  const allCited = Array.from(new Set(platforms.flatMap((p) => p.citedUrls)));

  return {
    query,
    platforms,
    summary: {
      totalPlatforms: platforms.length,
      platformsWhereVisible: platforms.filter((p) => p.companyAppears).length,
      platformsWhereCited: platforms.filter((p) => p.companyCited).length,
      competitorsCited: Array.from(new Set(platforms.flatMap((p) => p.competitorsCited))),
      aiSourcesCount: allCited.length,
      totalCitations: allCited.length,
      opportunities,
    },
  };
}
