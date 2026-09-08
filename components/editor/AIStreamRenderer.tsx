"use client";

import { Check, CornerDownRight, RotateCcw, Sparkles, X } from "lucide-react";
import type { AIStreamState } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AIStreamRendererProps {
  state: AIStreamState;
  onAccept: () => void;
  onInsertBelow: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

const POPOVER_WIDTH_PX = 448; // matches w-[28rem] below
const GAP_PX = 10;
const MIN_COMFORTABLE_SPACE_PX = 220; // header + a few lines + footer, roughly

/**
 * Picks where the popover should anchor vertically relative to the
 * selection, so it never gets clipped by the bottom of the viewport (e.g.
 * behind the OS taskbar) or the top of the window:
 * - Enough room below the selection → anchor below it (previous behavior).
 * - Not enough below, but enough above → flip and anchor above it, growing
 *   upward from the selection's top edge (position via `bottom`, so we
 *   never need to know the popover's exact height up front).
 * - Neither side has enough room → center it vertically in the viewport.
 * Combined with `max-h-[50vh] overflow-y-auto` on the scrollable body, the
 * popover can never exceed the viewport regardless of which branch fires.
 */
function computeVerticalStyle(anchorRect: DOMRect): React.CSSProperties {
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;

  if (spaceBelow >= MIN_COMFORTABLE_SPACE_PX || spaceBelow >= spaceAbove) {
    return { top: anchorRect.bottom + GAP_PX };
  }
  if (spaceAbove >= MIN_COMFORTABLE_SPACE_PX) {
    return { bottom: viewportHeight - anchorRect.top + GAP_PX };
  }
  return { top: "50%", transform: "translateY(-50%)" };
}

export default function AIStreamRenderer({
  state,
  onAccept,
  onInsertBelow,
  onRetry,
  onDiscard,
}: AIStreamRendererProps): JSX.Element | null {
  if (!state.anchorRect) return null;

  const isStreaming = state.status === "streaming";
  const isError = state.status === "error";
  const isComplete = state.status === "complete";

  const verticalStyle = computeVerticalStyle(state.anchorRect);
  const left = Math.min(Math.max(16, state.anchorRect.left), window.innerWidth - POPOVER_WIDTH_PX - 16);

  const style: React.CSSProperties = {
    position: "fixed",
    left,
    ...verticalStyle,
  };

  return (
    <div
      style={style}
      className="z-50 flex max-h-[50vh] w-[28rem] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-ai/40 bg-ink-900 shadow-ai-glow animate-fade-in"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-ink-800 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ai-soft">
          <Sparkles className="h-3.5 w-3.5" />
          {isStreaming && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ai" />
              Escribiendo…
            </span>
          )}
          {isComplete && <span>Sugerencia de IA</span>}
          {isError && <span className="text-red-400">Algo salió mal</span>}
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md p-1 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100"
          aria-label="Descartar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3 text-sm leading-relaxed text-ink-100">
        {isError ? (
          <p className="text-red-400">{state.error}</p>
        ) : state.streamedText.length === 0 && isStreaming ? (
          <div className="space-y-2">
            <div className="ai-shimmer h-3 w-11/12 rounded" />
            <div className="ai-shimmer h-3 w-4/5 rounded" />
            <div className="ai-shimmer h-3 w-3/5 rounded" />
          </div>
        ) : (
          <p className="whitespace-pre-wrap">
            {state.streamedText}
            {isStreaming && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse-dot bg-ai-soft align-middle" />}
          </p>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center gap-1.5 border-t border-ink-800 px-2.5 py-2", isStreaming && "opacity-50")}>
        {isError ? (
          <Button variant="ai" size="sm" onClick={onRetry} className="gap-1.5">
            <RotateCcw className="h-3 w-3" />
            Reintentar
          </Button>
        ) : (
          <>
            <Button variant="ai" size="sm" onClick={onAccept} disabled={isStreaming} className="gap-1.5">
              <Check className="h-3 w-3" />
              Aceptar
            </Button>
            <Button variant="outline" size="sm" onClick={onInsertBelow} disabled={isStreaming} className="gap-1.5">
              <CornerDownRight className="h-3 w-3" />
              Insertar debajo
            </Button>
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={isStreaming} className="gap-1.5">
              <RotateCcw className="h-3 w-3" />
              Reintentar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDiscard} className="ml-auto gap-1.5 text-ink-500">
              Descartar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
