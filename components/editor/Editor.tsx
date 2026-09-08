"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useCompletion } from "ai/react";
import { buildEditorExtensions } from "@/lib/tiptap/extensions";
import {
  deleteSlashQuery,
  findSlashQueryRange,
  getSelectionRange,
  getSelectionScreenRect,
  getSelectionText,
  getSurroundingContext,
  insertTextBelow,
  markdownBlockToHtml,
  meetingMarkdownToHtml,
  replaceRangeWithText,
} from "@/lib/tiptap/helpers";
import { ALL_SLASH_COMMANDS } from "@/lib/ai/actions";
import type {
  AIActionKey,
  AIStreamState,
  MeetingGenerationParams,
  SelectionRange,
  SlashCommandItem,
} from "@/types";
import AICommandMenu from "@/components/editor/AICommandMenu";
import AIBubbleMenu from "@/components/editor/AIBubbleMenu";
import AIPromptInput from "@/components/editor/AIPromptInput";
import AIStreamRenderer from "@/components/editor/AIStreamRenderer";

const AI_REQUEST_TIMEOUT_MS = 30000;
const MEETING_REQUEST_TIMEOUT_MS = 90000;

interface EditorProps {
  initialContent: string;
  onTitleChange: (title: string) => void;
  onTextUpdate: (plainText: string) => void;
  onPersistContent: (html: string) => void;
  onMeetingGeneratingChange?: (isGenerating: boolean) => void;
}

export interface EditorHandle {
  generateMeetingSummary: (params: MeetingGenerationParams) => void;
}

interface PendingRequest {
  action: AIActionKey;
  mode: "generate" | "transform";
  prompt: string;
  context?: string;
  tone?: string;
  language?: string;
  selection: SelectionRange;
}

interface AIRequestMeta {
  action: AIActionKey;
  selection: SelectionRange;
  anchorRect: DOMRect;
  originText: string;
}

const EMPTY_AI_STATE: AIStreamState = {
  status: "idle",
  action: null,
  originText: "",
  streamedText: "",
  selection: null,
  anchorRect: null,
  error: null,
};

function safeCoordsRect(editor: ReturnType<typeof useEditor>, pos: number): DOMRect {
  try {
    if (!editor) throw new Error("editor not ready");
    const coords = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size));
    return new DOMRect(coords.left, coords.bottom, 0, 0);
  } catch {
    return new DOMRect(24, 96, 0, 0);
  }
}

/**
 * Wraps the global fetch with a hard timeout so a stalled or silently-hanging
 * connection to the AI provider never leaves the UI stuck in "streaming"
 * forever. Combines our own AbortController with whatever signal the AI SDK
 * hook passes in (e.g. from its own `stop()`), so both cancellation paths work.
 */
function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      window.clearTimeout(timeoutId);
    });
  };
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { initialContent, onTitleChange, onTextUpdate, onPersistContent, onMeetingGeneratingChange },
  ref
) {
  const [requestMeta, setRequestMeta] = useState<AIRequestMeta | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashRange, setSlashRange] = useState<SelectionRange | null>(null);
  const [slashRect, setSlashRect] = useState<DOMRect | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptRect, setPromptRect] = useState<DOMRect | null>(null);
  const [promptMode, setPromptMode] = useState<"generate" | "transform">("generate");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastRequestRef = useRef<PendingRequest | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const meetingBasePosRef = useRef<number | null>(null);

  // Guards every AI/meeting-triggered Tiptap mutation. While true, onUpdate
  // skips slash-command detection so a streamed token that happens to
  // contain "/" can't mount the AICommandMenu mid-mutation — that race is
  // what produced the "insertBefore: node is not a child of this node"
  // crash: React trying to mount a new sibling into containerRef while
  // ProseMirror was mid-rewrite of the EditorContent subtree.
  const isProgrammaticUpdateRef = useRef(false);

  // Throttles how often the live meeting-summary stream is allowed to
  // rewrite the canvas. Without this, every streamed token triggered a full
  // deleteRange+insertContentAt transaction — dozens of DOM rewrites per
  // second — which is what actually created the race above.
  const meetingCompletionRef = useRef("");
  const meetingLastRenderedRef = useRef("");
  const meetingRenderTimeoutRef = useRef<number | null>(null);
  const MEETING_RENDER_THROTTLE_MS = 150;

  const inlineFetch = useMemo(() => createTimeoutFetch(AI_REQUEST_TIMEOUT_MS), []);
  const meetingFetch = useMemo(() => createTimeoutFetch(MEETING_REQUEST_TIMEOUT_MS), []);

  // Runs a Tiptap mutation while isProgrammaticUpdateRef is true, so
  // onUpdate knows to skip slash-command detection for this transaction.
  const runProgrammaticEdit = useCallback((fn: () => void) => {
    isProgrammaticUpdateRef.current = true;
    try {
      fn();
    } finally {
      isProgrammaticUpdateRef.current = false;
    }
  }, []);

  // Official Vercel AI SDK hook, using its default "data" stream protocol —
  // this matches `result.toDataStreamResponse()` on the server exactly, and
  // (unlike the plain-text protocol) properly surfaces mid-stream provider
  // errors instead of swallowing them silently.
  const {
    completion,
    complete,
    error: completionError,
    isLoading: isCompletionLoading,
    stop: stopCompletion,
    setCompletion,
  } = useCompletion({
    api: "/api/ai/completion",
    streamProtocol: "data",
    fetch: inlineFetch,
  });

  const {
    completion: meetingCompletion,
    complete: completeMeeting,
    isLoading: isMeetingLoading,
    setCompletion: setMeetingCompletion,
  } = useCompletion({
    api: "/api/ai/completion",
    streamProtocol: "data",
    fetch: meetingFetch,
  });

  const editor = useEditor({
    extensions: buildEditorExtensions(),
    content: initialContent,
    autofocus: "end",
    editorProps: {
      attributes: {
        class: "prose-none focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onTextUpdate(ed.getText());

      const firstHeading = ed.state.doc.firstChild;
      if (firstHeading && firstHeading.type.name === "heading") {
        onTitleChange(firstHeading.textContent || "Untitled");
      }

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        onPersistContent(ed.getHTML());
      }, 400);

      if (isProgrammaticUpdateRef.current) {
        // AI/meeting-generated text can legitimately contain a "/" (dates,
        // fractions, paths). Opening the slash menu off a programmatic
        // rewrite would mount a new floating element while ProseMirror is
        // still mutating this same subtree — skip it entirely here.
        return;
      }

      const query = findSlashQueryRange(ed);
      if (query) {
        const raw = ed.state.doc.textBetween(query.from, query.to, "\n").replace(/^\//, "");
        setSlashQuery(raw);
        setSlashRange(query);
        const rect = ed.view.coordsAtPos(query.from);
        setSlashRect(new DOMRect(rect.left, rect.bottom, 0, 0));
        setSlashOpen(true);
      } else {
        setSlashOpen(false);
      }
    },
    immediatelyRender: false,
  });

  // Content hydration is handled entirely via `initialContent` (the parent
  // passes the active WorkspaceDocument's content and remounts this whole
  // component with a fresh `key` whenever the selected document changes),
  // so no internal localStorage read is needed here anymore.

  const runAIStream = useCallback(
    (req: PendingRequest) => {
      if (!editor) return;
      lastRequestRef.current = req;

      const anchorRect =
        req.selection.from !== req.selection.to
          ? getSelectionScreenRect(editor) ?? safeCoordsRect(editor, req.selection.from)
          : safeCoordsRect(editor, req.selection.from);

      setRequestMeta({
        action: req.action,
        selection: req.selection,
        anchorRect,
        originText: req.context ?? "",
      });

      void complete(req.prompt, {
        body: {
          action: req.action,
          context: req.context,
          mode: req.mode,
          tone: req.tone,
          language: req.language,
        },
      });
    },
    [editor, complete]
  );

  const closeOverlays = useCallback(() => {
    setSlashOpen(false);
    setPromptOpen(false);
  }, []);

  const handleSlashSelect = useCallback(
    (item: SlashCommandItem) => {
      if (!editor || !slashRange) return;

      if (item.group === "basic") {
        deleteSlashQuery(editor, slashRange.from, slashRange.to);
        editor.chain().focus().insertContent(markdownBlockToHtml(item.key)).run();
        setSlashOpen(false);
        return;
      }

      const pos = slashRange.from;
      deleteSlashQuery(editor, slashRange.from, slashRange.to);
      setSlashOpen(false);

      if (item.key === "generate") {
        const rect = editor.view.coordsAtPos(pos);
        setPromptMode("generate");
        setPromptRect(new DOMRect(rect.left, rect.bottom, 0, 0));
        setPromptOpen(true);
        return;
      }

      const context = getSurroundingContext(editor, pos);
      runAIStream({
        action: item.key as AIActionKey,
        mode: "generate",
        prompt: "",
        context,
        selection: { from: pos, to: pos },
      });
    },
    [editor, slashRange, runAIStream]
  );

  const handleBubbleAction = useCallback(
    (action: AIActionKey, extra?: { tone?: string; language?: string }) => {
      if (!editor) return;
      const selection = getSelectionRange(editor);
      const context = getSelectionText(editor, selection);
      if (!context) return;
      runAIStream({
        action,
        mode: "transform",
        prompt: "",
        context,
        tone: extra?.tone,
        language: extra?.language,
        selection,
      });
    },
    [editor, runAIStream]
  );

  const handleBubbleAskAI = useCallback(() => {
    if (!editor) return;
    const rect = getSelectionScreenRect(editor);
    setPromptMode("transform");
    setPromptRect(rect ?? safeCoordsRect(editor, editor.state.selection.from));
    setPromptOpen(true);
  }, [editor]);

  const handleCmdJ = useCallback(() => {
    if (!editor) return;
    const selection = getSelectionRange(editor);
    const hasSelection = selection.from !== selection.to;
    const rect = hasSelection
      ? getSelectionScreenRect(editor) ?? safeCoordsRect(editor, selection.from)
      : safeCoordsRect(editor, selection.from);
    setPromptMode(hasSelection ? "transform" : "generate");
    setPromptRect(rect);
    setPromptOpen(true);
  }, [editor]);

  const handlePromptSubmit = useCallback(
    (text: string) => {
      if (!editor) return;
      setPromptOpen(false);
      const selection = getSelectionRange(editor);
      const hasSelection = selection.from !== selection.to;

      if (promptMode === "transform" && hasSelection) {
        const context = getSelectionText(editor, selection);
        runAIStream({
          action: "custom",
          mode: "transform",
          prompt: text,
          context,
          selection,
        });
      } else {
        const context = getSurroundingContext(editor, selection.from);
        runAIStream({
          action: "custom",
          mode: "generate",
          prompt: text,
          context,
          selection,
        });
      }
    },
    [editor, promptMode, runAIStream]
  );

  const handleAccept = useCallback(() => {
    if (!editor || !requestMeta) return;
    if (requestMeta.selection.from === requestMeta.selection.to) {
      insertTextBelow(editor, requestMeta.selection.from, completion);
    } else {
      replaceRangeWithText(editor, requestMeta.selection, completion);
    }
    setCompletion("");
    setRequestMeta(null);
  }, [editor, requestMeta, completion, setCompletion]);

  const handleInsertBelow = useCallback(() => {
    if (!editor || !requestMeta) return;
    insertTextBelow(editor, requestMeta.selection.to, completion);
    setCompletion("");
    setRequestMeta(null);
  }, [editor, requestMeta, completion, setCompletion]);

  const handleRetry = useCallback(() => {
    if (!lastRequestRef.current) return;
    runAIStream(lastRequestRef.current);
  }, [runAIStream]);

  const handleDiscard = useCallback(() => {
    stopCompletion();
    setCompletion("");
    setRequestMeta(null);
  }, [stopCompletion, setCompletion]);

  const generateMeetingSummary = useCallback(
    (params: MeetingGenerationParams) => {
      if (!editor) return;
      const trimmed = params.transcript.trim();
      if (trimmed.length === 0) return;

      meetingLastRenderedRef.current = "";
      meetingCompletionRef.current = "";

      runProgrammaticEdit(() => {
        editor.chain().focus("end").run();
        const basePos = editor.state.doc.content.size;
        meetingBasePosRef.current = basePos;
        editor.chain().insertContentAt(basePos, "<p>Generando notas de la reunión…</p>").run();
      });

      onMeetingGeneratingChange?.(true);
      setMeetingCompletion("");

      void completeMeeting("", {
        body: {
          action: "summarize_meeting",
          context: trimmed,
          mode: "generate",
          meetingType: params.meetingType,
          customContext: params.customContext,
          formatInstructions: params.formatInstructions,
          styleInstructions: params.styleInstructions,
        },
      })
        .then((finalText) => {
          if (!editor || meetingBasePosRef.current === null) return;
          const basePosNow = meetingBasePosRef.current;
          const html =
            finalText && finalText.trim().length > 0
              ? meetingMarkdownToHtml(finalText)
              : "<p>⚠️ No se recibió contenido del asistente de reuniones. Intenta nuevamente.</p>";
          runProgrammaticEdit(() => {
            const currentEnd = editor.state.doc.content.size;
            editor.chain().deleteRange({ from: basePosNow, to: currentEnd }).insertContentAt(basePosNow, html).run();
          });
          onPersistContent(editor.getHTML());
        })
        .catch((err: unknown) => {
          if (!editor || meetingBasePosRef.current === null) return;
          const basePosNow = meetingBasePosRef.current;
          const message =
            err instanceof Error ? err.message : "Ocurrió un error generando el resumen de la reunión.";
          runProgrammaticEdit(() => {
            const currentEnd = editor.state.doc.content.size;
            editor
              .chain()
              .deleteRange({ from: basePosNow, to: currentEnd })
              .insertContentAt(basePosNow, `<p>⚠️ ${message}</p>`)
              .run();
          });
        })
        .finally(() => {
          if (meetingRenderTimeoutRef.current !== null) {
            window.clearTimeout(meetingRenderTimeoutRef.current);
            meetingRenderTimeoutRef.current = null;
          }
          meetingBasePosRef.current = null;
          onMeetingGeneratingChange?.(false);
        });
    },
    [editor, completeMeeting, onMeetingGeneratingChange, onPersistContent, setMeetingCompletion, runProgrammaticEdit]
  );

  // Live canvas insertion: rewrite the trailing block while the meeting
  // summary streams in, throttled to at most one Tiptap transaction every
  // MEETING_RENDER_THROTTLE_MS. Reading the latest text from a ref (rather
  // than closing over `meetingCompletion`) means the throttle always
  // flushes the freshest text, not whatever value happened to be current
  // when the timeout was scheduled.
  useEffect(() => {
    meetingCompletionRef.current = meetingCompletion;
  }, [meetingCompletion]);

  useEffect(() => {
    if (!editor || !isMeetingLoading || meetingBasePosRef.current === null) return;
    if (meetingRenderTimeoutRef.current !== null) return;

    meetingRenderTimeoutRef.current = window.setTimeout(() => {
      meetingRenderTimeoutRef.current = null;
      if (!editor || meetingBasePosRef.current === null) return;

      const latest = meetingCompletionRef.current;
      if (latest === meetingLastRenderedRef.current) return;
      meetingLastRenderedRef.current = latest;

      const basePos = meetingBasePosRef.current;
      const currentEnd = editor.state.doc.content.size;
      if (currentEnd < basePos) return;

      const html = latest.length > 0 ? meetingMarkdownToHtml(latest) : "<p>Generando notas de la reunión…</p>";
      runProgrammaticEdit(() => {
        editor.chain().deleteRange({ from: basePos, to: currentEnd }).insertContentAt(basePos, html).run();
      });
    }, MEETING_RENDER_THROTTLE_MS);
  }, [meetingCompletion, isMeetingLoading, editor, runProgrammaticEdit]);

  useImperativeHandle(ref, () => ({ generateMeetingSummary }), [generateMeetingSummary]);

  const aiState: AIStreamState = requestMeta
    ? {
        status: isCompletionLoading ? "streaming" : completionError ? "error" : "complete",
        action: requestMeta.action,
        originText: requestMeta.originText,
        streamedText: completion,
        selection: requestMeta.selection,
        anchorRect: requestMeta.anchorRect,
        error: completionError ? completionError.message : null,
      }
    : EMPTY_AI_STATE;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const isModJ = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j";
      if (isModJ) {
        event.preventDefault();
        handleCmdJ();
        return;
      }
      if (event.key === "Escape") {
        if (aiState.status !== "idle") {
          handleDiscard();
        }
        closeOverlays();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [handleCmdJ, closeOverlays, handleDiscard, aiState.status]);

  useEffect(() => {
    return () => {
      stopCompletion();
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) {
    return <div className="h-40 animate-pulse rounded-lg bg-ink-900/40" />;
  }

  const filteredSlashItems = ALL_SLASH_COMMANDS.filter((item) => {
    if (!slashQuery) return true;
    const q = slashQuery.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.keywords.some((k) => k.includes(q));
  });

  return (
    <div ref={containerRef} tabIndex={-1} className="relative">
      <AIBubbleMenu editor={editor} disabled={aiState.status === "streaming"} onAction={handleBubbleAction} onAskAI={handleBubbleAskAI} />

      <EditorContent editor={editor} />

      {slashOpen && slashRect && (
        <AICommandMenu
          items={filteredSlashItems}
          anchorRect={slashRect}
          query={slashQuery}
          onSelect={handleSlashSelect}
          onClose={() => setSlashOpen(false)}
        />
      )}

      {promptOpen && promptRect && (
        <AIPromptInput
          anchorRect={promptRect}
          mode={promptMode}
          onSubmit={handlePromptSubmit}
          onClose={() => setPromptOpen(false)}
        />
      )}

      {aiState.status !== "idle" && aiState.anchorRect && (
        <AIStreamRenderer
          state={aiState}
          onAccept={handleAccept}
          onInsertBelow={handleInsertBelow}
          onRetry={handleRetry}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );
});

export default Editor;
