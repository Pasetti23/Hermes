import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import CharacterCount from "@tiptap/extension-character-count";
import { createLowlight, common } from "lowlight";
import type { Extensions } from "@tiptap/react";

const lowlight = createLowlight(common);

export function buildEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") {
          return "Untitled heading";
        }
        return "Write something, or press '/' for AI and commands…";
      },
      includeChildren: true,
    }),
    TaskList.configure({
      HTMLAttributes: { class: "ai-task-list" },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: "ai-task-item" },
    }),
    CodeBlockLowlight.configure({
      lowlight,
      HTMLAttributes: { class: "ai-code-block" },
    }),
    CharacterCount.configure({}),
  ];
}
