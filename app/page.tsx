"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopBar from "@/components/editor/TopBar";
import Sidebar from "@/components/editor/Sidebar";
import Editor, { type EditorHandle } from "@/components/editor/Editor";
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

export default function HomePage(): JSX.Element {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [wordCount, setWordCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isMeetingGenerating, setIsMeetingGenerating] = useState<boolean>(false);

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
  }, []);

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

  useEffect(() => {
    return () => {
      if (titleSaveTimeoutRef.current !== null) {
        window.clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <TopBar
        meta={documentMeta}
        isSaving={isSaving}
        isMeetingGenerating={isMeetingGenerating}
        onGenerateMeetingSummary={handleGenerateMeetingSummary}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex flex-1 overflow-hidden">
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
          />
        )}
        <div className="ai-editor-shell flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 pb-40 pt-10 sm:px-10">
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
    </main>
  );
}
