"use client";

import { useCallback, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { validateImageFile } from "@/lib/uploads/validation";

export interface ImageUploadButtonProps {
  getCursorPosition: () => number;
  onInsertAtPosition: (pos: number, html: string) => void;
}

const ACCEPT_ATTR = ".png,.jpg,.jpeg,image/png,image/jpeg";

export default function ImageUploadButton({ getCursorPosition, onInsertAtPosition }: ImageUploadButtonProps): JSX.Element {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Captured the instant a valid file is picked — not read again later, so
  // the image always lands where the cursor was when the user chose the
  // file, even though the actual upload finishes asynchronously.
  const capturedPosRef = useRef<number>(0);

  const resetSelection = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const validation = validateImageFile({ name: file.name, type: file.type, size: file.size });
      if (!validation.valid) {
        setError(validation.reason ?? "Archivo inválido.");
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      // Capture cursor position right now, synchronously — equivalent to
      // reading `textarea.selectionStart` before an async upload begins.
      capturedPosRef.current = getCursorPosition();

      setError(null);
      setSelectedFile(file);

      // FileReader gives an instant local thumbnail without waiting on any
      // network round-trip; the actual document insertion later uses the
      // server-returned URL, not this data URL.
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => setError("No se pudo generar la vista previa de la imagen.");
      reader.readAsDataURL(file);
    },
    [getCursorPosition]
  );

  const handleInsert = useCallback(async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", selectedFile);

      const res = await fetch("/api/upload/image", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "No se pudo subir la imagen.");
      }

      const altText = selectedFile.name.replace(/\.[^.]+$/, "");
      const html = `<img src="${data.url}" alt="${altText.replace(/"/g, "&quot;")}" />`;
      onInsertAtPosition(capturedPosRef.current, html);

      resetSelection();
      setPanelOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, onInsertAtPosition, resetSelection]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-transparent px-2.5 py-1 text-xs font-medium text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-50"
        title="Insertar imagen"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Imagen
      </button>

      {panelOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-9 z-40 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-menu animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-ink-800 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
              <ImageIcon className="h-3.5 w-3.5 text-ai" />
              Insertar imagen
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-md p-1 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3 px-3.5 py-3">
            {error && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">{error}</p>
            )}

            {!selectedFile ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-700 px-4 py-8 text-center text-xs text-ink-400 hover:border-ink-500 hover:text-ink-200">
                <Upload className="h-5 w-5" />
                Hacé clic para elegir un .png, .jpg o .jpeg
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-2.5">
                <div className="relative overflow-hidden rounded-lg border border-ink-800 bg-canvas-inset">
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Vista previa" className="max-h-40 w-full object-contain" />
                  )}
                  <button
                    type="button"
                    onClick={resetSelection}
                    disabled={isUploading}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
                    aria-label="Quitar imagen"
                    title="Quitar imagen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="truncate text-xs text-ink-500">
                  {selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="ai"
              size="sm"
              onClick={handleInsert}
              disabled={!selectedFile || isUploading}
              className={cn("w-full gap-1.5", isUploading && "opacity-80")}
            >
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {isUploading ? "Subiendo…" : "Insertar en el documento"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
