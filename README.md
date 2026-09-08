# Canvas — AI-native note editor

A block-based document editor (Next.js 14 + Tiptap 2) with AI embedded
directly in the writing canvas: a slash menu, a selection bubble menu,
`Cmd+J` free-form prompting, and a Notion-style Meeting Assistant with live
speech-to-text and AI-generated structured notes.

## Stack

- **Frontend**: Next.js 14 (App Router), TypeScript (strict), Tailwind CSS, Tiptap 2
- **AI**: Vercel AI SDK v4 (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`), streaming via `useCompletion`
- **Persistence**: `localStorage`-backed multi-document workspace (pages + folders), see `lib/workspace/documents.ts`

## Getting started

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

Open `http://localhost:3000`.

## Project structure

```
app/
  api/ai/completion/route.ts   # Edge streaming endpoint (OpenAI/Gemini)
  layout.tsx, page.tsx         # Root layout + workspace shell
components/
  editor/                      # Editor, Sidebar, MeetingRecorder, AI menus
  ui/                          # Small shared primitives (Button, Input, ...)
lib/
  ai/                          # System prompts, actions, meeting presets
  tiptap/                      # Editor extensions + transaction helpers
  workspace/                   # Multi-document CRUD over localStorage
types/                         # Shared TypeScript types
src-tauri/                     # Desktop shell (see below) — optional
```

Everything is imported via the `@/*` path alias (configured in
`tsconfig.json`), so new components, Tiptap extensions, or integrations can
be dropped into `lib/`, `components/`, or a new top-level folder without
touching existing import paths.

## Adding things later

- **New Tiptap extension**: register it in `lib/tiptap/extensions.ts`; add any new transaction helpers to `lib/tiptap/helpers.ts`.
- **New AI action**: add it to `AIActionKey` in `types/index.ts`, its instruction in `lib/ai/prompts.ts`, and wire a trigger in `AIBubbleMenu.tsx` / `AICommandMenu.tsx`.
- **New AI provider**: add a `create...` client in `app/api/ai/completion/route.ts` next to the existing OpenAI/Google ones and extend `selectModel`.
- **A real database instead of localStorage**: `lib/workspace/documents.ts` is the only module that knows about the storage mechanism — swap its internals for API calls to a backend without touching `Sidebar.tsx` or `Editor.tsx`.

## Desktop build (Tauri)

```bash
npm run tauri:dev     # runs `next dev` and opens it in a native window
npm run tauri:build   # builds Next in standalone mode, then bundles with Tauri
```

**Read this before relying on `tauri:build`:** this repo has server-side API
routes (Edge runtime, streaming, secret API keys) — it can't be shipped as a
static export. `beforeBuildCommand` runs `next build` in standalone mode and
then `scripts/copy-standalone-to-tauri.mjs`, which copies
`.next/standalone/` plus the static assets Next deliberately leaves out of
that output (`.next/static/`, `public/`) into `src-tauri/resources/standalone/`.
`tauri.conf.json`'s `bundle.resources` maps that folder into the packaged
app as `standalone`, and `src-tauri/src/main.rs` spawns
`resources/standalone/server.js` with `node` as a child process — but only
*after* polling `127.0.0.1:3000` until it actually accepts a connection.
The main window is created programmatically in Rust at that point (it's
**not** declared in `tauri.conf.json` — `"windows": []` — specifically so it
can't be created before the server is confirmed ready). Any failure along
the way (missing server file, Node not on PATH, server not responding in
time) shows a native error dialog instead of failing silently. See the
design-notes comment block at the top of `main.rs` for the full reasoning.
This means the built desktop app currently **requires Node.js to be
installed on the end user's machine** — it is not yet a fully
self-contained native binary. Bundling a pinned Node runtime as a proper
Tauri sidecar (`externalBin`) so end users need nothing preinstalled is the
natural next step.

`src-tauri/resources/standalone/` only has a `NOTE.txt` placeholder in this
repo (so `tauri dev` — which never runs the build step — always finds an
existing, non-empty resource directory to validate against) and gets wiped
and refilled by the copy script right before `tauri build` packages the
app; only the `.gitkeep` placeholder is tracked in git, the generated
contents are excluded.

This scaffolding (`tauri.conf.json`, `Cargo.toml`, `main.rs`, the copy
script) was written and reviewed carefully. Verification status, to be
precise about what has and hasn't actually been checked:

- **JS/TS side**: fully verified — `npm run typecheck`, `next build` (both
  normal and `NEXT_OUTPUT=standalone`), and
  `scripts/copy-standalone-to-tauri.mjs` were all actually run end-to-end,
  confirming the server lands at exactly
  `src-tauri/resources/standalone/server.js`, matching what `main.rs` looks up.
- **Rust side**: `cargo check` could not be completed — Ubuntu's packaged
  `rustc`/`cargo` (1.75) is too old for current Tauri's transitive
  dependencies (`edition2024`), and this environment has no access to
  `rustup`'s distribution servers to install a newer toolchain. A
  crate-free `rustc` syntax pass on `main.rs` ran cleanly (zero syntax
  errors — only the expected "unresolved import" errors for external
  crates it couldn't see without Cargo). The Windows-only branch
  (`#[cfg(target_os = "windows")]`, using `CommandExt::creation_flags` to
  set `CREATE_NO_WINDOW`) is compiled out entirely on this Linux sandbox,
  and cross-compiling to `x86_64-pc-windows-gnu` to check it anyway failed
  because that target's `std` isn't installed here and installing it needs
  `rustup` (same network restriction). That block's correctness rests on
  `CommandExt`/`creation_flags`/`0x08000000` being well-established, stable
  std APIs — not on having actually compiled it. Run `cargo check` from
  `src-tauri/` on a real Windows machine (Rust 1.85+ recommended) before
  shipping.
- If Node still exits immediately after this fix, check
  `canvas-node.log` next to the executable (Node's own stdout/stderr,
  now captured instead of discarded) and `canvas-server.log` (this app's
  own diagnostics, including the child's exit status if it died before the
  port opened) — both are new as of this round of fixes.

App icons (`src-tauri/icons/`) are already generated from `app-icon.png`;
see `src-tauri/icons/README.md` if you ever need to regenerate them from a
new logo.

## Type-checking & builds

```bash
npm run typecheck   # tsc --noEmit
npm run build        # next build
```
