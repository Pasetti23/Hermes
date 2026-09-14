/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // @google/genai has conditional/platform-specific export maps that
    // confuse webpack's bundler when Next tries to inline it directly into
    // the route's compiled output — the import survives compilation but
    // its actual named exports (createUserContent, createPartFromUri, ...)
    // silently end up missing from the bundle. Marking it external makes
    // Next treat it as a real `require("@google/genai")` against
    // node_modules instead, which also means the standalone build's file
    // tracer correctly copies it into `.next/standalone/node_modules`.
    serverComponentsExternalPackages: ["@google/genai"],
  },
  // The app ships as a normal Next.js server (Vercel, `next start`, Docker,
  // etc.) by default. The Tauri desktop build needs a self-contained Node
  // server it can spawn as a sidecar, which `output: "standalone"` produces
  // — but that mode changes where `next build`'s output lives, so it's only
  // switched on for the Tauri build script (`NEXT_OUTPUT=standalone`) to
  // avoid changing behavior for normal web deployments.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
