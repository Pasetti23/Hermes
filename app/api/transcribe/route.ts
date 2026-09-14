import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import { validateAudioFile } from "@/lib/uploads/validation";

// Node.js runtime (not Edge): we need real filesystem access for temp-file
// handling, which the Edge runtime the AI completion route uses doesn't
// provide.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "gemini-2.5-flash" was requested, but as of the current Gemini model
// lineup that alias is gone the same way the 1.5 and 2.0 families were —
// Google's own audio-transcription docs (dated July 2026) use
// "gemini-3.6-flash" for this exact generateContent + Files API pattern.
// Overridable via env var for the same reason GEMINI_FAST_MODEL_ID is in
// app/api/ai/completion/route.ts: these aliases keep rotating every few
// months, so a code change shouldn't be required to pick up a new one.
const GEMINI_TRANSCRIBE_MODEL_ID = process.env.GEMINI_TRANSCRIBE_MODEL_ID ?? "gemini-3.6-flash";

// Ask for both the raw transcript AND a structured summary in the same
// request — mirrors Samsung's "smart transcription" behavior (full text +
// auto-summary together), and forcing JSON output means we don't have to
// parse a delimited text response by hand.
const TRANSCRIBE_AND_SUMMARIZE_PROMPT = `Transcribe el audio completo a texto plano, palabra por palabra, en el idioma original en que se habla.
Luego generá un resumen estructurado en Markdown de ese contenido: encabezados H2 (##) por tema, viñetas directas.
Devolvé EXCLUSIVAMENTE un objeto JSON con esta forma exacta, sin texto adicional antes o después:
{"transcript": "<transcripción completa>", "summary": "<resumen en Markdown>"}`;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface TranscribeResult {
  transcript: string;
  summary: string;
}

function parseGeminiJsonResponse(raw: string): TranscribeResult {
  // Gemini's JSON mode is reliable but not infallible — strip a stray
  // ```json fence if one slips through, same defensive habit as the rest
  // of this codebase's AI response handling.
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as Partial<TranscribeResult>;

  if (!parsed.transcript || typeof parsed.transcript !== "string" || parsed.transcript.trim().length === 0) {
    throw new Error("Gemini no devolvió una transcripción utilizable.");
  }

  return {
    transcript: parsed.transcript.trim(),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
  };
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return jsonError(
      "GOOGLE_GENERATIVE_AI_API_KEY no está configurada en el servidor. La transcripción de audio usa la API de Gemini independientemente del proveedor elegido para el resto de la IA.",
      500
    );
  }

  let tempFilePath: string | null = null;
  let uploadedFileName: string | null = null;
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

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
    const mimeType = file.type || "audio/mpeg";

    const extension = path.extname(file.name).toLowerCase() || ".mp3";
    tempFilePath = path.join(os.tmpdir(), `hermes-audio-${randomUUID()}${extension}`);
    await writeFile(tempFilePath, buffer);

    // The Files API (upload-then-reference-by-URI) is used unconditionally
    // rather than inlining base64 bytes directly in the request — Gemini
    // caps inline request bodies at 20MB, and base64 inflates the raw file
    // size by roughly a third, so anything over ~15MB would silently
    // exceed that cap. Our own validation allows files up to 25MB, so
    // inlining isn't safe here; uploading first sidesteps the limit
    // entirely regardless of file size.
    const uploadedFile = await ai.files.upload({
      file: tempFilePath,
      config: { mimeType },
    });
    uploadedFileName = uploadedFile.name ?? null;

    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      throw new Error("Gemini no devolvió una referencia válida para el archivo subido.");
    }

    const response = await ai.models.generateContent({
      model: GEMINI_TRANSCRIBE_MODEL_ID,
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        TRANSCRIBE_AND_SUMMARIZE_PROMPT,
      ]),
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text;
    if (!rawText || rawText.trim().length === 0) {
      throw new Error("Gemini devolvió una respuesta vacía.");
    }

    const result = parseGeminiJsonResponse(rawText);

    return new Response(JSON.stringify({ text: result.transcript, summary: result.summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Error inesperado transcribiendo el audio.";
    console.error("[transcribe] failed:", err);
    return jsonError(detail, 502);
  } finally {
    // Two separate cleanups: our own local temp file, and the copy Gemini
    // is holding in its Files API storage (auto-expires after 48h on
    // Google's side regardless, but there's no reason to wait on that).
    if (tempFilePath && existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("[transcribe] failed to remove local temp file:", cleanupErr);
      }
    }
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
      } catch (cleanupErr) {
        console.error("[transcribe] failed to delete uploaded Gemini file:", cleanupErr);
      }
    }
  }
}
