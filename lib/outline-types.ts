export type SeoType = "seo" | "geo" | "aeo" | "paa" | "gpt";
export type AeoFormat = "definition" | "list" | "steps" | "number";

export interface OutlineItem {
  id: string;
  level: 2 | 3;
  text: string;
  locked: boolean;
  guidance?: string;
  seoType?: SeoType;
  aeoFormat?: AeoFormat;
  isNew?: boolean;
  markedForRemoval?: boolean;
}
