interface StyledText {
  type: "text";
  text: string;
  styles: Record<string, boolean>;
}

function parseInline(text: string): StyledText[] {
  const result: StyledText[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      result.push({ type: "text", text: text.slice(last, m.index), styles: {} });
    }
    if (m[0].startsWith("**")) {
      result.push({ type: "text", text: m[2], styles: { bold: true } });
    } else {
      result.push({ type: "text", text: m[3], styles: { italic: true } });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    result.push({ type: "text", text: text.slice(last), styles: {} });
  }

  return result.length > 0 ? result : [{ type: "text", text, styles: {} }];
}

export function markdownToBlocks(markdown: string): Record<string, unknown>[] {
  const lines = markdown.split("\n");
  const blocks: Record<string, unknown>[] = [];

  for (const line of lines) {
    if (/^## /.test(line)) {
      blocks.push({ type: "heading", props: { level: 2 }, content: parseInline(line.replace(/^## /, "")) });
    } else if (/^### /.test(line)) {
      blocks.push({ type: "heading", props: { level: 3 }, content: parseInline(line.replace(/^### /, "")) });
    } else if (/^- /.test(line)) {
      blocks.push({ type: "bulletListItem", props: {}, content: parseInline(line.replace(/^- /, "")) });
    } else if (line.trim()) {
      blocks.push({ type: "paragraph", props: {}, content: parseInline(line) });
    }
  }

  return blocks.length > 0
    ? blocks
    : [{ type: "paragraph", props: {}, content: [{ type: "text", text: "", styles: {} }] }];
}
