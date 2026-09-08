// Next's `output: "standalone"` build produces a self-contained server at
// `.next/standalone/server.js`, but deliberately leaves out static assets
// (`.next/static` and `public/`) — Next's own docs say to copy those in
// manually. This script does that, landing everything inside
// `src-tauri/resources/standalone/`, which `tauri.conf.json`'s
// `bundle.resources` maps into the packaged app. It's invoked by
// `beforeBuildCommand` right after `next build`, so it only ever runs
// as part of `tauri build` — never during `tauri dev`.
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const standaloneSrc = join(projectRoot, ".next", "standalone");
const staticSrc = join(projectRoot, ".next", "static");
const publicSrc = join(projectRoot, "public");
const envLocalSrc = join(projectRoot, ".env.local");

const target = join(projectRoot, "src-tauri", "resources", "standalone");

function fail(message) {
  console.error(`[copy-standalone-to-tauri] ${message}`);
  process.exit(1);
}

if (!existsSync(standaloneSrc)) {
  fail(
    `Expected ${standaloneSrc} to exist. Run "NEXT_OUTPUT=standalone npm run build" before this script ` +
      "(tauri.conf.json's beforeBuildCommand already does this for you automatically)."
  );
}

// Start clean so stale files from a previous build never linger in the
// bundle, but keep the directory itself so `tauri dev`'s config validation
// (which checks that resource paths exist) always has something to find.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(standaloneSrc, target, { recursive: true });

if (existsSync(staticSrc)) {
  cpSync(staticSrc, join(target, ".next", "static"), { recursive: true });
} else {
  console.warn(`[copy-standalone-to-tauri] ${staticSrc} not found — skipping static assets.`);
}

if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(target, "public"), { recursive: true });
} else {
  console.warn(`[copy-standalone-to-tauri] ${publicSrc} not found — skipping public assets.`);
}

// Copy .env.local into the target standalone folder as .env so Next.js standalone can load it at runtime
if (existsSync(envLocalSrc)) {
  copyFileSync(envLocalSrc, join(target, ".env"));
  console.log(`[copy-standalone-to-tauri] Copied .env.local to ${join(target, ".env")}`);
} else {
  console.warn(`[copy-standalone-to-tauri] ${envLocalSrc} not found — environment variables might be missing.`);
}

// main.rs looks for the server at exactly
// `resource_dir.join("standalone").join("server.js")`, and
// `tauri.conf.json`'s `bundle.resources` maps this whole directory to
// "standalone" inside the packaged app's resources — so this exact path is
// what main.rs will find at runtime. Verify it landed here now rather than
// failing mysteriously inside the built app later.
const serverEntry = join(target, "server.js");
if (!existsSync(serverEntry)) {
  fail(
    `Expected the standalone server at ${serverEntry} after copying, but it's missing. ` +
      'Check that next.config.mjs has output: "standalone" wired to NEXT_OUTPUT and that ' +
      "the build above actually succeeded."
  );
}

console.log(`[copy-standalone-to-tauri] Copied standalone server + assets into ${target}`);