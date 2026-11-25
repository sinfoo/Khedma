import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-matrix-")), "test.db");

test("skillMatrix counts each skill once per offer, split by offer type", async () => {
  const { skillMatrix } = await import("./insights");
  const job = (id: number, type: "stage" | "pfe", description: string) =>
    ({ id, title: "Dev", company: "Acme", location: "", remote: false, url: `https://x/${id}`, source: "manual", type, description, tags: [], posted_at: null, deadline: null, created_at: "", archived: false, starred: false, evaluation: null, application: null }) as Parameters<typeof skillMatrix>[0][number];
  const m = skillMatrix([job(1, "stage", "Python and Docker"), job(2, "stage", "Python, Python again"), job(3, "pfe", "Docker")]);
  assert.deepEqual(m.types, ["stage", "pfe"]);
  const row = (skill: string) => m.rows.find((r) => r.skill === skill)!;
  assert.deepEqual([row("Python").total, row("Python").byType], [2, { stage: 2, pfe: 0 }]);
  assert.deepEqual([row("Docker").total, row("Docker").byType], [2, { stage: 1, pfe: 1 }]);
});
