"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, Mic, Sparkles, Square, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { listMeetingPresets, saveCustomMeetingPreset } from "@/lib/ai/meetingPresets";
import type { MeetingGenerationParams, MeetingPreset } from "@/types";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface MeetingRecorderProps {
  isGenerating: boolean;
  onGenerateSummary: (params: MeetingGenerationParams) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

type Engine = "speech-api" | "media-recorder" | "unsupported";
type MeetingTab = "resumen" | "notas" | "transcripcion";

const NETWORK_RETRY_DELAY_MS = 1000;

export default function MeetingRecorder({
  isGenerating,
  onGenerateSummary,
  onRecordingChange,
}: MeetingRecorderProps): JSX.Element {
  // Client-mount guard: Web Speech API / MediaRecorder feature detection can
  // only run in the browser, so we never let that first client render differ
  // from the server-rendered markup — everything interactive stays behind
  // `mounted` until after hydration has settled.
  const [mounted, setMounted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MeetingTab>("resumen");
  const [engine, setEngine] = useState<Engine>("unsupported");
  const [isRecording, setIsRecording] = useState(false);

  // Isolated React state — this is the ONLY place the live transcript lives.
  // Nothing here ever touches the Tiptap DOM; insertion into the editor
  // happens exclusively in Editor.tsx via editor.commands, and only once,
  // when "Finalizar y Generar Resumen" is pressed.
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const [presets, setPresets] = useState<MeetingPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("auto");
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customContextField, setCustomContextField] = useState("");
  const [customFormatField, setCustomFormatField] = useState("");
  const [customStyleField, setCustomStyleField] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const networkRetryPendingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setPresets(listMeetingPresets());
  }, []);

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined" ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;
    if (SpeechRecognitionCtor) {
      setEngine("speech-api");
    } else if (typeof window !== "undefined" && "MediaRecorder" in window) {
      setEngine("media-recorder");
    } else {
      setEngine("unsupported");
    }
  }, []);

  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (panelOpen && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [panelOpen]);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          finalChunk += `${alt.transcript.trim()} `;
        } else {
          interim += alt.transcript;
        }
      }
      if (finalChunk) {
        setFinalTranscript((prev) => `${prev}${finalChunk}`.trim().concat(" "));
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;

      if (event.error === "network") {
        // Transient network hiccups shouldn't kill the session or alarm the
        // user — silently reconnect a second later while recording is still
        // meant to be active.
        if (shouldKeepListeningRef.current) {
          networkRetryPendingRef.current = true;
          window.setTimeout(() => {
            if (shouldKeepListeningRef.current) {
              networkRetryPendingRef.current = false;
              startSpeechRecognition();
            }
          }, NETWORK_RETRY_DELAY_MS);
        }
        return;
      }

      setMicError(
        event.error === "not-allowed" || event.error === "permission-denied"
          ? "Permiso de micrófono denegado. Habilitalo en la configuración del navegador."
          : `Error de reconocimiento de voz: ${event.error}`
      );
    };

    recognition.onend = () => {
      if (networkRetryPendingRef.current) {
        // A delayed reconnect from a network error is already scheduled —
        // let that timer own the restart instead of racing it here.
        return;
      }
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
        }
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    shouldKeepListeningRef.current = true;
    setMicError(null);

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      setMicError("No se pudo iniciar el reconocimiento de voz.");
      setIsRecording(false);
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    shouldKeepListeningRef.current = false;
    networkRetryPendingRef.current = false;
    recognitionRef.current?.stop();
    setInterimTranscript("");
    setIsRecording(false);
  }, []);

  const startMediaRecorderFallback = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: "audio/webm" });
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setMicError("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }, []);

  const stopMediaRecorderFallback = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      if (engine === "speech-api") stopSpeechRecognition();
      if (engine === "media-recorder") stopMediaRecorderFallback();
      return;
    }
    if (engine === "speech-api") startSpeechRecognition();
    if (engine === "media-recorder") void startMediaRecorderFallback();
  }, [engine, isRecording, startMediaRecorderFallback, startSpeechRecognition, stopMediaRecorderFallback, stopSpeechRecognition]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      networkRetryPendingRef.current = false;
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const combinedTranscript = `${finalTranscript} ${interimTranscript}`.trim();
  const effectiveTranscript = engine === "speech-api" ? combinedTranscript : manualTranscript.trim();
  const canGenerate = effectiveTranscript.length > 0 && !isGenerating;

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? presets[0],
    [presets, selectedPresetId]
  );

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    if (isRecording) {
      if (engine === "speech-api") stopSpeechRecognition();
      if (engine === "media-recorder") stopMediaRecorderFallback();
    }

    const notes = meetingNotes.trim();
    const combinedContext = [selectedPreset?.customContext, notes ? `Notas del usuario durante la reunión: ${notes}` : ""]
      .filter((part) => part && part.trim().length > 0)
      .join("\n\n");

    onGenerateSummary({
      transcript: effectiveTranscript,
      meetingType: selectedPreset?.meetingType ?? "Reunión general",
      customContext: combinedContext.length > 0 ? combinedContext : undefined,
      formatInstructions: selectedPreset?.formatInstructions,
      styleInstructions: selectedPreset?.styleInstructions,
    });
    setPanelOpen(false);
  }, [
    canGenerate,
    effectiveTranscript,
    engine,
    isRecording,
    meetingNotes,
    onGenerateSummary,
    selectedPreset,
    stopMediaRecorderFallback,
    stopSpeechRecognition,
  ]);

  const handleReset = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setManualTranscript("");
    setMicError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  }, [audioUrl]);

  const handleSaveCustomPreset = useCallback(() => {
    if (customLabel.trim().length === 0) return;
    saveCustomMeetingPreset({
      label: customLabel.trim(),
      meetingType: customLabel.trim(),
      customContext: customContextField.trim() || undefined,
      formatInstructions: customFormatField.trim() || undefined,
      styleInstructions: customStyleField.trim() || undefined,
    });
    const refreshed = listMeetingPresets();
    setPresets(refreshed);
    const created = refreshed[refreshed.length - 1];
    if (created) setSelectedPresetId(created.id);
    setCustomModalOpen(false);
    setCustomLabel("");
    setCustomContextField("");
    setCustomFormatField("");
    setCustomStyleField("");
  }, [customContextField, customFormatField, customLabel, customStyleField]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => mounted && setPanelOpen((prev) => !prev)}
        disabled={!mounted}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
          mounted && isRecording
            ? "border-red-500/40 bg-red-500/10 text-red-400"
            : "border-ink-700 bg-transparent text-ink-300 hover:border-ink-500 hover:text-ink-50"
        )}
      >
        {mounted && isRecording ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-red-500" />
            Grabando reunión…
          </>
        ) : (
          <>
            <Mic className="h-3.5 w-3.5" />
            Meeting Assistant
          </>
        )}
      </button>

      {mounted && panelOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-9 z-40 w-[26rem] max-w-[92vw] overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-menu animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-ink-800 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
              <Sparkles className="h-3.5 w-3.5 text-ai" />
              Notion Meeting Assistant
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
            {engine === "unsupported" && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
                Tu navegador no soporta grabación de audio. Probá con Chrome o Edge, o pegá la transcripción manualmente en la pestaña Transcripción.
              </p>
            )}

            {micError && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
                {micError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={isRecording ? "destructive" : "ai"}
                size="sm"
                onClick={handleToggleRecording}
                disabled={engine === "unsupported"}
                className="gap-1.5"
              >
                {isRecording ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                {isRecording ? "Detener grabación" : "Iniciar grabación"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                Limpiar
              </Button>
            </div>

            <div className="flex items-center gap-1 border-b border-ink-800 pb-2">
              {([
                ["resumen", "Resumen"],
                ["notas", "Notas"],
                ["transcripcion", "Transcripción"],
              ] as [MeetingTab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === key ? "bg-ai/15 text-ai-soft" : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "resumen" && (
              <div className="space-y-2.5">
                <p className="text-xs text-ink-500">Elegí un formato para que la IA estructure el resumen.</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        selectedPresetId === preset.id
                          ? "border-ai/50 bg-ai/15 text-ai-soft"
                          : "border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-50"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomModalOpen(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed border-ink-600 px-2.5 py-1 text-xs text-ink-400 hover:border-ink-400 hover:text-ink-100"
                  >
                    <FilePlus2 className="h-3 w-3" />
                    Agregar formato
                  </button>
                </div>
                {selectedPreset && (selectedPreset.formatInstructions || selectedPreset.customContext) && (
                  <p className="rounded-md border border-ink-800 bg-canvas-inset px-2.5 py-2 text-[11px] leading-relaxed text-ink-400">
                    {selectedPreset.customContext ? `${selectedPreset.customContext} ` : ""}
                    {selectedPreset.formatInstructions}
                  </p>
                )}
              </div>
            )}

            {activeTab === "notas" && (
              <textarea
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                placeholder="Notas rápidas para vos mismo o pistas para la IA (nombres, correcciones de jerga, aclaraciones)…"
                rows={6}
                className="w-full resize-none rounded-md border border-ink-800 bg-canvas-inset px-2.5 py-2 text-xs leading-relaxed text-ink-100 placeholder:text-ink-500 outline-none focus:border-ai"
              />
            )}

            {activeTab === "transcripcion" &&
              (engine === "speech-api" ? (
                <div className="max-h-40 overflow-y-auto rounded-md border border-ink-800 bg-canvas-inset px-2.5 py-2 text-xs leading-relaxed text-ink-300">
                  {combinedTranscript.length > 0 ? (
                    <p className="whitespace-pre-wrap">
                      {finalTranscript}
                      <span className="text-ink-500">{interimTranscript}</span>
                    </p>
                  ) : (
                    <p className="text-ink-500">La transcripción en vivo aparecerá acá mientras hablás (es-ES).</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {audioUrl && (
                    <audio controls src={audioUrl} className="w-full">
                      <track kind="captions" />
                    </audio>
                  )}
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200">
                    <Upload className="h-3.5 w-3.5" />
                    Subir archivo de audio
                    <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <textarea
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    placeholder="Pegá o escribí la transcripción de la reunión acá…"
                    rows={5}
                    className="w-full resize-none rounded-md border border-ink-800 bg-canvas-inset px-2.5 py-2 text-xs leading-relaxed text-ink-100 placeholder:text-ink-500 outline-none focus:border-ai"
                  />
                </div>
              ))}

            <Button
              type="button"
              variant="ai"
              size="sm"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Generando resumen…" : "Finalizar y Generar Resumen"}
            </Button>
          </div>
        </div>
      )}

      {mounted && customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 p-4 shadow-menu">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink-100">Agregar formato personalizado</h3>
              <button
                type="button"
                onClick={() => setCustomModalOpen(false)}
                className="rounded-md p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs text-ink-400">Nombre del formato</label>
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Ej: Retro de sprint"
                  className="h-8 w-full rounded-md border border-ink-700 bg-canvas-inset px-2.5 text-sm text-ink-100 outline-none focus:border-ai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-400">Contexto de reunión</label>
                <textarea
                  value={customContextField}
                  onChange={(e) => setCustomContextField(e.target.value)}
                  rows={2}
                  placeholder="De qué trata este tipo de reunión, quiénes participan, qué se busca lograr…"
                  className="w-full resize-none rounded-md border border-ink-700 bg-canvas-inset px-2.5 py-2 text-xs text-ink-100 outline-none focus:border-ai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-400">Formato de secciones</label>
                <textarea
                  value={customFormatField}
                  onChange={(e) => setCustomFormatField(e.target.value)}
                  rows={2}
                  placeholder="Qué encabezados/secciones debería incluir el resumen…"
                  className="w-full resize-none rounded-md border border-ink-700 bg-canvas-inset px-2.5 py-2 text-xs text-ink-100 outline-none focus:border-ai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-400">Instrucciones de estilo (viñetas vs párrafos)</label>
                <textarea
                  value={customStyleField}
                  onChange={(e) => setCustomStyleField(e.target.value)}
                  rows={2}
                  placeholder="Ej: viñetas cortas, sin párrafos largos…"
                  className="w-full resize-none rounded-md border border-ink-700 bg-canvas-inset px-2.5 py-2 text-xs text-ink-100 outline-none focus:border-ai"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustomModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="ai" size="sm" onClick={handleSaveCustomPreset} disabled={customLabel.trim().length === 0}>
                Guardar formato
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
