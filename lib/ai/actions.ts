import type { BubbleMenuAction, SlashCommandItem } from "@/types";

export const AI_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    key: "generate",
    label: "Ask AI to write",
    description: "Generate new content from a prompt",
    group: "ai",
    icon: "Sparkles",
    keywords: ["ai", "write", "generate", "ia"],
  },
  {
    key: "summarize",
    label: "Summarize above",
    description: "Summarize the content above this block",
    group: "ai",
    icon: "ListTree",
    keywords: ["ai", "summary", "tldr"],
  },
  {
    key: "make_longer",
    label: "Brainstorm ideas",
    description: "Expand on the topic with new ideas",
    group: "ai",
    icon: "Lightbulb",
    keywords: ["ai", "brainstorm", "ideas", "expand"],
  },
];

export const BASIC_SLASH_COMMANDS: SlashCommandItem[] = [
  { key: "heading1", label: "Heading 1", description: "Big section heading", group: "basic", icon: "Heading1", keywords: ["h1", "heading", "title"] },
  { key: "heading2", label: "Heading 2", description: "Medium section heading", group: "basic", icon: "Heading2", keywords: ["h2", "heading", "subtitle"] },
  { key: "heading3", label: "Heading 3", description: "Small section heading", group: "basic", icon: "Heading3", keywords: ["h3", "heading"] },
  { key: "bullet_list", label: "Bulleted list", description: "Simple unordered list", group: "basic", icon: "List", keywords: ["bullet", "list", "ul"] },
  { key: "ordered_list", label: "Numbered list", description: "Simple ordered list", group: "basic", icon: "ListOrdered", keywords: ["number", "list", "ol"] },
  { key: "task_list", label: "To-do list", description: "Track tasks with checkboxes", group: "basic", icon: "ListChecks", keywords: ["todo", "task", "checkbox"] },
  { key: "code_block", label: "Code block", description: "Formatted code snippet", group: "basic", icon: "Code2", keywords: ["code", "snippet"] },
  { key: "quote", label: "Quote", description: "Capture a quotation", group: "basic", icon: "Quote", keywords: ["quote", "blockquote"] },
  { key: "divider", label: "Divider", description: "Visually divide blocks", group: "basic", icon: "Minus", keywords: ["divider", "separator", "hr"] },
];

export const ALL_SLASH_COMMANDS: SlashCommandItem[] = [...AI_SLASH_COMMANDS, ...BASIC_SLASH_COMMANDS];

export const BUBBLE_MENU_ACTIONS: BubbleMenuAction[] = [
  { key: "improve_writing", label: "Mejorar redacción", icon: "Wand2" },
  { key: "fix_grammar", label: "Corregir gramática", icon: "SpellCheck2" },
  { key: "make_longer", label: "Alargar", icon: "AlignJustify" },
  { key: "make_shorter", label: "Acortar", icon: "AlignLeft" },
  { key: "summarize", label: "Resumir", icon: "ListTree" },
  { key: "change_tone", label: "Cambiar tono", icon: "AudioLines", requiresInput: true },
  { key: "translate", label: "Traducir", icon: "Languages", requiresInput: true },
];

export const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "professional", label: "Profesional" },
  { value: "casual", label: "Casual" },
  { value: "academic", label: "Académico" },
  { value: "confident", label: "Seguro" },
  { value: "friendly", label: "Amigable" },
];

export const LANGUAGE_OPTIONS: string[] = [
  "Español",
  "Inglés",
  "Portugués",
  "Francés",
  "Alemán",
  "Italiano",
];
