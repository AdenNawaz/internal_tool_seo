import { extractPlainText } from "./text-analysis";

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  hint?: string;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  score: number;
}

export interface ChecklistInput {
  title: string;
  metaDescription: string | null;
  slug: string | null;
  targetKeyword: string | null;
  content: unknown;
  competitorAvgWords?: number | null;
}

export function runChecklist(input: ChecklistInput): ChecklistResult {
  const plainText = Array.isArray(input.content)
    ? extractPlainText(input.content as unknown[])
    : "";
  const wordCount = (plainText.match(/\b\w+\b/g) ?? []).length;
  const first100 = plainText.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  const kw = input.targetKeyword?.toLowerCase() ?? "";

  const items: ChecklistItem[] = [
    {
      id: "title-length",
      label: "Title is 50–60 characters",
      passed: input.title.length >= 50 && input.title.length <= 60,
      hint: `${input.title.length} chars`,
    },
    {
      id: "meta-description",
      label: "Meta description 150–160 chars",
      passed:
        !!input.metaDescription &&
        input.metaDescription.length >= 150 &&
        input.metaDescription.length <= 160,
      hint: input.metaDescription ? `${input.metaDescription.length} chars` : "Missing",
    },
    {
      id: "slug",
      label: "Slug is URL-friendly",
      passed: !!input.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug),
      hint: input.slug || "Missing",
    },
    {
      id: "keyword-in-title",
      label: "Target keyword in title",
      passed: !!kw && input.title.toLowerCase().includes(kw),
    },
    {
      id: "keyword-in-meta",
      label: "Target keyword in meta description",
      passed:
        !!kw && !!input.metaDescription && input.metaDescription.toLowerCase().includes(kw),
    },
    {
      id: "word-count",
      label: "At least 300 words",
      passed: wordCount >= 300,
      hint: `${wordCount} words`,
    },
    {
      id: "keyword-in-intro",
      label: "Target keyword in first 100 words",
      passed: !!kw && first100.includes(kw),
    },
    {
      id: "competitor-length",
      label: "Meets competitor length (≥80%)",
      passed:
        input.competitorAvgWords != null ? wordCount >= input.competitorAvgWords * 0.8 : true,
      hint:
        input.competitorAvgWords != null
          ? `${wordCount} / ${input.competitorAvgWords} avg competitor words`
          : "Generate a brief to enable",
    },
  ];

  const passed = items.filter((i) => i.passed).length;
  const score = Math.round((passed / items.length) * 100);

  return { items, score };
}
