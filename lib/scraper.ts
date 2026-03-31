export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  headings: string[];
}

async function scrapeWithFirecrawl(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("No Firecrawl key");

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });

  if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`);
  const data = await res.json();
  return (data.data?.markdown as string) ?? "";
}

async function scrapeWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { Accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`Jina error: ${res.status}`);
  return res.text();
}

function extractHeadings(markdown: string): string[] {
  const lines = markdown.split("\n");
  return lines
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
    try {
      markdown = await scrapeWithFirecrawl(url);
    } catch {
      markdown = await scrapeWithJina(url);
    }

    if (!markdown || markdown.length < 100) return null;

    return {
      url,
      title,
      markdown: markdown.slice(0, 8000), // cap per page
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
  const scraped = await Promise.allSettled(
    results.slice(0, 5).map((r) => scrapePage(r.url, r.title))
  );

  return scraped
    .filter(
      (r): r is PromiseFulfilledResult<ScrapedPage> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}
