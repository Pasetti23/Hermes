import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ResizableImageNodeView from "@/components/editor/ResizableImageNodeView";

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "60%",
        parseHTML: (element: HTMLElement) => element.style.width || element.getAttribute("width") || "60%",
        renderHTML: (attributes: Record<string, unknown>) => ({ style: `width: ${attributes.width}` }),
      },
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-align") || "center",
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-align": attributes.align }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

export default ResizableImage;
