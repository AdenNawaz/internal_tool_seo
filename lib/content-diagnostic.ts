// Pure scoring functions — run client-side on a 3s debounce.

const AUTHORITATIVE_DOMAINS = [
  "gartner.com", "mckinsey.com", "forrester.com", "hbr.org", "academia.edu",
  "deloitte.com", "pwc.com", "accenture.com", "statista.com", "hubspot.com",
  "salesforce.com", "ibm.com", "microsoft.com", "google.com", "mit.edu",
  "stanford.edu", "harvard.edu",
];

export interface EEATItem {
  label: string;
  points: number;
  earned: number;
  passed: boolean;
}

export interface EEATResult {
  score: number;
  trust: number;
  expertise: number;
  authority: number;
  breakdown: EEATItem[];
}

export interface GEOResult {
  score: number;
  quotability: number;
  structure: number;
  definitions: number;
  takeaways: number;
  citableData: number;
}

export interface SEOResult {
  score: number;
  keywords: number;
  metaTags: number;
  structure: number;
  readability: number;
}

export interface DiagnosticResult {
  combined: number;
  eeat: EEATResult;
  geo: GEOResult;
  seo: SEOResult;
  wordCount: number;
  headerCount: number;
  linkCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function extractLinks(plainText: string): { external: number; authoritative: number } {
  const urls = plainText.match(/https?:\/\/[^\s)>"']+/g) ?? [];
  const external = urls.length;
  const authoritative = urls.filter((u) =>
    AUTHORITATIVE_DOMAINS.some((d) => u.includes(d))
  ).length;
  return { external, authoritative };
}

function extractHeadings(content: unknown): Array<{ level: number; text: string }> {
  if (!Array.isArray(content)) return [];
  const results: Array<{ level: number; text: string }> = [];
  function walk(blocks: unknown[]) {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "heading") {
        const level = Number((b.props as Record<string, unknown>)?.level ?? 2);
        const text = (b.content as Array<{ text?: string }> | undefined)
          ?.map((c) => c.text ?? "")
          .join("") ?? "";
        results.push({ level, text });
      }
      if (Array.isArray(b.children)) walk(b.children as unknown[]);
    }
  }
  walk(content as unknown[]);
  return results;
}

function getSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 10);
}

function countWords(text: string): number {
  return (text.match(/\b\w+\b/g) ?? []).length;
}

function hasList(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  function walk(blocks: unknown[]): boolean {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "bulletListItem" || b.type === "numberedListItem") return true;
      if (Array.isArray(b.children) && walk(b.children as unknown[])) return true;
    }
    return false;
  }
  return walk(content as unknown[]);
}

// ── EEAT ───────────────────────────────────────────────────────────────────

export function computeEEAT(params: {
  plainText: string;
  content: unknown;
  authorName: string | null;
  authorBio: string | null;
  authorLinkedin?: string | null;
  authorCredentials?: string | null;
  externalCitations: number;
  statistics: number;
  quotableStatements: number;
  publishedDate: string | null;
}): EEATResult {
  const {
    plainText, content, authorName, authorBio, authorLinkedin, authorCredentials,
    statistics, publishedDate,
  } = params;

  const wordCount = countWords(plainText);
  const sentences = getSentences(plainText);
  const { authoritative } = extractLinks(plainText);
  const hasSourceCitations = /according to|research by|study by|reported by|per |source:/i.test(plainText);
  const hasBullets = hasList(content);
  const headings = extractHeadings(content);
  const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;

  // ── Trust (30%) ──────────────────────────────────────────────────────────
  const trustItems: EEATItem[] = [
    { label: "Published date set", points: 10, earned: publishedDate ? 10 : 0, passed: !!publishedDate },
    { label: "Links to authoritative domains", points: 40, earned: Math.min(40, authoritative * 20), passed: authoritative > 0 },
    { label: "Word count ≥ 1000", points: 15, earned: wordCount >= 1000 ? 15 : 0, passed: wordCount >= 1000 },
    { label: "Source citations present", points: 15, earned: hasSourceCitations ? 15 : 0, passed: hasSourceCitations },
  ];
  const trustRaw = trustItems.reduce((s, i) => s + i.earned, 0);
  const trustMax = trustItems.reduce((s, i) => s + i.points, 0);
  const trust = Math.round((trustRaw / trustMax) * 100);

  // ── Expertise (40%) ──────────────────────────────────────────────────────
  const expertiseItems: EEATItem[] = [
    { label: "≥ 3 statistics with data", points: 30, earned: statistics >= 3 ? 30 : statistics > 0 ? 15 : 0, passed: statistics >= 3 },
    { label: "Average sentence length 15–25 words", points: 20, earned: avgSentenceLength >= 15 && avgSentenceLength <= 25 ? 20 : avgSentenceLength > 0 ? 10 : 0, passed: avgSentenceLength >= 15 && avgSentenceLength <= 25 },
    { label: "Uses numbered or bulleted lists", points: 10, earned: hasBullets ? 10 : 0, passed: hasBullets },
    { label: "Has subheadings (H2/H3)", points: 20, earned: headings.length >= 2 ? 20 : headings.length > 0 ? 10 : 0, passed: headings.length >= 2 },
    { label: "≥ 500 words of content", points: 20, earned: wordCount >= 500 ? 20 : wordCount >= 200 ? 10 : 0, passed: wordCount >= 500 },
  ];
  const expertiseRaw = expertiseItems.reduce((s, i) => s + i.earned, 0);
  const expertiseMax = expertiseItems.reduce((s, i) => s + i.points, 0);
  const expertise = Math.round((expertiseRaw / expertiseMax) * 100);

  // ── Authority (30%) ──────────────────────────────────────────────────────
  const authorityItems: EEATItem[] = [
    { label: "Named author set", points: 40, earned: authorName ? 40 : 0, passed: !!authorName },
    { label: "Author bio set", points: 30, earned: authorBio ? 30 : 0, passed: !!authorBio },
    { label: "Author LinkedIn or credentials", points: 20, earned: authorLinkedin ? 20 : authorCredentials ? 10 : 0, passed: !!(authorLinkedin || authorCredentials) },
  ];
  const authorityRaw = authorityItems.reduce((s, i) => s + i.earned, 0);
  const authorityMax = authorityItems.reduce((s, i) => s + i.points, 0);
  const authority = Math.round((authorityRaw / authorityMax) * 100);

  const allItems = [...trustItems, ...expertiseItems, ...authorityItems];
  const score = Math.round(trust * 0.30 + expertise * 0.40 + authority * 0.30);

  return { score, trust, expertise, authority, breakdown: allItems };
}

// ── GEO ───────────────────────────────────────────────────────────────────

export function computeGEO(params: {
  plainText: string;
  content: unknown;
}): GEOResult {
  const { plainText, content } = params;
  const headings = extractHeadings(content);
  const sentences = getSentences(plainText);
  const wordCount = countWords(plainText);

  // Quotability: short declarative sentences with specific claims
  const quotable = sentences.filter((s) => {
    const wc = countWords(s);
    return wc >= 8 && wc <= 25 && /\d|%|every|always|never|most|best|key|critical|essential|proven/i.test(s);
  }).length;
  const quotabilityScore = Math.min(100, Math.round((quotable / Math.max(1, sentences.length * 0.15)) * 100));

  // Structure: H2s, H3s, logical hierarchy, FAQ
  const h2s = headings.filter((h) => h.level === 2).length;
  const h3s = headings.filter((h) => h.level === 3).length;
  const hasFaq = headings.some((h) => /faq|frequently asked|questions/i.test(h.text));
  const hasH1 = headings.some((h) => h.level === 1);
  let structureScore = 0;
  if (h2s >= 2) structureScore += 40;
  else if (h2s === 1) structureScore += 20;
  if (h3s >= 1) structureScore += 30;
  if (hasFaq) structureScore += 15;
  if (hasH1) structureScore += 15;
  structureScore = Math.min(100, structureScore);

  // Definitions: "X is", "X refers to", "X means", "defined as"
  const defPatterns = /\bis defined as\b|\brefers to\b|\bmeans\b|, which is |\bis a\b|\bis the\b/gi;
  const defCount = countMatches(plainText, defPatterns);
  const definitionsScore = Math.min(100, Math.round((defCount / Math.max(1, wordCount / 500)) * 50));

  // Takeaways: strong declarative statements — sentences starting with a noun/pronoun + action verb
  const takeawayCount = sentences.filter((s) =>
    /^[A-Z][a-z]+\s+(is|are|provides|enables|ensures|allows|helps|drives|creates|delivers|offers|improves|reduces|increases)/i.test(s)
  ).length;
  const takeawaysScore = Math.min(100, Math.round((takeawayCount / Math.max(1, wordCount / 500)) * 60));

  // Citable data: specific numbers/percentages paired with context
  const citablePattern = /\b\d+(\.\d+)?%|\b\d{4}\b|\$\d+|\b\d+\s*(million|billion|thousand)/gi;
  const citableCount = countMatches(plainText, citablePattern);
  const citableDataScore = Math.min(100, Math.round((citableCount / Math.max(1, wordCount / 500)) * 40));

  const score = Math.round(
    quotabilityScore * 0.20 +
    structureScore * 0.20 +
    definitionsScore * 0.20 +
    takeawaysScore * 0.20 +
    citableDataScore * 0.20
  );

  return { score, quotability: quotabilityScore, structure: structureScore, definitions: definitionsScore, takeaways: takeawaysScore, citableData: citableDataScore };
}

// ── SEO ───────────────────────────────────────────────────────────────────

export function computeSEO(params: {
  title: string | null;
  metaDescription: string | null;
  targetKeyword: string | null;
  content: unknown;
  plainText: string;
  wordCount: number;
  internalLinks: number;
  readabilityScore: number;
}): SEOResult {
  const { title, metaDescription, targetKeyword, content, plainText, wordCount, internalLinks, readabilityScore } = params;
  const kw = (targetKeyword ?? "").toLowerCase().trim();
  const headings = extractHeadings(content);
  const titleLower = (title ?? "").toLowerCase();
  const metaLower = (metaDescription ?? "").toLowerCase();

  // First paragraph content
  let firstPara = "";
  if (Array.isArray(content)) {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "paragraph") {
        firstPara = (block.content as Array<{ text?: string }> | undefined)?.map((c) => c.text ?? "").join("") ?? "";
        if (firstPara.length > 0) break;
      }
    }
  }

  // Keyword density
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kwRegex = kw ? new RegExp(`\\b${escaped}\\b`, "gi") : null;
  const kwCount = kwRegex ? (plainText.match(kwRegex) ?? []).length : 0;
  const kwDensity = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;
  const densityGood = kwDensity >= 0.5 && kwDensity <= 3.0;

  // Keywords sub-score (30%)
  let keywordsScore = 0;
  if (kw && titleLower.includes(kw)) keywordsScore += 25;
  if (kw && firstPara.toLowerCase().includes(kw)) keywordsScore += 20;
  if (densityGood) keywordsScore += 30;
  else if (kwDensity > 0) keywordsScore += 10;
  keywordsScore = Math.min(100, keywordsScore + (kw ? 25 : 0)); // secondary keywords placeholder

  // Meta Tags sub-score (25%)
  const titleLen = (title ?? "").length;
  const metaLen = (metaDescription ?? "").length;
  let metaScore = 0;
  if (title) metaScore += 16;
  if (titleLen >= 50 && titleLen <= 60) metaScore += 16;
  if (kw && titleLower.includes(kw)) metaScore += 17;
  if (metaDescription) metaScore += 17;
  if (metaLen >= 120 && metaLen <= 160) metaScore += 17;
  if (kw && metaLower.includes(kw)) metaScore += 17;

  // Structure sub-score (25%)
  const hasH1 = headings.some((h) => h.level === 1);
  const h2Count = headings.filter((h) => h.level === 2).length;
  let structureScore = 0;
  if (hasH1) structureScore += 20;
  if (h2Count >= 2) structureScore += 20;
  if (internalLinks >= 2) structureScore += 20;
  if (wordCount >= 300) structureScore += 20;
  if (wordCount >= 800) structureScore += 20;

  // Readability sub-score (20%) — pass/fail at 60
  const readabilityScore2 = readabilityScore >= 60 ? 100 : readabilityScore >= 40 ? 60 : readabilityScore > 0 ? 30 : 0;

  const score = Math.round(
    keywordsScore * 0.30 +
    metaScore * 0.25 +
    structureScore * 0.25 +
    readabilityScore2 * 0.20
  );

  return { score, keywords: keywordsScore, metaTags: metaScore, structure: structureScore, readability: readabilityScore2 };
}

// ── Statistics detection ───────────────────────────────────────────────────

export function countStatistics(plainText: string): number {
  const patterns = [
    /\b\d+(\.\d+)?%/g,
    /\$\d+(\.\d+)?(k|m|b|million|billion|thousand)?/gi,
    /\b\d{4}\b/g,
    /\b\d+\s+out of\s+\d+/gi,
    /\b(one|two|three|four|five|six|seven|eight|nine|ten) in (every|three|four|five|ten)/gi,
  ];
  const all = patterns.flatMap((p) => Array.from(plainText.matchAll(p)));
  return Math.min(all.length, 20);
}

export function countQuotableStatements(plainText: string): number {
  const sentences = getSentences(plainText);
  return sentences.filter((s) => {
    const wc = countWords(s);
    return wc >= 8 && wc <= 30 && /\d|%|every|always|never|most|best|key|critical|essential/i.test(s);
  }).length;
}

export function countExternalLinks(plainText: string): number {
  return (plainText.match(/https?:\/\/(?!localhost)[^\s)>"']+/g) ?? []).length;
}

export function countInternalLinks(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let count = 0;
  function walk(blocks: unknown[]) {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (Array.isArray(b.content)) {
        for (const inline of b.content as Record<string, unknown>[]) {
          if (inline.type === "link") count++;
        }
      }
      if (Array.isArray(b.children)) walk(b.children as unknown[]);
    }
  }
  walk(content as unknown[]);
  return count;
}

// ── Combined ───────────────────────────────────────────────────────────────

export function computeDiagnostic(params: {
  plainText: string;
  content: unknown;
  title: string;
  metaDescription: string | null;
  targetKeyword: string | null;
  readabilityScore: number;
  authorName: string | null;
  authorBio: string | null;
  authorLinkedin?: string | null;
  authorCredentials?: string | null;
  publishedDate?: string | null;
}): DiagnosticResult {
  const { plainText, content, title, metaDescription, targetKeyword, readabilityScore, authorName, authorBio, authorLinkedin, authorCredentials, publishedDate } = params;

  const wordCount = countWords(plainText);
  const statistics = countStatistics(plainText);
  const quotableStatements = countQuotableStatements(plainText);
  const externalCitations = countExternalLinks(plainText);
  const internalLinks = countInternalLinks(content);
  const headings = extractHeadings(content);

  const eeat = computeEEAT({ plainText, content, authorName, authorBio, authorLinkedin, authorCredentials, externalCitations, statistics, quotableStatements, publishedDate: publishedDate ?? null });
  const geo = computeGEO({ plainText, content });
  const seo = computeSEO({ title, metaDescription, targetKeyword, content, plainText, wordCount, internalLinks, readabilityScore });

  const combined = Math.round(eeat.score * 0.35 + geo.score * 0.35 + seo.score * 0.30);

  return { combined, eeat, geo, seo, wordCount, headerCount: headings.length, linkCount: externalCitations + internalLinks };
}
