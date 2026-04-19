export type SeoType = "seo" | "geo" | "aeo" | "paa" | "gpt";

export interface OutlineItem {
  id: string;
  level: 2 | 3;
  text: string;
  locked: boolean;
  guidance?: string;
  seoType?: SeoType;
  isNew?: boolean;
  markedForRemoval?: boolean;
}
