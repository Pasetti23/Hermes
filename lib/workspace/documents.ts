import type { WorkspaceDocument } from "@/types";
import { generateId } from "@/lib/utils";

const DOCS_KEY = "notion_workspace_docs_v1";
const ACTIVE_ID_KEY = "notion_workspace_active_id_v1";
const LEGACY_SINGLE_DOC_KEY = "notion_doc_content";

const DEFAULT_DOC_CONTENT = `
<h1>Untitled</h1>
<p>Escribe algo, o presiona <code>/</code> para abrir el menú de IA y comandos de bloque.</p>
`;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readAll(): WorkspaceDocument[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(DOCS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(docs: WorkspaceDocument[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  } catch {
    // localStorage unavailable (private browsing / quota exceeded) — fail silently
  }
}

function migrateLegacySingleDocument(): WorkspaceDocument[] {
  if (!isBrowser()) return [];
  let legacyContent: string | null = null;
  try {
    legacyContent = window.localStorage.getItem(LEGACY_SINGLE_DOC_KEY);
  } catch {
    legacyContent = null;
  }

  const now = Date.now();
  const seeded: WorkspaceDocument = {
    id: generateId("doc"),
    title: "Untitled",
    content: legacyContent && legacyContent.trim().length > 0 ? legacyContent : DEFAULT_DOC_CONTENT,
    parentId: null,
    createdAt: now,
    updatedAt: now,
  };

  writeAll([seeded]);
  return [seeded];
}

/** Returns every document/folder in the workspace, seeding it on first run. */
export function listDocuments(): WorkspaceDocument[] {
  const existing = readAll();
  if (existing.length > 0) return existing;
  return migrateLegacySingleDocument();
}

export function getDocument(id: string): WorkspaceDocument | null {
  return listDocuments().find((d) => d.id === id) ?? null;
}

export function getActiveDocumentId(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveDocumentId(id: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    // ignore
  }
}

export function createDocument(parentId: string | null = null, title = "Untitled"): WorkspaceDocument {
  const now = Date.now();
  const doc: WorkspaceDocument = {
    id: generateId("doc"),
    title,
    content: DEFAULT_DOC_CONTENT,
    parentId,
    isFolder: false,
    createdAt: now,
    updatedAt: now,
  };
  const all = listDocuments();
  writeAll([...all, doc]);
  return doc;
}

export function createFolder(parentId: string | null = null, title = "Nueva carpeta"): WorkspaceDocument {
  const now = Date.now();
  const folder: WorkspaceDocument = {
    id: generateId("folder"),
    title,
    content: "",
    parentId,
    isFolder: true,
    createdAt: now,
    updatedAt: now,
  };
  const all = listDocuments();
  writeAll([...all, folder]);
  return folder;
}

export function updateDocumentContent(id: string, content: string): void {
  const all = listDocuments();
  const next = all.map((d) => (d.id === id ? { ...d, content, updatedAt: Date.now() } : d));
  writeAll(next);
}

export function renameDocument(id: string, title: string): void {
  const trimmed = title.trim();
  if (trimmed.length === 0) return;
  const all = listDocuments();
  const next = all.map((d) => (d.id === id ? { ...d, title: trimmed, updatedAt: Date.now() } : d));
  writeAll(next);
}

export function moveDocument(id: string, newParentId: string | null): void {
  if (id === newParentId) return;
  const all = listDocuments();
  // Guard against moving a folder into one of its own descendants.
  if (isDescendant(all, newParentId, id)) return;
  const next = all.map((d) => (d.id === id ? { ...d, parentId: newParentId, updatedAt: Date.now() } : d));
  writeAll(next);
}

function isDescendant(all: WorkspaceDocument[], candidateId: string | null, ancestorId: string): boolean {
  let current = candidateId;
  const byId = new Map(all.map((d) => [d.id, d]));
  while (current !== null) {
    if (current === ancestorId) return true;
    const node = byId.get(current);
    if (!node) return false;
    current = node.parentId;
  }
  return false;
}

/** Deletes a document, or a folder and everything nested inside it. */
export function deleteDocument(id: string): WorkspaceDocument[] {
  const all = listDocuments();
  const idsToDelete = new Set<string>([id]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const doc of all) {
      if (doc.parentId && idsToDelete.has(doc.parentId) && !idsToDelete.has(doc.id)) {
        idsToDelete.add(doc.id);
        changed = true;
      }
    }
  }

  const next = all.filter((d) => !idsToDelete.has(d.id));
  writeAll(next);
  return next;
}

export function getChildren(all: WorkspaceDocument[], parentId: string | null): WorkspaceDocument[] {
  return all
    .filter((d) => d.parentId === parentId)
    .sort((a, b) => {
      if (!!a.isFolder !== !!b.isFolder) return a.isFolder ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

export function getAllFolders(all: WorkspaceDocument[]): WorkspaceDocument[] {
  return all.filter((d) => d.isFolder);
}
