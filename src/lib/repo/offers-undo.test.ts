import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-undo-")), "test.db");

test("undo after deleting an offer puts back everything under it and re-links its contacts", async () => {
  const { db, ensureApplication, getApplication, upsertJob } = await import("@/lib/db");
  const { addReminder, getExtras, listAllContacts, listContacts, logEvent, saveContact, setExtras, setOffer, getOffer } = await import("./apps");
  const { getPack, listAnswers, saveAnswer, setPack } = await import("@/lib/apply/repo");
  const { getChecks, saveCheck } = await import("@/lib/company");
  const { deleteWithUndo, restoreDeleted } = await import("./offers");

  const job = upsertJob({ title: "Stage PFE", company: "Acme", location: "", remote: false, url: "https://x.test/undo", source: "manual", type: "pfe", description: "", tags: [], posted_at: null, deadline: null });
  const app = ensureApplication(job.id);
  setExtras(app.id, { cv_override_text: "my CV for Acme", cv_override_name: "cv.pdf" });
  saveAnswer({ application_id: app.id, qid: "why", question: "Why us?", answer: "Because.", max_chars: 600, engine: "heuristic" });
  setPack(app.id, { channel: "email", reference: "REF-1" });
  saveCheck({ job_id: job.id, status: "open", http_status: 200, reason: "" });
  logEvent(app.id, "note", "called HR");
  addReminder({ application_id: app.id, title: "Follow up", due_at: "2026-11-01" });
  setOffer(app.id, { ...getOffer(app.id), pay: 1500 });
  saveContact(app.id, { name: "Sarra", role: "Recruiter", company: "Acme", email: "", phone: "", linkedin: "", notes: "" });

  const token = deleteWithUndo([job.id]);
  assert.equal(getApplication(app.id), null);
  assert.equal(listAllContacts()[0].application_id, null, "deleting only unlinks the person");

  assert.equal(restoreDeleted(token), 1);
  assert.equal(getApplication(app.id)?.job_id, job.id);
  assert.equal(getExtras(app.id).cv_override_text, "my CV for Acme");
  assert.equal(listAnswers(app.id)[0]?.answer, "Because.");
  assert.equal(getPack(app.id).reference, "REF-1");
  assert.equal(getChecks([job.id]).get(job.id)?.status, "open");
  assert.equal(listContacts(app.id)[0]?.name, "Sarra", "the contact is linked again");
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM events WHERE application_id = ?").get(app.id) as { n: number }).n >= 1, true);
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM reminders WHERE application_id = ?").get(app.id) as { n: number }).n, 1);
  assert.equal(getOffer(app.id).pay, 1500);
  assert.equal(restoreDeleted(token), 0, "one undo only");
});
