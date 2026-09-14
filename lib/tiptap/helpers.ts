import { marked } from "marked";
import type { Editor } from "@tiptap/react";
import type { SelectionRange, SlashCommandItem } from "@/types";

// AI responses routinely come back as Markdown (headings, bold, bullets,
// numbered lists) even when the system prompt asks for plain prose. Parsing
// it here — once, in the single chokepoint every inline AI insertion goes
// through — means `##`/`**`/`- ` never show up as literal characters in the
// document; they become real Tiptap heading/bold/bulletList nodes, since
// StarterKit's nodes already parse standard HTML tags (`<h1>`, `<strong>`,
// `<ul>`, etc.) out of the box.
marked.setOptions({ gfm: true, breaks: true });

export function getSelectionText(editor: Editor, range?: SelectionRange): string {
  const { from, to } = range ?? editor.state.selection;
  if (from === to) return "";
  return editor.state.doc.textBetween(from, to, "\n");
}

export function getSelectionRange(editor: Editor): SelectionRange {
  const { from, to } = editor.state.selection;
  return { from, to };
}

export function getSurroundingContext(editor: Editor, aroundPos: number, chars = 1200): string {
  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
  const start = Math.max(0, aroundPos - chars);
  return docText.slice(start, aroundPos);
}

export function getSelectionScreenRect(editor: Editor): DOMRect | null {
  const { view } = editor;
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.bottom, end.bottom);
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * Scrolls the DOM node at the current selection into view, smoothly and
 * only as far as needed (`block: "nearest"` — never re-centers content
 * that's already visible). Deferred one frame so it runs after the
 * transaction's DOM update has actually painted, not before.
 */
export function scrollSelectionIntoView(editor: Editor): void {
  requestAnimationFrame(() => {
    const { from } = editor.state.selection;
    const domResult = editor.view.domAtPos(from);
    const node =
      domResult.node.nodeType === Node.ELEMENT_NODE
        ? (domResult.node as HTMLElement)
        : domResult.node.parentElement;
    node?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  });
}

export function replaceRangeWithText(editor: Editor, range: SelectionRange, text: string): void {
  // `{ preventScroll: true }` stops the browser's own default "scroll this
  // newly-focused contenteditable into view" behavior, which — inside our
  // nested scroll containers (sidebar + editor pane) — was what caused the
  // jarring, uncontrolled jump when accepting an AI suggestion from the
  // bubble menu. We scroll ourselves afterward instead, deliberately.
  editor.view.dom.focus({ preventScroll: true });
  editor
    .chain()
    .deleteRange(range)
    .insertContentAt(range.from, textToInlineDoc(text))
    .run();
  scrollSelectionIntoView(editor);
}

export function insertTextBelow(editor: Editor, pos: number, text: string): void {
  editor.view.dom.focus({ preventScroll: true });
  editor.chain().insertContentAt(pos, textToInlineDoc(text)).run();
  scrollSelectionIntoView(editor);
}

export function textToInlineDoc(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "<p></p>";

  try {
    const html = marked.parse(trimmed, { async: false }) as string;
    return html.trim().length > 0 ? html : "<p></p>";
  } catch {
    // Malformed input shouldn't ever crash the editor — fall back to the
    // previous plain-text behavior (escaping newlines as <br/>) so the
    // user's content is never silently lost.
    return `<p>${trimmed.split("\n").join("<br/>")}</p>`;
  }
}

export function markdownBlockToHtml(command: SlashCommandItem["key"]): string {
  switch (command) {
    case "heading1":
      return "<h1></h1>";
    case "heading2":
      return "<h2></h2>";
    case "heading3":
      return "<h3></h3>";
    case "bullet_list":
      return "<ul><li></li></ul>";
    case "ordered_list":
      return "<ol><li></li></ol>";
    case "task_list":
      return '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>';
    case "code_block":
      return "<pre><code></code></pre>";
    case "quote":
      return "<blockquote><p></p></blockquote>";
    case "divider":
      return "<hr/>";
    default:
      return "<p></p>";
  }
}

export function deleteSlashQuery(editor: Editor, from: number, to: number): void {
  editor.chain().focus().deleteRange({ from, to }).run();
}

export function findSlashQueryRange(editor: Editor): SelectionRange | null {
  const { $from } = editor.state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const match = /\/([a-zA-Z0-9ÁÉÍÓÚáéíóúñÑ]*)$/.exec(textBefore);
  if (!match) return null;
  const from = $from.pos - match[0].length;
  return { from, to: $from.pos };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

export function meetingMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlParts: string[] = [];
  let listMode: "none" | "bullet" | "task" = "none";
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listMode === "bullet" && listBuffer.length > 0) {
      htmlParts.push(`<ul>${listBuffer.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ul>`);
    } else if (listMode === "task" && listBuffer.length > 0) {
      htmlParts.push(
        `<ul data-type="taskList">${listBuffer
          .map((item) => {
            const checkedMatch = /^\[( |x|X)\]\s*(.*)$/.exec(item);
            const checked = checkedMatch ? (checkedMatch[1] ?? " ").toLowerCase() === "x" : false;
            const label = checkedMatch ? checkedMatch[2] ?? "" : item;
            return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox" ${
              checked ? "checked" : ""
            }/><span></span></label><div><p>${escapeHtml(label)}</p></div></li>`;
          })
          .join("")}</ul>`
      );
    }
    listBuffer = [];
    listMode = "none";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushList();
      continue;
    }

    const h2Match = /^##\s+(.*)$/.exec(line);
    const h1Match = /^#\s+(.*)$/.exec(line);
    const taskMatch = /^[-*]\s+\[( |x|X)\]\s*(.*)$/.exec(line);
    const bulletMatch = /^[-*]\s+(.*)$/.exec(line);

    if (h2Match) {
      flushList();
      htmlParts.push(`<h2>${escapeHtml(h2Match[1] ?? "")}</h2>`);
    } else if (h1Match) {
      flushList();
      htmlParts.push(`<h2>${escapeHtml(h1Match[1] ?? "")}</h2>`);
    } else if (taskMatch) {
      if (listMode !== "task") flushList();
      listMode = "task";
      listBuffer.push(`[${taskMatch[1] ?? " "}] ${taskMatch[2] ?? ""}`);
    } else if (bulletMatch) {
      if (listMode !== "bullet") flushList();
      listMode = "bullet";
      listBuffer.push(bulletMatch[1] ?? "");
    } else {
      flushList();
      htmlParts.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  flushList();
  return htmlParts.join("") || "<p></p>";
}
