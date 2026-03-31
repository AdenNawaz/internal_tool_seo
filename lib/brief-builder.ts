import OpenAI from "openai";
import type { ScrapedPage } from "./scraper";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface BriefOutlineSection {
  heading: string;
  notes: string;
  wordTarget: number;
}

export interface BriefOutline {
  intro: string;
  sections: BriefOutlineSection[];
  conclusion: string;
  totalWordTarget: number;
}

export async function* streamBriefOutline(
  keyword: string,
  competitors: ScrapedPage[],
  paaQuestions: string[]
): AsyncGenerator<string> {
  const companyProfile = process.env.COMPANY_PROFILE ?? "";

  const competitorSummary = competitors
    .slice(0, 4)
    .map(
      (c, i) =>
        `Competitor ${i + 1}: "${c.title}" (${c.wordCount} words)\nHeadings: ${c.headings.slice(0, 8).join(" | ")}`
    )
    .join("\n\n");

  const avgWords =
    competitors.length > 0
      ? Math.round(competitors.reduce((s, c) => s + c.wordCount, 0) / competitors.length)
      : 1200;

  const systemPrompt = `You are an SEO content strategist. Generate a detailed article brief as JSON.
${companyProfile ? `Company context: ${companyProfile}` : ""}

Return ONLY valid JSON matching this shape:
{
  "intro": "what the intro should cover",
  "sections": [
    { "heading": "H2 heading", "notes": "what to cover, angle, data points", "wordTarget": 200 }
  ],
  "conclusion": "what the conclusion should cover",
  "totalWordTarget": ${Math.round(avgWords * 1.1)}
}`;

  const userPrompt = `Target keyword: "${keyword}"

Competitor articles:
${competitorSummary}

People Also Ask:
${paaQuestions.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join("\n")}

Create a comprehensive brief that covers all angles competitors miss, answers PAA questions, and targets ~${Math.round(avgWords * 1.1)} words.`;

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: true,
    response_format: { type: "json_object" },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
