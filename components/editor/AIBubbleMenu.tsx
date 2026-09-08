"use client";

import { useState } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import {
  AlignJustify,
  AlignLeft,
  AudioLines,
  Languages,
  ListTree,
  Sparkles,
  SpellCheck2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { BUBBLE_MENU_ACTIONS, LANGUAGE_OPTIONS, TONE_OPTIONS } from "@/lib/ai/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AIActionKey } from "@/types";
import { cn } from "@/lib/utils";

interface AIBubbleMenuProps {
  editor: Editor;
  disabled: boolean;
  onAction: (action: AIActionKey, extra?: { tone?: string; language?: string }) => void;
  onAskAI: () => void;
}

const ICONS: Record<string, LucideIcon> = {
  Wand2,
  SpellCheck2,
  AlignJustify,
  AlignLeft,
  ListTree,
  AudioLines,
  Languages,
};

export default function AIBubbleMenu({ editor, disabled, onAction, onAskAI }: AIBubbleMenuProps): JSX.Element {
  const [openSubmenu, setOpenSubmenu] = useState<AIActionKey | null>(null);

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: "top" }}
      shouldShow={({ from, to }) => !disabled && from !== to}
      className="z-40 flex max-w-xl flex-wrap items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 shadow-menu"
    >
      <button
        type="button"
        onClick={onAskAI}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ai-soft transition-colors hover:bg-ai/10"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Preguntar a IA
      </button>

      <span className="mx-0.5 h-4 w-px bg-ink-700" />

      {BUBBLE_MENU_ACTIONS.map((action) => {
        const Icon = ICONS[action.icon] ?? Sparkles;

        if (action.requiresInput) {
          const options: { value: string; label: string }[] =
            action.key === "change_tone"
              ? TONE_OPTIONS
              : LANGUAGE_OPTIONS.map((lang) => ({ value: lang, label: lang }));
          return (
            <DropdownMenu
              key={action.key}
              open={openSubmenu === action.key}
              onOpenChange={(open) => setOpenSubmenu(open ? action.key : null)}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {options.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() =>
                      onAction(
                        action.key,
                        action.key === "change_tone" ? { tone: opt.value } : { language: opt.value }
                      )
                    }
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <button
            key={action.key}
            type="button"
            onClick={() => onAction(action.key)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50"
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}
    </BubbleMenu>
  );
}
