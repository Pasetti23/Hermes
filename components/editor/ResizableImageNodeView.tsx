"use client";

import { useCallback, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_WIDTH_PERCENT = 15;
const MAX_WIDTH_PERCENT = 100;

type Align = "left" | "center" | "right";
type HandleSide = "left" | "right";

function parseWidthPercent(value: unknown): number {
  const match = /^([\d.]+)%$/.exec(typeof value === "string" ? value : "");
  return match ? parseFloat(match[1] ?? "100") : 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function ResizableImageNodeView({ node, updateAttributes, selected, deleteNode }: NodeViewProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [liveWidth, setLiveWidth] = useState<string | null>(null);

  const align = (node.attrs.align as Align | undefined) ?? "center";
  const width = (liveWidth ?? (node.attrs.width as string | undefined)) ?? "60%";

  const startResize = useCallback(
    (event: React.PointerEvent, side: HandleSide) => {
      event.preventDefault();
      event.stopPropagation();

      // Resize relative to the editor's content column, not the viewport —
      // this is what makes the percentage-based width behave consistently
      // regardless of sidebar state or window size.
      const container = wrapperRef.current?.parentElement;
      if (!container) return;

      const containerWidth = container.getBoundingClientRect().width;
      const startX = event.clientX;
      const startWidthPercent = parseWidthPercent(node.attrs.width);

      setIsResizing(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        // A right-side handle dragged rightward grows the image; a
        // left-side handle has to be dragged leftward to do the same
        // (mirrored), since the image's left edge would otherwise move.
        const signedDelta = side === "right" ? deltaX : -deltaX;
        const deltaPercent = (signedDelta / containerWidth) * 100;
        const next = clamp(startWidthPercent + deltaPercent, MIN_WIDTH_PERCENT, MAX_WIDTH_PERCENT);
        setLiveWidth(`${next.toFixed(1)}%`);
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        const deltaX = upEvent.clientX - startX;
        const signedDelta = side === "right" ? deltaX : -deltaX;
        const deltaPercent = (signedDelta / containerWidth) * 100;
        const finalWidth = clamp(startWidthPercent + deltaPercent, MIN_WIDTH_PERCENT, MAX_WIDTH_PERCENT);

        updateAttributes({ width: `${finalWidth.toFixed(1)}%` });
        setLiveWidth(null);
        setIsResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [node.attrs.width, updateAttributes]
  );

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={cn(
        "group relative my-2 flex",
        align === "left" && "justify-start",
        align === "center" && "justify-center",
        align === "right" && "justify-end"
      )}
      data-drag-handle
    >
      <div className="relative inline-block" style={{ width }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string | undefined) ?? ""}
          className={cn("ai-doc-image block w-full select-none", selected && "outline outline-2 outline-offset-2 outline-ai")}
          draggable={false}
        />

        {selected && (
          <>
            <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-ink-700 bg-ink-900 p-0.5 shadow-menu">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ align: "left" })}
                className={cn(
                  "rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100",
                  align === "left" && "bg-ink-800 text-ai-soft"
                )}
                title="Alinear a la izquierda"
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ align: "center" })}
                className={cn(
                  "rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100",
                  align === "center" && "bg-ink-800 text-ai-soft"
                )}
                title="Centrar"
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ align: "right" })}
                className={cn(
                  "rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100",
                  align === "right" && "bg-ink-800 text-ai-soft"
                )}
                title="Alinear a la derecha"
              >
                <AlignRight className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 h-4 w-px bg-ink-700" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => deleteNode()}
                className="rounded p-1 text-red-400 transition-colors hover:bg-red-500/10"
                title="Eliminar imagen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <span
                key={corner}
                onPointerDown={(e) => startResize(e, corner === "ne" || corner === "se" ? "right" : "left")}
                className={cn(
                  "absolute h-2.5 w-2.5 rounded-full border border-ai bg-white shadow",
                  corner === "nw" && "-left-1 -top-1 cursor-nwse-resize",
                  corner === "ne" && "-right-1 -top-1 cursor-nesw-resize",
                  corner === "sw" && "-left-1 -bottom-1 cursor-nesw-resize",
                  corner === "se" && "-right-1 -bottom-1 cursor-nwse-resize"
                )}
              />
            ))}
          </>
        )}

        {isResizing && (
          <div className="pointer-events-none absolute -bottom-6 right-0 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-ink-300">
            {width}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
