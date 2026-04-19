"use client";

import { useEffect, useMemo, useRef } from "react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

interface Props {
  initialContent: unknown;
  onChange: (content: unknown) => void;
  onMount?: (replaceContent: (blocks: unknown[]) => void) => void;
}

export default function BlockNoteEditorComponent({ initialContent, onChange, onMount }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useMemo(() => { // eslint-disable-line react-hooks/exhaustive-deps
    let blocks: PartialBlock[] | undefined;
    if (
      initialContent &&
      Array.isArray(initialContent) &&
      initialContent.length > 0
    ) {
      blocks = initialContent as PartialBlock[];
    }
    return BlockNoteEditor.create({ initialContent: blocks });
  }, []);

  useEffect(() => {
    if (onMount) {
      onMount((blocks) => {
        editor.replaceBlocks(editor.document, blocks as PartialBlock[]);
      });
    }
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
