import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  outputFileTracingRoot: root,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: process.env.SKIP_NEXT_TYPECHECK === "1" },
};
