"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopBar from "@/components/editor/TopBar";
import Sidebar from "@/components/editor/Sidebar";
import Editor, { type EditorHandle } from "@/components/editor/Editor";
import VersionStatus from "@/components/editor/VersionStatus";
import { countWords } from "@/lib/utils";
import {
  createDocument,
  createFolder,
  deleteDocument,
  getActiveDocumentId,
  listDocuments,
  moveDocument,
  renameDocument,
  setActiveDocumentId,
  updateDocumentContent,
} from "@/lib/workspace/documents";
import type { DocumentMeta, MeetingGenerationParams, WorkspaceDocument } from "@/types";

const ZOOM_STORAGE_KEY = "notion_editor_zoom";
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

export default function HomePage(): JSX.Element {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [wordCount, setWordCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isMeetingGenerating, setIsMeetingGenerating] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM_DEFAULT);

  const editorRef = useRef<EditorHandle | null>(null);
  const titleSaveTimeoutRef = useRef<number | null>(null);

  const refreshDocuments = useCallback(() => {
    setDocuments(listDocuments());
  }, []);

  // Workspace bootstrap runs once, client-side only — localStorage isn't
  // available during SSR, so `documents` starts empty and is populated here
  // to avoid a hydration mismatch.
  useEffect(() => {
    const docs = listDocuments();
    setDocuments(docs);

    const storedActiveId = getActiveDocumentId();
    const storedIsValid = !!storedActiveId && docs.some((d) => d.id === storedActiveId && !d.isFolder);
    const fallbackId = docs.find((d) => !d.isFolder)?.id ?? null;
    const resolvedId = storedIsValid ? storedActiveId : fallbackId;

    setActiveDocId(resolvedId);
    if (resolvedId) setActiveDocumentId(resolvedId);
    setWorkspaceReady(true);

    try {
      const savedZoom = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
      if (!Number.isNaN(savedZoom) && savedZoom >= ZOOM_MIN && savedZoom <= ZOOM_MAX) {
        setZoomLevel(savedZoom);
      }
    } catch {
      // localStorage unavailable — just keep the default zoom
    }
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    setZoomLevel((prev) => {
      const next = delta === 0 ? ZOOM_DEFAULT : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta));
      try {
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Ctrl/Cmd +/-/0 zoom the editor content itself (like Word/a PDF viewer),
  // instead of falling through to the browser's own native page zoom.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        adjustZoom(ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        adjustZoom(-ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        adjustZoom(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustZoom]);

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === activeDocId) ?? null,
    [documents, activeDocId]
  );

  const documentMeta: DocumentMeta = useMemo(
    () => ({
      id: activeDocument?.id ?? "",
      title: activeDocument?.title ?? "Untitled",
      updatedAt: activeDocument ? new Date(activeDocument.updatedAt).toISOString() : new Date().toISOString(),
      wordCount,
    }),
    [activeDocument, wordCount]
  );

  const handleSelectDocument = useCallback((id: string) => {
    setActiveDocId(id);
    setActiveDocumentId(id);
  }, []);

  const handleCreateDocument = useCallback(
    (parentId: string | null) => {
      const doc = createDocument(parentId);
      refreshDocuments();
      setActiveDocId(doc.id);
      setActiveDocumentId(doc.id);
    },
    [refreshDocuments]
  );

  const handleCreateFolder = useCallback(
    (parentId: string | null) => {
      createFolder(parentId);
      refreshDocuments();
    },
    [refreshDocuments]
  );

  const handleRenameDocument = useCallback(
    (id: string, title: string) => {
      renameDocument(id, title);
      refreshDocuments();
    },
    [refreshDocuments]
  );

  const handleDeleteDocument = useCallback(
    (id: string) => {
      const next = deleteDocument(id);
      setDocuments(next);
      if (!next.some((d) => d.id === activeDocId)) {
        const fallbackId = next.find((d) => !d.isFolder)?.id ?? null;
        setActiveDocId(fallbackId);
        if (fallbackId) setActiveDocumentId(fallbackId);
      }
    },
    [activeDocId]
  );

  const handleMoveDocument = useCallback(
    (id: string, parentId: string | null) => {
      moveDocument(id, parentId);
      refreshDocuments();
    },
    [refreshDocuments]
  );

  const handleTextUpdate = useCallback((plainText: string) => {
    setWordCount(countWords(plainText));
    setIsSaving(true);
    window.setTimeout(() => setIsSaving(false), 500);
  }, []);

  const handleTitleChange = useCallback(
    (next: string) => {
      if (!activeDocId) return;
      const cleaned = next.trim().length > 0 ? next : "Untitled";
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
      }
      titleSaveTimeoutRef.current = window.setTimeout(() => {
        renameDocument(activeDocId, cleaned);
        refreshDocuments();
      }, 500);
    },
    [activeDocId, refreshDocuments]
  );

  const handlePersistContent = useCallback(
    (html: string) => {
      if (!activeDocId) return;
      updateDocumentContent(activeDocId, html);
    },
    [activeDocId]
  );

  const handleGenerateMeetingSummary = useCallback((params: MeetingGenerationParams) => {
    editorRef.current?.generateMeetingSummary(params);
  }, []);

  const handleGetCursorPosition = useCallback((): number => {
    return editorRef.current?.getCursorPosition() ?? 0;
  }, []);

  const handleInsertAtPosition = useCallback((pos: number, html: string) => {
    editorRef.current?.insertContentAtPosition(pos, html);
  }, []);

  // Exporting to PDF just uses the browser's/WebView's native print dialog
  // (window.print() → "Save as PDF") — real vector text, no extra
  // dependency, works the same in the web app and inside the Tauri
  // WebView. Printing the currently-active document is immediate; printing
  // a *different* document from the Sidebar switches to it first and waits
  // a couple of animation frames for that document's content to actually
  // paint (the Editor remounts via `key={activeDocument.id}`) before
  // triggering print — otherwise the print dialog could open against the
  // still-mounting previous document.
  const pendingPrintDocIdRef = useRef<string | null>(null);

  const handleExportPdf = useCallback(
    (id: string) => {
      if (id === activeDocId) {
        window.print();
        return;
      }
      pendingPrintDocIdRef.current = id;
      handleSelectDocument(id);
    },
    [activeDocId, handleSelectDocument]
  );

  useEffect(() => {
    if (pendingPrintDocIdRef.current === null) return;
    if (pendingPrintDocIdRef.current !== activeDocId) return;

    const targetId = pendingPrintDocIdRef.current;
    pendingPrintDocIdRef.current = null;

    // Two rAFs: one for React to commit the new Editor instance, one more
    // for the browser to actually paint its content before print() grabs
    // a snapshot of the page.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeDocId === targetId) window.print();
      });
    });
  }, [activeDocId]);

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <main className="print-root flex h-screen flex-col overflow-hidden">
      <TopBar
        meta={documentMeta}
        isSaving={isSaving}
        isMeetingGenerating={isMeetingGenerating}
        onGenerateMeetingSummary={handleGenerateMeetingSummary}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        getCursorPosition={handleGetCursorPosition}
        onInsertAtPosition={handleInsertAtPosition}
        onExportPdf={() => handleExportPdf(activeDocId ?? "")}
        zoomLevel={zoomLevel}
        onZoomIn={() => adjustZoom(ZOOM_STEP)}
        onZoomOut={() => adjustZoom(-ZOOM_STEP)}
        onZoomReset={() => adjustZoom(0)}
      />
      <div className="print-row flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <Sidebar
            documents={documents}
            activeId={activeDocId}
            onSelect={handleSelectDocument}
            onCreateDocument={handleCreateDocument}
            onCreateFolder={handleCreateFolder}
            onRename={handleRenameDocument}
            onDelete={handleDeleteDocument}
            onMove={handleMoveDocument}
            onExportPdf={handleExportPdf}
          />
        )}
        <div className="ai-editor-shell flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 pb-40 pt-10 sm:px-10" style={{ zoom: `${zoomLevel}%` }}>
            {workspaceReady && activeDocument ? (
              <Editor
                key={activeDocument.id}
                ref={editorRef}
                initialContent={activeDocument.content}
                onTitleChange={handleTitleChange}
                onTextUpdate={handleTextUpdate}
                onPersistContent={handlePersistContent}
                onMeetingGeneratingChange={setIsMeetingGenerating}
              />
            ) : (
              <div className="h-40 animate-pulse rounded-lg bg-ink-900/40" />
            )}
          </div>
        </div>
      </div>
      <VersionStatus />
    </main>
  );
}
