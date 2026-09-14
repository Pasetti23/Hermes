import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };

    return new Response(JSON.stringify({ version: pkg.version ?? "0.0.0" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ version: "0.0.0" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
