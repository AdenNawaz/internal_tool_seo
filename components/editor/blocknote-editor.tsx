"use client";

import { useEffect, useMemo, useRef } from "react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

export interface CursorHeading {
  blockId: string;
  text: string;
  level: 2 | 3;
}

export interface EditorAPI {
  replaceContent: (blocks: unknown[]) => void;
  replaceSection: (headingText: string, level: number, newBlocks: unknown[]) => boolean;
  getSectionText: (headingText: string, level: number) => string;
}

interface Props {
  initialContent: unknown;
  onChange: (content: unknown) => void;
  onMount?: (api: EditorAPI) => void;
  onCursorHeading?: (heading: CursorHeading | null) => void;
}

function getBlockPlainText(block: PartialBlock): string {
  if (!block.content) return "";
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text: string }).text : ""))
      .join("");
  }
  return "";
}

export default function BlockNoteEditorComponent({ initialContent, onChange, onMount, onCursorHeading }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorHeadingRef = useRef(onCursorHeading);
  onCursorHeadingRef.current = onCursorHeading;

  const editor = useMemo(() => { // eslint-disable-line react-hooks/exhaustive-deps
    let blocks: PartialBlock[] | undefined;
    if (Array.isArray(initialContent) && initialContent.length > 0) {
      blocks = initialContent as PartialBlock[];
    }
    return BlockNoteEditor.create({ initialContent: blocks });
  }, []);

  useEffect(() => {
    if (!onMount) return;

    const api: EditorAPI = {
      replaceContent: (blocks) => {
        editor.replaceBlocks(editor.document, blocks as PartialBlock[]);
      },

      replaceSection: (headingText, level, newBlocks) => {
        const all = editor.document;
        const headingIdx = all.findIndex(
          (b) =>
            b.type === "heading" &&
            (b.props as Record<string, unknown>).level === level &&
            getBlockPlainText(b).trim() === headingText.trim()
        );
        if (headingIdx === -1) return false;

        // Find end of section: next heading at same or higher level (lower number)
        let endIdx = headingIdx + 1;
        while (endIdx < all.length) {
          const b = all[endIdx];
          if (b.type === "heading" && ((b.props as Record<string, unknown>).level as number) <= level) break;
          endIdx++;
        }

        const contentBlocks = all.slice(headingIdx + 1, endIdx);
        if (contentBlocks.length === 0) {
          editor.insertBlocks(newBlocks as PartialBlock[], all[headingIdx], "after");
        } else {
          editor.replaceBlocks(contentBlocks, newBlocks as PartialBlock[]);
        }
        return true;
      },

      getSectionText: (headingText, level) => {
        const all = editor.document;
        const headingIdx = all.findIndex(
          (b) =>
            b.type === "heading" &&
            (b.props as Record<string, unknown>).level === level &&
            getBlockPlainText(b).trim() === headingText.trim()
        );
        if (headingIdx === -1) return "";

        let endIdx = headingIdx + 1;
        while (endIdx < all.length) {
          const b = all[endIdx];
          if (b.type === "heading" && ((b.props as Record<string, unknown>).level as number) <= level) break;
          endIdx++;
        }

        return all
          .slice(headingIdx + 1, endIdx)
          .map(getBlockPlainText)
          .join("\n\n");
      },
    };

    onMount(api);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Track cursor position to detect heading blocks
  useEffect(() => {
    if (!onCursorHeading) return;

    // Access tiptap editor for selection events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;

    const handleSelection = () => {
      try {
        const pos = editor.getTextCursorPosition();
        const block = pos?.block;
        if (block?.type === "heading") {
          const level = (block.props as Record<string, unknown>).level as number;
          if (level === 2 || level === 3) {
            onCursorHeadingRef.current?.({
              blockId: block.id,
              text: getBlockPlainText(block),
              level: level as 2 | 3,
            });
            return;
          }
        }
        onCursorHeadingRef.current?.(null);
      } catch {
        onCursorHeadingRef.current?.(null);
      }
    };

    tiptap.on("selectionUpdate", handleSelection);
    return () => { tiptap.off("selectionUpdate", handleSelection); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="blocknote-wrapper -mx-[54px]">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          onChangeRef.current(editor.document);
        }}
      />
    </div>
  );
}
