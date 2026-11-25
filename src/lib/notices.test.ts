import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-notices-")), "test.db");

test("notices and the week agenda read stored dates as local time", async () => {
  const { db, upsertJob, ensureApplication } = await import("./db");
  const { getNotices } = await import("./notices");
  const { weekAgenda } = await import("./repo/insights");
  const job = (url: string, deadline: string | null) => ({ title: "Dev", company: "Acme", location: "", remote: false, url, source: "manual" as const, type: "stage" as const, description: "", tags: [], posted_at: null, deadline });
  const app = ensureApplication(upsertJob(job("https://x/1", "2026-06-17T23:59:00")).id).id; // last day of the week ahead, with a time
  upsertJob(job("https://x/2", "2026-06-13T18:00:00")); // third day ahead, with a time
  const iv = db().prepare("INSERT INTO interviews (application_id, starts_at) VALUES (?, ?)");
  iv.run(app, "2026-06-10T00:10"); // 20 minutes ago
  iv.run(app, "2026-06-10T09:00");
  db().prepare("INSERT INTO reminders (title, due_at) VALUES ('call back', '2026-06-09')").run();

  const now = new Date(2026, 5, 10, 0, 30); // 00:30 local on 10 June: still 9 June in UTC for zones east of Greenwich
  const notices = getNotices(now);
  assert.deepEqual(notices.filter((n) => n.kind === "interview").map((n) => n.at), ["2026-06-10T09:00"], "a past interview is not upcoming");
  assert.equal(notices.find((n) => n.kind === "reminder")!.overdue, true, "yesterday's reminder is overdue");
  assert.deepEqual(notices.filter((n) => n.kind === "deadline").map((n) => n.at), ["2026-06-13T18:00:00"]);
  assert.ok(weekAgenda(now).some((a) => a.kind === "deadline" && a.day === "2026-06-17"), "a deadline with a time counts on its day");
});
