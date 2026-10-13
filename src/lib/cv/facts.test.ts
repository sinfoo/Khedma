import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFacts } from "./facts";

const SRC = `# Amira Ben Salah
amira@etudiant-enit.utm.tn · +216 22 123 456 · github.com/amirabs

## Formation
### ENIT – Génie informatique, 2023 – 2026

## Expérience
### Stage d'été – Vermeg, Tunis (07/2024 – 08/2024)
- Développé une API REST avec Django et PostgreSQL pour 200 utilisateurs, temps de réponse réduit de 30 %.
- Automatisé le déploiement avec Docker et GitHub Actions.

## Compétences
Python, Java, SQL, Git, Docker`;

test("existing facts pass, accents and case ignored", () => {
  const gen = `# Amira Ben Salah
## Experience
### Summer internship - VERMEG, Tunis (07/2024 - 08/2024)
- Built a REST API with django and postgresql for 200 users, cut response time by 30%.
- Automated deployment with Docker and GitHub Actions at Vermeg.
## Education
ENIT, Genie informatique, 2023-2026`;
  assert.deepEqual(checkFacts(SRC, gen), []);
});

test("invented tool, number, year and employer are caught", () => {
  const gen = `- Built a React Native app with Django for 5000 users in 2021.
- Led a team of 4 engineers at Instadeep.
- Studied at Université de Carthage.`;
  const f = checkFacts(SRC, gen);
  const by = (k: string) => f.filter((x) => x.kind === k).map((x) => x.value);
  assert.deepEqual(by("tool"), ["React Native"]);
  assert.ok(by("number").includes("5000"));
  assert.ok(by("number").includes("4"));
  assert.deepEqual(by("year"), ["2021"]);
  assert.ok(by("org").some((v) => /Instadeep/.test(v)));
  assert.ok(by("org").some((v) => /Carthage/.test(v)));
  assert.match(f.find((x) => x.value === "React Native")!.sentence, /React Native app/);
});

test("placeholders, list numbering and links are not facts", () => {
  const gen = `1. Built an API for [number] users (https://example.com/42).
2. Contact: amira@etudiant-enit.utm.tn, 2023 – 2026 at ENIT.`;
  assert.deepEqual(checkFacts(SRC, gen), []);
});

test("thousand separators and percent normalise", () => {
  const src = "Processed 1,200 records (12.5% faster).";
  assert.deepEqual(checkFacts(src, "Processed 1200 records, 12.5 % faster."), []);
  assert.equal(checkFacts(src, "Processed 1300 records.").length, 1);
});
