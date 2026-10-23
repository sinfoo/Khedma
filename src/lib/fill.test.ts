import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-fill-")), "test.db");

// The extension's matcher (plain browser script); it exports its pure parts under node.
const { classify, answerFor } = createRequire(import.meta.url)("../../extension/fill.js") as {
  classify: (label: string) => string | null;
  answerFor: (label: string, answers: { question: string; answer: string }[]) => string | null;
};

test("form labels map to profile fields in English and French", () => {
  const cases: [string, string | null][] = [
    ["First Name *", "first"],
    ["Prénom", "first"],
    ["Last name", "last"],
    ["Nom", "last"],
    ["Nom et prénom", "name"],
    ["Full name", "name"],
    ["Email address", "email"],
    ["Adresse e-mail", "email"],
    ["Phone", "phone"],
    ["Téléphone portable", "phone"],
    ["LinkedIn Profile", "linkedin"],
    ["GitHub URL", "github"],
    ["Website", "portfolio"],
    ["Current location", "city"],
    ["Cover Letter", "letter"],
    ["Gender", null],
    ["Are you legally authorized to work in France?", null],
  ];
  for (const [label, want] of cases) assert.equal(classify(label), want, label);
});

test("a custom question finds its saved answer, accents and punctuation aside; short labels never match", () => {
  const answers = [{ question: "Pourquoi souhaitez-vous rejoindre Doctolib ?", answer: "Parce que…" }];
  assert.equal(answerFor("Pourquoi souhaitez vous rejoindre Doctolib *", answers), "Parce que…");
  assert.equal(answerFor("Pourquoi ?", answers), null);
  assert.equal(answerFor("Quel est votre salaire attendu ?", answers), null);
});

test("the page of a posting, or its apply sub-page, finds the application and its saved answers", async () => {
  const { upsertJob, ensureApplication, updateProfile, updateApplication } = await import("./db");
  const { saveAnswer } = await import("./apply/repo");
  const { fillData } = await import("./fill");
  updateProfile({ name: "Amira Ben Salah", email: "amira@example.tn" });
  const job = upsertJob({ title: "Stage PFE", company: "Acme", location: "", remote: false, url: "https://jobs.lever.co/acme/123", source: "lever", type: "pfe", description: "", tags: [], posted_at: null, deadline: null });
  const app = ensureApplication(job.id);
  updateApplication(app.id, { cover_letter_md: "**Amira Ben Salah**\n\nMadame, Monsieur," });
  saveAnswer({ application_id: app.id, qid: "custom:why", question: "Why Acme?", answer: "Because of the product.", max_chars: 0, engine: "manual" });

  const d = fillData("https://jobs.lever.co/acme/123/apply?lever-source=LinkedIn");
  assert.deepEqual([d.first, d.last, d.email], ["Amira", "Ben Salah", "amira@example.tn"]);
  assert.deepEqual(d.job, { title: "Stage PFE", company: "Acme" });
  assert.deepEqual(d.answers, [{ question: "Why Acme?", answer: "Because of the product." }]);
  assert.equal(d.letter, "Amira Ben Salah\n\nMadame, Monsieur,");

  const other = fillData("https://jobs.lever.co/acme/1234");
  assert.equal(other.job, null, "a longer id is another posting");
  assert.deepEqual(other.answers, []);
});
