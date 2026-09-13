"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Mic2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { textToInlineDoc } from "@/lib/tiptap/helpers";
import { validateAudioFile } from "@/lib/uploads/validation";

export interface AudioUploadButtonProps {
  getCursorPosition: () => number;
  onInsertAtPosition: (pos: number, html: string) => void;
}

type Phase = "idle" | "uploading" | "transcribing" | "error";

const ACCEPT_ATTR = ".mp3,.mp4,audio/mpeg,audio/mp4";

export default function AudioUploadButton({ getCursorPosition, onInsertAtPosition }: AudioUploadButtonProps): JSX.Element {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Same idea as the image button: capture where the cursor was the moment
  // a valid file gets picked, not whenever the (potentially slow) upload +
  // transcription round-trip eventually finishes.
  const capturedPosRef = useRef<number>(0);

  const resetSelection = useCallback(() => {
    setSelectedFile(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const validation = validateAudioFile({ name: file.name, type: file.type, size: file.size });
      if (!validation.valid) {
        setError(validation.reason ?? "Archivo inválido.");
        setSelectedFile(null);
        return;
      }

      capturedPosRef.current = getCursorPosition();
      setError(null);
      setSelectedFile(file);
      setPhase("idle");
      setProgress(0);
    },
    [getCursorPosition]
  );

  const handleTranscribe = useCallback(() => {
    if (!selectedFile) return;

    setError(null);
    setPhase("uploading");
    setProgress(0);

    const body = new FormData();
    body.append("file", selectedFile);

    // fetch() has no upload-progress event — XMLHttpRequest is the only
    // browser-native way to drive a real progress bar for an upload, so we
    // drop down to it just for this call.
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      setProgress(pct);
      if (pct >= 100) setPhase("transcribing");
    };

    xhr.onerror = () => {
      setError("Error de red subiendo el audio.");
      setPhase("error");
    };

    xhr.onload = () => {
      xhrRef.current = null;
      let data: { text?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error below
      }

      if (xhr.status < 200 || xhr.status >= 300 || !data.text) {
        setError(data.error ?? "No se pudo transcribir el audio.");
        setPhase("error");
        return;
      }

      const html = textToInlineDoc(data.text);
      onInsertAtPosition(capturedPosRef.current, html);
      resetSelection();
      setPanelOpen(false);
    };

    xhr.open("POST", "/api/transcribe");
    xhr.send(body);
  }, [selectedFile, onInsertAtPosition, resetSelection]);

  const handleCancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    resetSelection();
  }, [resetSelection]);

  const isBusy = phase === "uploading" || phase === "transcribing";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-transparent px-2.5 py-1 text-xs font-medium text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-50"
        title="Transcribir audio"
      >
        <Mic2 className="h-3.5 w-3.5" />
        Audio
      </button>

      {panelOpen && (
        <div className="absolute right-0 top-9 z-40 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-menu animate-fade-in">
          <div className="flex items-center justify-between border-b border-ink-800 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
              <Mic2 className="h-3.5 w-3.5 text-ai" />
              Transcribir audio
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
                Hacé clic para elegir un .mp3 o .mp4 (máx. 25MB)
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-ink-800 bg-canvas-inset px-2.5 py-2">
                  <p className="truncate text-xs text-ink-300">
                    {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  {!isBusy && (
                    <button
                      type="button"
                      onClick={resetSelection}
                      className="ml-2 shrink-0 rounded p-0.5 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                      aria-label="Quitar audio"
                      title="Quitar audio"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {isBusy && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                      <div
                        className={cn(
                          "h-full rounded-full bg-ai transition-all duration-150",
                          phase === "transcribing" && "animate-pulse-dot"
                        )}
                        style={{ width: `${phase === "transcribing" ? 100 : progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-ink-500">
                      {phase === "uploading" ? `Subiendo… ${progress}%` : "Transcribiendo con Whisper…"}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ai"
                size="sm"
                onClick={handleTranscribe}
                disabled={!selectedFile || isBusy}
                className="flex-1 gap-1.5"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
                {isBusy ? "Procesando…" : "Transcribir e insertar"}
              </Button>
              {isBusy && (
                <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
