const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was",
  "were", "been", "have", "has", "had", "will", "would", "could",
  "should", "may", "might", "shall", "they", "them", "their", "there",
  "then", "than", "when", "what", "which", "who", "how", "where",
  "here", "just", "also", "more", "most", "some", "such", "very",
  "into", "onto", "upon", "over", "under", "about", "above", "below",
  "after", "before", "during", "through", "between", "each", "every",
  "both", "many", "much", "even", "still", "only", "once", "your",
  "ours", "mine", "hers", "theirs", "itself", "being", "while",
  "these", "those", "other", "another", "make", "made", "making",
  "take", "took", "taking", "come", "came", "coming", "give", "gave",
  "given", "know", "knew", "known", "think", "thought", "work",
  "used", "need", "want", "well", "good", "high", "back", "down",
  "time", "year", "years", "first", "last", "next", "same", "like",
  "show", "keep", "gets", "help", "look", "turn", "move", "play",
  "hold", "write", "start", "does", "doing", "going", "puts", "sets",
  "find", "finds", "found", "provide", "provides", "provided",
  "include", "includes", "included", "using", "based", "across",
  "without", "within", "however", "therefore", "because", "since",
  "although", "whether", "either", "neither", "always", "never",
  "often", "sometimes", "usually", "really", "quite", "rather",
  "simply", "already", "again", "away", "must", "long", "large",
  "small", "different", "important", "available", "possible",
  "specific", "certain", "following", "number", "part", "place",
  "point", "right", "left", "true", "false", "open", "close",
  "three", "four", "five", "six", "seven", "eight", "nine", "zero",
]);

function walkBlocks(blocks: unknown[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (Array.isArray(b.content)) {
      for (const inline of b.content as Record<string, unknown>[]) {
        if (typeof inline.text === "string") parts.push(inline.text);
      }
    }
    if (Array.isArray(b.children) && b.children.length > 0) {
      parts.push(walkBlocks(b.children as unknown[]));
    }
  }
  return parts.join(" ");
}

export function extractTextFromBlocks(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return walkBlocks(content);
}

export function extractKeywords(content: unknown): string[] {
  const text = extractTextFromBlocks(content).toLowerCase();
  const words = text.match(/\b[a-z]{4,}\b/g) ?? [];

  // Count frequency, skip stop words
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Sort: frequency desc, then length desc (longer = more specific)
  return Array.from(freq.keys())
    .sort((a, b) => {
      const diff = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
      return diff !== 0 ? diff : b.length - a.length;
    })
    .slice(0, 40);
}
