import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E builds into its own folder so a running dev server (.next/dev) is never wiped.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Dev logs every Server Function call with its arguments; API keys saved in Settings must never reach the terminal.
  logging: { serverFunctions: false },
  // Baseline hardening. Frames only from Khedma itself (the CV and letter previews are same-origin iframes).
  // ponytail: no script-src yet; Next's inline scripts and the OCR/PDF workers need nonces, a separate change.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
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
