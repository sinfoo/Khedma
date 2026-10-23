import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-contacts-")), "test.db");

test("contacts form a network: with or without an application, and they outlive a deleted application", async () => {
  const { upsertJob, ensureApplication, db } = await import("@/lib/db");
  const { saveContact, deleteContact, listAllContacts, listContacts } = await import("./apps");
  const job = upsertJob({ title: "Stage PFE", company: "Acme", location: "", remote: false, url: "https://x.test/1", source: "manual", type: "pfe", description: "", tags: [], posted_at: null, deadline: null });
  const app = ensureApplication(job.id);
  const person = { role: "Recruiter", company: "", email: "", phone: "", linkedin: "", notes: "" };
  saveContact(app.id, { ...person, name: "Sarra", company: "Acme" });
  saveContact(null, { ...person, name: "Ali (ENIT alumnus)", company: "Vermeg" });

  const all = listAllContacts();
  assert.deepEqual(all.map((c) => [c.name, c.company, c.application_id, c.job_title]), [
    ["Ali (ENIT alumnus)", "Vermeg", null, null],
    ["Sarra", "Acme", app.id, "Stage PFE"],
  ]);
  assert.equal(listContacts(app.id).length, 1, "an application still sees only its own people");

  // Editing a network contact with the wrong application changes nothing.
  const ali = all[0];
  saveContact(app.id, { ...person, name: "Wrong" }, ali.id);
  assert.equal(listAllContacts()[0].name, "Ali (ENIT alumnus)");

  db().prepare("DELETE FROM applications WHERE id = ?").run(app.id);
  const sarra = listAllContacts().find((c) => c.name === "Sarra")!;
  assert.equal(sarra.application_id, null, "the person stays in the network");
  deleteContact(null, sarra.id);
  assert.equal(listAllContacts().length, 1);
});
