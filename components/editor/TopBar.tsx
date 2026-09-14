"use client";

import { Download, Minus, PanelLeft, Plus, Sparkles } from "lucide-react";
import type { DocumentMeta, MeetingGenerationParams } from "@/types";
import { cn } from "@/lib/utils";
import MeetingRecorder from "@/components/editor/MeetingRecorder";
import ImageUploadButton from "@/components/editor/ImageUploadButton";
import AudioUploadButton from "@/components/editor/AudioUploadButton";

interface TopBarProps {
  meta: DocumentMeta;
  isSaving: boolean;
  isMeetingGenerating: boolean;
  onGenerateMeetingSummary: (params: MeetingGenerationParams) => void;
  onToggleSidebar: () => void;
  getCursorPosition: () => number;
  onInsertAtPosition: (pos: number, html: string) => void;
  onExportPdf: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export default function TopBar({
  meta,
  isSaving,
  isMeetingGenerating,
  onGenerateMeetingSummary,
  onToggleSidebar,
  getCursorPosition,
  onInsertAtPosition,
  onExportPdf,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: TopBarProps): JSX.Element {
  return (
    <header className="no-print sticky top-0 z-30 flex h-12 items-center justify-between border-b border-ink-800/80 bg-canvas/85 px-4 backdrop-blur sm:px-6">
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
      <div className="flex items-center gap-2.5 text-xs text-ink-500">
        <span
          className={cn(
            "flex items-center gap-1.5 transition-opacity duration-200",
            isSaving ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ai" />
          Saving
        </span>
        <span className="hidden sm:inline">{meta.wordCount} words</span>

        <div className="flex items-center gap-0.5 rounded-md border border-ink-700 px-0.5 py-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoomLevel <= 50}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
            aria-label="Alejar"
            title="Alejar (Ctrl -)"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onZoomReset}
            className="min-w-[3.2rem] rounded px-1 text-center text-[11px] text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            title="Restablecer zoom (Ctrl 0)"
          >
            {zoomLevel}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoomLevel >= 200}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
            aria-label="Acercar"
            title="Acercar (Ctrl +)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <ImageUploadButton getCursorPosition={getCursorPosition} onInsertAtPosition={onInsertAtPosition} />
        <AudioUploadButton getCursorPosition={getCursorPosition} onInsertAtPosition={onInsertAtPosition} />
        <MeetingRecorder isGenerating={isMeetingGenerating} onGenerateSummary={onGenerateMeetingSummary} />
        <button
          type="button"
          onClick={onExportPdf}
          className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-transparent px-2.5 py-1 text-xs font-medium text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-50"
          title="Descargar este documento como PDF"
        >
          <Download className="h-3.5 w-3.5" />
          PDF
        </button>
      </div>
    </header>
  );
}
