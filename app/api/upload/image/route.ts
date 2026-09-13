import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_IMAGE_SIZE_BYTES,
  validateImageFile,
} from "@/lib/uploads/validation";

// Needs the Node.js runtime (not Edge) for filesystem access — `fs`/`path`
// aren't available in the Edge runtime the AI completion route uses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "images");

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return jsonError("No se recibió ningún archivo en el campo 'file'.", 400);
    }

    const validation = validateImageFile({ name: file.name, type: file.type, size: file.size });
    if (!validation.valid) {
      return jsonError(validation.reason ?? "Archivo inválido.", 400);
    }

    const extension = path.extname(file.name).toLowerCase();
    const safeName = `${randomUUID()}${extension}`;

    await mkdir(UPLOAD_DIR, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Belt-and-suspenders: re-check the real byte size against the declared
    // one before writing anything to disk — `file.size` comes from the
    // browser and, while normally trustworthy, shouldn't be the only gate.
    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      return jsonError(`La imagen supera el límite de ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB.`, 413);
    }

    await writeFile(path.join(UPLOAD_DIR, safeName), buffer);

    return new Response(JSON.stringify({ url: `/uploads/images/${safeName}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Error inesperado subiendo la imagen.";
    console.error("[upload/image] failed:", err);
    return jsonError(detail, 500);
  }
}
