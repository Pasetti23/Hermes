"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignJustify,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { SlashCommandItem } from "@/types";
import { cn } from "@/lib/utils";

interface AICommandMenuProps {
  items: SlashCommandItem[];
  anchorRect: DOMRect;
  query: string;
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
}

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  ListTree,
  Lightbulb,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Quote,
  Minus,
  AlignJustify,
};

export default function AICommandMenu({ items, anchorRect, query, onSelect, onClose }: AICommandMenuProps): JSX.Element {
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (items.length === 0) {
        if (event.key === "Escape") onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((prev) => (prev + 1) % items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((prev) => (prev - 1 + items.length) % items.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = items[highlighted];
        if (item) onSelect(item);
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [items, highlighted, onSelect, onClose]);

  const aiItems = useMemo(() => items.filter((i) => i.group === "ai"), [items]);
  const basicItems = useMemo(() => items.filter((i) => i.group === "basic"), [items]);

  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.bottom + 6,
    left: anchorRect.left,
  };

  if (items.length === 0) {
    return (
      <div style={style} className="z-40 w-64 rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-ink-500 shadow-menu animate-fade-in">
        No matches for &ldquo;{query}&rdquo;
      </div>
    );
  }

  let runningIndex = -1;

  return (
    <div
      ref={listRef}
      style={style}
      className="z-40 max-h-80 w-72 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-menu animate-fade-in"
      role="listbox"
    >
      {aiItems.length > 0 && (
        <div className="mb-1">
          <p className="px-2 py-1 text-[11px] font-medium text-ink-500">AI</p>
          {aiItems.map((item) => {
            runningIndex += 1;
            const idx = runningIndex;
            return (
              <CommandRow key={item.key} item={item} active={idx === highlighted} onSelect={() => onSelect(item)} onHover={() => setHighlighted(idx)} accent />
            );
          })}
        </div>
      )}
      {basicItems.length > 0 && (
        <div>
          <p className="px-2 py-1 text-[11px] font-medium text-ink-500">Blocks</p>
          {basicItems.map((item) => {
            runningIndex += 1;
            const idx = runningIndex;
            return (
              <CommandRow key={item.key} item={item} active={idx === highlighted} onSelect={() => onSelect(item)} onHover={() => setHighlighted(idx)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommandRow({
  item,
  active,
  accent,
  onSelect,
  onHover,
}: {
  item: SlashCommandItem;
  active: boolean;
  accent?: boolean;
  onSelect: () => void;
  onHover: () => void;
}): JSX.Element {
  const Icon = ICONS[item.icon] ?? Sparkles;
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-ink-800 text-ink-50" : "text-ink-300"
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          accent ? "border-ai/40 bg-ai/10 text-ai-soft" : "border-ink-700 bg-ink-800 text-ink-400"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{item.label}</span>
        <span className="text-[11px] text-ink-500">{item.description}</span>
      </span>
    </button>
  );
}
