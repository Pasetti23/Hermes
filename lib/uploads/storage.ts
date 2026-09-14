import path from "node:path";

export interface ImageStorageLocation {
  /** Absolute directory on disk to write/read image files. */
  dir: string;
  /** URL prefix the client should use to fetch a stored image back. */
  urlPrefix: string;
}

/**
 * `HERMES_USER_DATA_DIR` is set by src-tauri/src/main.rs (only in the
 * packaged desktop build) to the OS-appropriate user-data directory
 * (`%APPDATA%\<identifier>` on Windows, etc.) — the Tauri equivalent of
 * Electron's `app.getPath('userData')`. Writing into the app's own install
 * directory (what `public/uploads/images` resolves to once bundled) fails
 * there without admin rights, which is exactly why this exists.
 *
 * When that env var isn't set (plain `next dev`/`next start`/Vercel), we're
 * not running inside the packaged app at all, so `public/uploads/images`
 * — served automatically and for free by Next's static file handling —
 * remains the simplest option.
 */
export function resolveImageStorageLocation(): ImageStorageLocation {
  const userDataDir = process.env.HERMES_USER_DATA_DIR;

  if (userDataDir && userDataDir.trim().length > 0) {
    return {
      dir: path.join(userDataDir, "uploads", "images"),
      // Can't rely on Next's public/ static serving for a directory outside
      // the project — app/api/uploads/images/[filename]/route.ts streams
      // these back instead.
      urlPrefix: "/api/uploads/images",
    };
  }

  return {
    dir: path.join(process.cwd(), "public", "uploads", "images"),
    urlPrefix: "/uploads/images",
  };
}
