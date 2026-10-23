import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-rerank-")), "test.db");

test("a new CV re-ranks the open offers: a designer's CV puts the design offer above the backend one", async () => {
  const { upsertJob, updateProfile, getJob, db } = await import("@/lib/db");
  const { rerankOpenJobs, defaultKeywords } = await import("./sources");
  const job = (title: string, description: string, url: string) =>
    upsertJob({ title, company: "Acme", location: "Tunis", remote: false, url, source: "manual", type: "stage", description, tags: [], posted_at: null, deadline: null }).id;
  const design = job("Stage UI/UX Designer", "Figma, prototypes, user research.", "https://x.test/1");
  const backend = job("Stage Développeur Back-End Java", "Spring Boot, API REST, PostgreSQL.", "https://x.test/2");
  updateProfile({ name: "B. Belhassen", skills: ["Figma"], target_roles: [], cv_md: "# B. Belhassen\n\n**UX UI Designer**\n\n## Experience\n### UX UI Designer - mssolutions\n- Wireframes and user flows in Figma" });

  assert.ok(defaultKeywords((await import("@/lib/db")).getProfile()).includes("ui/ux designer"));
  assert.equal(rerankOpenJobs(), 2);
  const rel = (id: number) => (db().prepare("SELECT relevance FROM jobs WHERE id = ?").get(id) as { relevance: number }).relevance;
  assert.ok(rel(design) > rel(backend), `design ${rel(design)} > backend ${rel(backend)}`);
  assert.ok(getJob(design));
});
