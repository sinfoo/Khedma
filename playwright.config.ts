import path from "node:path";
import { defineConfig } from "@playwright/test";

// E2E runs a production build on its own port, data folder and build folder, so the dev server and the
// real database (./data) are never touched. Uses the installed Chrome (no browser download).
const PORT = 3107;
const DB = path.resolve("e2e/.data/e2e.db");

export default defineConfig({
  testDir: "e2e",
  workers: 1, // SQLite: one writer
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", locale: "fr-FR" },
  webServer: {
    command: `npx tsx e2e/seed.ts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/app`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { KHEDMA_DB: DB, NEXT_DIST_DIR: ".next-e2e", ANTHROPIC_API_KEY: "", PORT: String(PORT), KHEDMA_NO_LEARN_REFRESH: "1" },
  },
});
