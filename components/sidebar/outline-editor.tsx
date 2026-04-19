"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Trash2, Plus } from "lucide-react";
import type { OutlineItem } from "@/lib/outline-types";

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  seo: { label: "SEO", cls: "bg-blue-100 text-blue-700" },
  geo: { label: "GEO", cls: "bg-purple-100 text-purple-700" },
  aeo: { label: "AEO", cls: "bg-green-100 text-green-700" },
  paa: { label: "PAA", cls: "bg-amber-100 text-amber-700" },
  gpt: { label: "GPT", cls: "bg-teal-100 text-teal-700" },
};

interface ItemProps {
  item: OutlineItem;
  selected: boolean;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onLevelToggle: () => void;
  onDelete: () => void;
}

function SortableItem({ item, selected, onSelect, onTextChange, onLevelToggle, onDelete }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.locked || item.markedForRemoval,
  });

  return (
    <div className={item.level === 3 ? "ml-5" : ""}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        onClick={onSelect}
        className={`group flex items-center gap-1 rounded px-1 py-1 cursor-pointer ${
          item.markedForRemoval
            ? "opacity-50 line-through bg-red-50"
            : selected
            ? "bg-blue-50"
            : "hover:bg-gray-50"
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className={`text-gray-300 hover:text-gray-500 flex-shrink-0 ${item.locked || item.markedForRemoval ? "invisible" : ""}`}
        >
          <GripVertical size={13} />
        </button>

        <input
          value={item.text}
          onChange={(e) => onTextChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={item.markedForRemoval}
          className={`flex-1 min-w-0 bg-transparent outline-none border-b border-transparent focus:border-gray-300 ${
            item.level === 2 ? "text-[12px] font-medium text-gray-800" : "text-[11px] text-gray-500"
          } ${item.markedForRemoval ? "pointer-events-none" : ""}`}
          placeholder="Heading…"
        />

        {item.isNew && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-900 text-white flex-shrink-0">NEW</span>
        )}

        {item.seoType && TYPE_BADGE[item.seoType] && (
          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded flex-shrink-0 ${TYPE_BADGE[item.seoType].cls}`}>
            {TYPE_BADGE[item.seoType].label}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {item.locked ? (
            <Lock size={11} className="text-gray-300" />
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onLevelToggle(); }}
                className="text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                title="Toggle H2/H3"
              >
                H{item.level}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* AEO hint shown when selected */}
      {selected && item.seoType === "aeo" && item.guidance && (
        <p className="text-[9px] text-green-600 ml-6 mt-0.5 leading-tight">{item.guidance}</p>
      )}
    </div>
  );
}

interface Props {
  items: OutlineItem[];
  onItemsChange: (items: OutlineItem[]) => void;
  onGenerateContent: () => void;
  generating: boolean;
  generationStatus: string;
  generated: boolean;
}

export function OutlineEditor({ items, onItemsChange, onGenerateContent, generating, generationStatus, generated }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (items[newIdx]?.locked) return;
    onItemsChange(arrayMove(items, oldIdx, newIdx));
  }

  function addHeading(level: 2 | 3) {
    const newItem: OutlineItem = {
      id: crypto.randomUUID(),
      level,
      text: "",
      locked: false,
      seoType: "seo",
    };
    const selectedIdx = selectedId ? items.findIndex((i) => i.id === selectedId) : items.length - 1;
    const insertAt = selectedIdx >= 0 ? selectedIdx + 1 : items.length;
    const newItems = [...items.slice(0, insertAt), newItem, ...items.slice(insertAt)];
    onItemsChange(newItems);
    setSelectedId(newItem.id);
  }

  const visibleItems = items.filter((i) => !i.markedForRemoval);
  const removedItems = items.filter((i) => i.markedForRemoval);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Outline</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {visibleItems.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onSelect={() => setSelectedId(item.id)}
                onTextChange={(text) =>
                  onItemsChange(items.map((i) => (i.id === item.id ? { ...i, text } : i)))
                }
                onLevelToggle={() =>
                  onItemsChange(items.map((i) => (i.id === item.id ? { ...i, level: i.level === 2 ? 3 : 2 } : i)))
                }
                onDelete={() => onItemsChange(items.filter((i) => i.id !== item.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Sections marked for removal */}
      {removedItems.length > 0 && (
        <div className="space-y-0.5 pt-1">
          <p className="text-[9px] font-semibold text-red-400 uppercase tracking-wide">Marked for removal</p>
          {removedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-1">
              <span className="flex-1 text-[11px] text-red-400 line-through truncate">{item.text}</span>
              <button
                onClick={() => onItemsChange(items.filter((i) => i.id !== item.id))}
                className="text-[9px] text-red-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-0.5">
        <button
          onClick={() => addHeading(2)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus size={11} /> Add H2
        </button>
        <button
          onClick={() => addHeading(3)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus size={11} /> Add H3
        </button>
      </div>

      <button
        onClick={onGenerateContent}
        disabled={generating || items.filter((i) => !i.markedForRemoval).length === 0}
        className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors mt-1"
      >
        {generating
          ? generationStatus || "Generating…"
          : generated
          ? "Regenerate content"
          : "Generate content"}
      </button>
    </div>
  );
}
