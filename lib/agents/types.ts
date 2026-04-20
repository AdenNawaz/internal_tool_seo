export type ResearchStep =
  | "init"
  | "keywords"
  | "keywords_approval"
  | "competitors"
  | "outline"
  | "outline_approval"
  | "writing"
  | "complete";

export interface KeywordData {
  keyword: string;
  volume: number;
  kd: number;
  intent: string;
}

export interface CompetitorData {
  url: string;
  title: string;
  wordCount?: number;
  keyPoints?: string[];
}

export type AeoFormat = "definition" | "list" | "steps" | "number";

export interface OutlineItem {
  id: string;
  level: 2 | 3;
  text: string;
  type: "seo" | "geo" | "aeo" | "general";
  aeoFormat?: AeoFormat;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResearchState {
  topic: string;
  country: string;
  contentType: "blog" | "landing-page";
  primaryKeyword: string;
  secondaryKeywords: KeywordData[];
  keywordsApproved: boolean;
  competitorUrls: string[];
  competitorData: CompetitorData[];
  outline: OutlineItem[];
  outlineApproved: boolean;
  articleContent: string;
  articleId: string | null;
  currentStep: ResearchStep;
  messages: ChatMessage[];
}

export type SSEEvent =
  | { type: "text"; delta: string }
  | { type: "step"; step: ResearchStep; label: string }
  | { type: "keywords"; keywords: KeywordData[] }
  | { type: "competitors"; competitors: CompetitorData[] }
  | { type: "outline"; outline: OutlineItem[] }
  | { type: "article_saved"; articleId: string }
  | { type: "done"; state: Partial<ResearchState> }
  | { type: "error"; message: string };
