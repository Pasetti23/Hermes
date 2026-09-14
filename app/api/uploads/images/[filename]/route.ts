import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveImageStorageLocation } from "@/lib/uploads/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(_req: Request, { params }: { params: { filename: string } }): Promise<Response> {
  // path.basename strips any directory components a malicious filename
  // param might smuggle in (e.g. "../../secrets.txt") — the only thing this
  // route should ever be able to read is a single file directly inside the
  // resolved images directory.
  const safeName = path.basename(params.filename);
  const extension = path.extname(safeName).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];

  if (!mimeType) {
    return new Response("Unsupported file type.", { status: 400 });
  }

  const { dir } = resolveImageStorageLocation();
  const filePath = path.join(dir, safeName);

  if (!existsSync(filePath)) {
    return new Response("Not found.", { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
