"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getChildren, getAllFolders } from "@/lib/workspace/documents";
import type { WorkspaceDocument } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  documents: WorkspaceDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateDocument: (parentId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
}

export default function Sidebar({
  documents,
  activeId,
  onSelect,
  onCreateDocument,
  onCreateFolder,
  onRename,
  onDelete,
  onMove,
}: SidebarProps): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const folders = useMemo(() => getAllFolders(documents), [documents]);
  const rootItems = useMemo(() => getChildren(documents, null), [documents]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback((doc: WorkspaceDocument) => {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  }, []);

  const commitRename = useCallback(
    (id: string) => {
      if (renameValue.trim().length > 0) {
        onRename(id, renameValue.trim());
      }
      setRenamingId(null);
    },
    [renameValue, onRename]
  );

  const handleDelete = useCallback(
    (doc: WorkspaceDocument) => {
      const confirmMessage = doc.isFolder
        ? `¿Eliminar la carpeta "${doc.title}" y todo lo que contiene?`
        : `¿Eliminar "${doc.title}"?`;
      if (window.confirm(confirmMessage)) {
        onDelete(doc.id);
      }
    },
    [onDelete]
  );

  const renderNode = (doc: WorkspaceDocument, depth: number): JSX.Element => {
    const isFolder = !!doc.isFolder;
    const isExpanded = expanded.has(doc.id);
    const children = isFolder ? getChildren(documents, doc.id) : [];
    const isActive = doc.id === activeId;
    const isRenaming = renamingId === doc.id;

    return (
      <div key={doc.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors",
            isActive ? "bg-ink-800 text-ink-50" : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100"
          )}
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <button
            type="button"
            onClick={() => (isFolder ? toggleExpanded(doc.id) : undefined)}
            className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded", !isFolder && "invisible")}
            aria-label={isFolder ? (isExpanded ? "Colapsar carpeta" : "Expandir carpeta") : undefined}
          >
            {isFolder ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : null}
          </button>

          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-500">
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5" />
              ) : (
                <Folder className="h-3.5 w-3.5" />
              )
            ) : (
              <File className="h-3.5 w-3.5" />
            )}
          </span>

          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(doc.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(doc.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="h-6 flex-1 rounded border border-ai bg-canvas-inset px-1 text-sm text-ink-100 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => (isFolder ? toggleExpanded(doc.id) : onSelect(doc.id))}
              onDoubleClick={() => startRename(doc)}
              className="min-w-0 flex-1 truncate text-left"
              title={doc.title}
            >
              {doc.title || "Sin título"}
            </button>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {isFolder && (
              <>
                <button
                  type="button"
                  onClick={() => onCreateDocument(doc.id)}
                  className="rounded p-0.5 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                  aria-label="Nueva página"
                  title="Nueva página aquí"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCreateFolder(doc.id)}
                  className="rounded p-0.5 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                  aria-label="Nueva carpeta"
                  title="Nueva carpeta aquí"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-0.5 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                  aria-label="Más opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => startRename(doc)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Renombrar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mover a</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onMove(doc.id, null)}>Raíz (sin carpeta)</DropdownMenuItem>
                {folders
                  .filter((f) => f.id !== doc.id)
                  .map((f) => (
                    <DropdownMenuItem key={f.id} onSelect={() => onMove(doc.id, f.id)}>
                      {f.title || "Sin título"}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handleDelete(doc)} className="text-red-400">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isFolder && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-ink-800/80 bg-canvas-inset">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Páginas</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCreateDocument(null)}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Nueva página"
            title="Nueva página"
          >
            <FilePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onCreateFolder(null)}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Nueva carpeta"
            title="Nueva carpeta"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {rootItems.length === 0 ? (
          <p className="px-2 py-4 text-xs text-ink-500">Sin páginas todavía. Creá una con el ícono de arriba.</p>
        ) : (
          rootItems.map((doc) => renderNode(doc, 0))
        )}
      </div>
    </aside>
  );
}
