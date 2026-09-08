/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [],
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
