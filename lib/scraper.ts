export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  headings: string[];
}

// Jina is free and unlimited — always try this first
async function scrapeWithJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Jina error: ${res.status}`);
  const text = await res.text();
  if (text.length < 200) throw new Error("Jina returned too little content");
  return text;
}

// Firecrawl costs 1 credit per page — only used when Jina fails
async function scrapeWithFirecrawl(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("No Firecrawl key");

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    // Only fetch markdown, no screenshots/links — minimises credit usage
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`);
  const data = await res.json();
  return (data.data?.markdown as string) ?? "";
}

function extractHeadings(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((l) => /^#{1,3}\s/.test(l))
    .map((l) => l.replace(/^#+\s+/, "").trim())
    .slice(0, 20);
}

function countWords(text: string): number {
  return (text.match(/\b\w+\b/g) ?? []).length;
}

export async function scrapePage(url: string, title: string): Promise<ScrapedPage | null> {
  try {
    let markdown: string;

    // Always try Jina first — free, no credit cost
    try {
      markdown = await scrapeWithJina(url);
    } catch {
      // Only fall back to Firecrawl if Jina fails
      try {
        markdown = await scrapeWithFirecrawl(url);
      } catch {
        return null;
      }
    }

    if (!markdown || markdown.length < 100) return null;

    return {
      url,
      title,
      markdown: markdown.slice(0, 8000),
      wordCount: countWords(markdown),
      headings: extractHeadings(markdown),
    };
  } catch {
    return null;
  }
}

export async function scrapeCompetitors(
  results: { url: string; title: string }[]
): Promise<ScrapedPage[]> {
  // Cap at 3 competitors — enough for a brief, avoids burning credits on 5 simultaneous calls
  const targets = results.slice(0, 3);

  // Sequential rather than parallel — prevents hammering Firecrawl if Jina fails for all
  const scraped: ScrapedPage[] = [];
  for (const r of targets) {
    const page = await scrapePage(r.url, r.title);
    if (page) scraped.push(page);
  }
  return scraped;
}
