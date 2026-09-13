import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateAudioFile } from "@/lib/uploads/validation";

// Node.js runtime (not Edge): we need real filesystem access for temp-file
// handling, which the Edge runtime the AI completion route uses doesn't
// provide.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.OPENAI_API_KEY) {
    // Whisper is an OpenAI-only endpoint — this check is independent of
    // AI_PROVIDER (which only controls the text-completion routes), so it's
    // called out explicitly here rather than reusing that flag.
    return jsonError(
      "OPENAI_API_KEY no está configurada en el servidor. La transcripción de audio usa la API de Whisper de OpenAI independientemente del proveedor elegido para el resto de la IA.",
      500
    );
  }

  let tempFilePath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return jsonError("No se recibió ningún archivo en el campo 'file'.", 400);
    }

    const validation = validateAudioFile({ name: file.name, type: file.type, size: file.size });
    if (!validation.valid) {
      return jsonError(validation.reason ?? "Archivo inválido.", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = path.extname(file.name).toLowerCase() || ".mp3";
    tempFilePath = path.join(os.tmpdir(), `hermes-audio-${randomUUID()}${extension}`);
    await writeFile(tempFilePath, buffer);

    const transcript = await transcribeWithWhisper(tempFilePath, file.type || "audio/mpeg");

    return new Response(JSON.stringify({ text: transcript }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Error inesperado transcribiendo el audio.";
    console.error("[transcribe] failed:", err);
    return jsonError(detail, 502);
  } finally {
    // Clean up regardless of success or failure — an audio file left behind
    // in the OS temp dir on every request would add up fast.
    if (tempFilePath && existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("[transcribe] failed to remove temp file:", cleanupErr);
      }
    }
  }
}

async function transcribeWithWhisper(filePath: string, mimeType: string): Promise<string> {
  const fileBuffer = await readFile(filePath);
  const blob = new Blob([fileBuffer], { type: mimeType });

  const whisperForm = new FormData();
  whisperForm.append("file", blob, path.basename(filePath));
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: whisperForm,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Whisper devolvió ${res.status}: ${errorBody.slice(0, 500) || "sin detalle"}`);
  }

  const data = (await res.json()) as { text?: string };
  if (!data.text || data.text.trim().length === 0) {
    throw new Error("Whisper no devolvió texto transcrito.");
  }
  return data.text.trim();
}
