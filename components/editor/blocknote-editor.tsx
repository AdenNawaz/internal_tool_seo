"use client";

import { useMemo, useRef } from "react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

interface Props {
  initialContent: unknown;
  onChange: (content: unknown) => void;
}

export default function BlockNoteEditorComponent({ initialContent, onChange }: Props) {
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
