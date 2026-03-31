export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
}

export async function fetchSerpResults(keyword: string): Promise<SerpResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY is not configured");

  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    num: "10",
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`SerpAPI error: ${res.status}`);

  const data = await res.json();
  const organic: SerpResult[] = (data.organic_results ?? [])
    .filter((r: Record<string, unknown>) => r.link && r.title)
    .slice(0, 10)
    .map((r: Record<string, unknown>) => ({
      url: r.link as string,
      title: r.title as string,
      snippet: (r.snippet as string) ?? "",
    }));

  return organic;
}

export async function fetchPaaQuestions(keyword: string): Promise<string[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    num: "5",
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) return [];
  const data = await res.json();

  return ((data.related_questions ?? []) as Record<string, unknown>[])
    .filter((q) => typeof q.question === "string")
    .map((q) => q.question as string)
    .slice(0, 8);
}
