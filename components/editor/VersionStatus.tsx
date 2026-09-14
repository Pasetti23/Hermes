"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

// Keeping this loosely typed rather than importing the real `Update` type
// from @tauri-apps/plugin-updater — the object is only ever created and
// consumed within this component, and this avoids the whole file having a
// hard type-level dependency on a package that intentionally does nothing
// outside an actual Tauri webview.
interface UpdaterHandle {
  version: string;
  downloadAndInstall: (
    onProgress?: (event: { event: string; data?: { chunkLength?: number; contentLength?: number } }) => void
  ) => Promise<void>;
}

export default function VersionStatus(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateHandleRef = useRef<UpdaterHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // `"__TAURI_INTERNALS__" in window` is the standard way to detect
      // whether this page is actually running inside a Tauri webview —
      // the same app served as a plain website in a normal browser tab
      // never has it defined.
      const runningInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

      if (runningInTauri) {
        try {
          const { getVersion } = await import("@tauri-apps/api/app");
          const v = await getVersion();
          if (!cancelled) setVersion(v);
        } catch {
          if (!cancelled) setVersion(null);
        }
      } else {
        try {
          const res = await fetch("/api/version");
          const data = (await res.json()) as { version?: string };
          if (!cancelled) setVersion(data.version ?? null);
        } catch {
          if (!cancelled) setVersion(null);
        }
      }

      if (!runningInTauri) return;

      // Update checks only make sense for the packaged desktop build —
      // there's nothing to "update" about a browser tab.
      setUpdateState("checking");
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (cancelled) return;

        if (result) {
          updateHandleRef.current = result;
          setNewVersion(result.version);
          setUpdateState("available");
        } else {
          setUpdateState("idle");
        }
      } catch (err) {
        if (!cancelled) {
          setUpdateState("error");
          setErrorMessage(err instanceof Error ? err.message : "No se pudo comprobar si hay actualizaciones.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    const handle = updateHandleRef.current;
    if (!handle) return;

    setUpdateState("downloading");
    setProgress(0);
    setErrorMessage(null);

    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
      await handle.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data?.contentLength ?? 0;
          downloadedBytes = 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data?.chunkLength ?? 0;
          if (totalBytes > 0) {
            setProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      setUpdateState("ready");
    } catch (err) {
      setUpdateState("error");
      setErrorMessage(err instanceof Error ? err.message : "No se pudo descargar la actualización.");
    }
  }, []);

  const handleRestart = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      setUpdateState("error");
      setErrorMessage(err instanceof Error ? err.message : "No se pudo reiniciar la aplicación.");
    }
  }, []);

  if (!version) return null;

  return (
    <div className="no-print fixed bottom-3 left-3 z-40 flex items-center gap-2 text-[11px] text-ink-500">
      <span className="rounded-md border border-ink-800 bg-canvas/90 px-2 py-1 backdrop-blur">v{version}</span>

      {updateState === "available" && (
        <div className="flex items-center gap-1.5 rounded-md border border-ai/40 bg-ai/10 px-2 py-1 text-ai-soft">
          <Sparkles className="h-3 w-3" />
          <span>Versión {newVersion} disponible</span>
          <Button variant="ai" size="sm" onClick={handleUpdate} className="ml-1 h-5 gap-1 px-1.5 py-0 text-[10px]">
            Actualizar
          </Button>
        </div>
      )}

      {updateState === "downloading" && (
        <div className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin text-ai" />
          <span>Descargando… {progress}%</span>
          <div className="h-1 w-16 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-ai transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {updateState === "ready" && (
        <Button variant="ai" size="sm" onClick={handleRestart} className={cn("h-6 gap-1.5 px-2 py-0 text-[11px]")}>
          <RefreshCw className="h-3 w-3" />
          Reiniciar y actualizar
        </Button>
      )}

      {updateState === "error" && errorMessage && (
        <span
          className="max-w-[220px] truncate rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
}
