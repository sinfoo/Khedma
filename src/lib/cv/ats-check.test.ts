import { test } from "node:test";
import assert from "node:assert/strict";
import { atsVerify, gradeFor } from "./ats-check";
import { atsPlainText, keywordCoverage, normalizeForAts, paperFor, paperForLocation } from "./export";

const CV = `# Amira Ben Salah
amira@etudiant-enit.utm.tn · +216 22 123 456

## Formation
### ENIT – Génie informatique, 2023 – 2026

## Expérience
- Développé une API REST avec Django et PostgreSQL pour 200 utilisateurs, temps de réponse réduit de 30 %.
- Automatisé le déploiement avec Docker et GitHub Actions, tests unitaires à 85 % de couverture.
- Conçu un tableau de bord Power BI pour le suivi hebdomadaire de 12 indicateurs.

## Compétences
Python, Java, SQL, Git, Docker, Django, React

## Langues
Arabe (natif), Français (C1), Anglais (B2)`;

test("clean single-column CV scores A", () => {
  const r = atsVerify(CV, { columns: 1, fonts: ["Arial"] });
  assert.equal(r.score, 100);
  assert.equal(r.grade, "A");
  assert.deepEqual(r.missing, []);
  assert.equal(r.pages, 1);
});

test("two columns, odd font and missing headings cost points", () => {
  const r = atsVerify(CV.replace("## Compétences", "## Divers"), { columns: 2, fonts: ["Instrument Sans"] });
  assert.equal(r.score, 100 - 20 - 10 - 20);
  assert.equal(r.grade, "D");
  assert.deepEqual(r.missing, ["skills"]);
  assert.ok(r.items.find((i) => i.id === "fonts")!.detail!.includes("instrument sans"));
});

test("no email, table and zero-width text are caught", () => {
  const r = atsVerify(`${CV.replace(/amira@\S+/, "")}\n\n| a | b |\n|---|---|\n​Python`, {});
  const bad = r.items.filter((i) => !i.ok).map((i) => i.id);
  assert.deepEqual(bad.sort(), ["contact", "hidden", "layout"]);
  assert.equal(gradeFor(74), "C");
  assert.equal(gradeFor(75), "B");
});

test("unicode normalisation and paper size", () => {
  assert.equal(normalizeForAts("A — B “q” ‘s’ …​•x"), 'A - B "q" \'s\' ...-x');
  assert.equal(paperFor(["TN", "FR"]), "a4");
  assert.equal(paperFor(["REMOTE", "US"]), "letter");
  assert.equal(paperForLocation("Montréal, Canada"), "letter");
  assert.equal(paperForLocation("Lac 2, Tunis"), "a4");
  assert.equal(paperForLocation(""), null);
});

test("ATS plain text uses standard uppercase headings", () => {
  const txt = atsPlainText(CV, "en");
  assert.match(txt, /^AMIRA BEN SALAH\n/);
  assert.match(txt, /\nEDUCATION\n/);
  assert.match(txt, /\nEXPERIENCE\n- /);
  assert.ok(!/[#*—]/.test(txt));
  assert.match(atsPlainText(CV, "fr"), /\nCOMPÉTENCES\n/);
});

test("keyword coverage", () => {
  const c = keywordCoverage("Stage: Python, Docker, Kubernetes et React", CV);
  assert.equal(c.pct, 75);
  assert.deepEqual(c.missing, ["Kubernetes"]);
  assert.equal(keywordCoverage("rien", CV).pct, null);
});
