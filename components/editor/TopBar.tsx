"use client";

import { PanelLeft, Sparkles } from "lucide-react";
import type { DocumentMeta, MeetingGenerationParams } from "@/types";
import { cn } from "@/lib/utils";
import MeetingRecorder from "@/components/editor/MeetingRecorder";

interface TopBarProps {
  meta: DocumentMeta;
  isSaving: boolean;
  isMeetingGenerating: boolean;
  onGenerateMeetingSummary: (params: MeetingGenerationParams) => void;
  onToggleSidebar: () => void;
}

export default function TopBar({
  meta,
  isSaving,
  isMeetingGenerating,
  onGenerateMeetingSummary,
  onToggleSidebar,
}: TopBarProps): JSX.Element {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ink-800/80 bg-canvas/85 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2 text-sm text-ink-400">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-md p-1 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100"
          aria-label="Mostrar u ocultar barra lateral"
          title="Mostrar u ocultar barra lateral"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <Sparkles className="h-3.5 w-3.5 text-ai" aria-hidden />
        <span className="truncate font-medium text-ink-200">{meta.title}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-ink-500">
        <span
          className={cn(
            "flex items-center gap-1.5 transition-opacity duration-200",
            isSaving ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ai" />
          Saving
        </span>
        <span>{meta.wordCount} words</span>
        <MeetingRecorder isGenerating={isMeetingGenerating} onGenerateSummary={onGenerateMeetingSummary} />
      </div>
    </header>
  );
}
