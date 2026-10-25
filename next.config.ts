import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E builds into its own folder so a running dev server (.next/dev) is never wiped.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Dev logs every Server Function call with its arguments; API keys saved in Settings must never reach the terminal.
  logging: { serverFunctions: false },
  // Local-first app: every page reads the local SQLite DB, so nothing is
  // statically cacheable. Keep the classic dynamic rendering model.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
