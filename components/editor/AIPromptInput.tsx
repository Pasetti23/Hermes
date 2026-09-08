"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIPromptInputProps {
  anchorRect: DOMRect | null;
  mode: "generate" | "transform";
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export default function AIPromptInput({ anchorRect, mode, onSubmit, onClose }: AIPromptInputProps): JSX.Element {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const top = anchorRect ? anchorRect.bottom + 8 : 120;
  const left = anchorRect ? Math.max(16, anchorRect.left) : 16;

  const style: React.CSSProperties = {
    position: "fixed",
    top,
    left,
  };

  return (
    <div
      ref={rootRef}
      style={style}
      className="z-40 w-[26rem] max-w-[90vw] rounded-xl border border-ai/40 bg-ink-900 p-1.5 shadow-ai-glow animate-fade-in"
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Sparkles className="ml-2 h-4 w-4 shrink-0 text-ai-soft" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder={
            mode === "transform"
              ? "Tell AI what to do with the selection…"
              : "Ask AI to write something…"
          }
          className="h-9 flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 outline-none"
        />
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
            value.trim().length === 0 ? "bg-ink-800 text-ink-600" : "bg-ai text-white hover:bg-ai-soft"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
