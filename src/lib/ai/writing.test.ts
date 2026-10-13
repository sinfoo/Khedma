import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicFix, lintWriting, sentenceAt, WRITING_RULES, styleBlock } from "./writing";

const rules = (t: string, l: "fr" | "en" = "en"): string[] => lintWriting(t, l).map((f) => f.rule);

test("EN slop is caught", () => {
  const r = rules(
    "I am writing to express my interest. In today's fast-paced world, I leverage cutting-edge tools to deliver seamless results! Furthermore, it's not about the code, it's about the impact — and I have three years of experience.",
  );
  for (const x of ["genericOpener", "deadPhrase", "banned", "transition", "negativeParallel", "emDash", "spelledNumber", "exclamation"]) assert.ok(r.includes(x), x);
});

test("FR slop is caught", () => {
  const r = rules(
    "Je me permets de vous écrire. Passionné par l'informatique et force de proposition, je suis dynamique et motivé. En outre, ce n'est pas une question de diplôme, c'est une question d'attitude. N'hésitez pas à me contacter — j'ai deux ans d'expérience.",
    "fr",
  );
  for (const x of ["genericOpener", "banned", "transition", "negativeParallel", "emDash", "spelledNumber"]) assert.ok(r.includes(x), x);
  const first = lintWriting("Je me permets de vous écrire.", "fr")[0];
  assert.equal(first.severity, "error");
  assert.match(first.suggestion, /poste/);
});

test("follow-up openers", () => {
  assert.ok(rules("Just checking in on my application.").includes("followupOpener"));
  assert.ok(rules("Je me permets de revenir vers vous concernant ma candidature.", "fr").includes("followupOpener"));
});

test("more negative parallelisms", () => {
  assert.ok(rules("Not a buzzword. A shipped product.").includes("negativeParallel"));
  assert.ok(rules("Not only did I build the API, but also the frontend.").includes("negativeParallel"));
  assert.ok(rules("Il ne s'agit pas de coder, mais de livrer.", "fr").includes("negativeParallel"));
});

test("clean text has no findings", () => {
  const cv = `# Amira Ben Salah
amira@etudiant-enit.utm.tn · +216 22 123 456

## Formation
### ENIT – Génie informatique, 2023 – 2026

## Expérience
- Développé une API REST avec Django et PostgreSQL pour 200 utilisateurs, temps de réponse réduit de 30 %.
- Automatisé le déploiement avec Docker et GitHub Actions.

## Compétences
Python, Java, SQL, Git`;
  assert.deepEqual(lintWriting(cv, "fr"), []);
  const letter = "Bonjour Madame Trabelsi,\n\nVotre offre de stage PFE sur la détection de fraude correspond à mon projet de 3e année : un modèle XGBoost entraîné sur 1,2 million de transactions (AUC 0,94). Je serais disponible dès février 2026.\n\nCordialement,\nAmira";
  assert.deepEqual(lintWriting(letter, "fr"), []);
  assert.deepEqual(lintWriting("I built a REST API for 200 users with Django; response time dropped 30%. Available from February 2026.", "en"), []);
});

test("sentence extraction and fixes", () => {
  const t = "First line. I leverage tools daily. Last one.";
  assert.equal(sentenceAt(t, t.indexOf("leverage")), "I leverage tools daily.");
  const f = lintWriting(t, "en")[0];
  assert.equal(heuristicFix(f), "I use tools daily.");
  assert.equal(heuristicFix({ rule: "emDash", excerpt: "—", sentence: "A — B." }), "A, B.");
  assert.equal(heuristicFix({ rule: "spelledNumber", excerpt: "three years", sentence: "I have three years of Java." }), "I have 3 years of Java.");
  assert.equal(heuristicFix({ rule: "transition", excerpt: "Furthermore", sentence: "Furthermore, I ship." }), "I ship.");
  assert.equal(heuristicFix({ rule: "negativeParallel", excerpt: "x", sentence: "It's not about the code, it's about the impact." }), "It's about the impact.");
  assert.equal(heuristicFix({ rule: "exclamation", excerpt: "!", sentence: "Thanks!" }), "Thanks.");
});

test("prompt helpers", () => {
  assert.match(WRITING_RULES, /em dashes/);
  assert.equal(styleBlock(null), "");
  const b = styleBlock({ writing_sample: "Hi there.", house_rules: "jamais de tutoiement" });
  assert.match(b, /Hi there/);
  assert.match(b, /tutoiement/);
});
