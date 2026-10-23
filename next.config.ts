import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E builds into its own folder so a running dev server (.next/dev) is never wiped.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
