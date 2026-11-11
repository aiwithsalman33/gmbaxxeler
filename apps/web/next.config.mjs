import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  outputFileTracingRoot: root,
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false,
  typescript: { ignoreBuildErrors: process.env.SKIP_NEXT_TYPECHECK === "1" },
  // Local UI work only: `DEV_API_PROXY=http://127.0.0.1:8080 pnpm dev` reuses a running stack's API and media.
  async rewrites() {
    const target = process.env.DEV_API_PROXY;
    if (!target) return [];
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/media/:path*", destination: `${target}/media/:path*` },
    ];
  },
};
