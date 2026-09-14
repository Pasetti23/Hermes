// Keeps package.json (the single source of truth for the app version),
// src-tauri/tauri.conf.json, and src-tauri/Cargo.toml in lockstep.
//
// Wired into npm's version lifecycle (see package.json's "version" script),
// so a single `npm version patch|minor|major` bumps package.json, runs
// this, stages the two Tauri files, and lets npm create the commit + git
// tag (vX.Y.Z) — one command, nothing to keep in sync by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const pkgPath = join(projectRoot, "package.json");
const tauriConfPath = join(projectRoot, "src-tauri", "tauri.conf.json");
const cargoTomlPath = join(projectRoot, "src-tauri", "Cargo.toml");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = pkg.version;

if (!version || typeof version !== "string") {
  console.error("[sync-version] package.json has no valid \"version\" field.");
  process.exit(1);
}

// tauri.conf.json
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`);

// Cargo.toml — plain text replace of the `version = "..."` line under
// [package] (the first one in the file; build-dependencies/dependencies
// have their own `version = "..."` fields too, so anchor on [package]).
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const packageSectionMatch = cargoToml.match(/(\[package\][^[]*?version\s*=\s*")([^"]+)(")/);

if (!packageSectionMatch) {
  console.error('[sync-version] Could not find version = "..." under [package] in Cargo.toml.');
  process.exit(1);
}

const updatedCargoToml = cargoToml.replace(
  packageSectionMatch[0],
  `${packageSectionMatch[1]}${version}${packageSectionMatch[3]}`
);
writeFileSync(cargoTomlPath, updatedCargoToml);

console.log(`[sync-version] Synced version ${version} into tauri.conf.json and Cargo.toml.`);
