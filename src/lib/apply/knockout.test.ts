import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Job, type Profile } from "../types";
import { EMPTY_EXTRA } from "../cv/model";
import { atsKind, knockouts } from "./knockout";
import { detectQuestions, isSensitiveQuestion } from "./questions";
import { matchBank, normalizeQuestion, profileFactAnswer, type BankAnswer } from "./bank";
import { enforceLimits, heuristicFields, INTRO_LENGTHS, PROJECT_MAX } from "./fields";
import { fallbackAnswers } from "../ai/apply";

const job: Job = {
  id: 3, title: "Développeur backend", company: "Oasis Cloud", location: "Sfax", remote: false, url: "https://jobs.ashbyhq.com/oasis/123",
  source: "ashby", type: "emploi", tags: [], posted_at: null, deadline: null, created_at: "2026-10-01", archived: false, starred: false,
  description: `Nous recherchons un développeur avec minimum 3 ans d'expérience en Node.js.
Diplôme d'ingénieur requis. Poste 100% sur site à Sfax. Anglais courant exigé.
Stage non rémunéré pour la période d'intégration.`,
};
const profile: Profile = {
  id: 1, name: "Amine", email: "a@example.com", headline: "élève ingénieur en informatique (2e année) à l'ENIT",
  cv_md: "# Amine\n\n## Projets\n### Gestionnaire de bibliothèque\n- Application web Java/Spring Boot + MySQL, 3 mois\n### Site club robotique\n- HTML/CSS/JavaScript\n\n## Compétences\n- Java, Python, SQL, Git",
  skills: ["Java", "Python"], target_roles: [], target_locations: ["Tunis"], target_types: ["stage"], languages: ["fr", "en"], settings: DEFAULT_SETTINGS,
};
const extra = { ...EMPTY_EXTRA, langs: [{ name: "Anglais", level: "B2" as const }], places: { countries: ["TN"], cities: ["Tunis"], remote: "yes" as const } };

test("knockouts: years, degree, on-site city, language bar, unpaid — each quoting the posting", () => {
  const ko = knockouts(job, profile, extra);
  const keys = ko.map((k) => k.key);
  for (const k of ["years", "degree", "onsite", "language", "unpaid"]) assert.ok(keys.includes(k as never), k);
  const years = ko.find((k) => k.key === "years")!;
  assert.equal(years.level, "danger");
  assert.equal(years.vars.n, 3);
  assert.match(years.quote, /3 ans d'expérience/);
  assert.equal(ko.find((k) => k.key === "onsite")!.vars.city, "Sfax");
  // silence is not permission: a clean posting raises nothing
  assert.deepEqual(knockouts({ ...job, description: "Stage d'été Java à Tunis, 800 DT.", location: "Tunis" }, profile, extra), []);
});

test("atsKind detects the ATS from the posting URL", () => {
  assert.equal(atsKind(job.url), "ashby");
  assert.equal(atsKind("https://jobs.lever.co/acme/1"), "lever");
  assert.equal(atsKind("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/1"), "workday");
  assert.equal(atsKind("https://acme.tn/careers"), null);
});

test("sensitive questions are flagged and never get invented values", () => {
  const qs = detectQuestions(job.description);
  assert.ok(qs.find((q) => q.id === "salary")!.sensitive && !qs.find((q) => q.id === "why_you")!.sensitive);
  assert.ok(isSensitiveQuestion("custom:visa", "Avez-vous besoin d'un visa ?"));
  assert.ok(!isSensitiveQuestion("custom:enit", "Pourquoi l'ENIT ?"));
  const ctx = { job, profile, cvText: profile.cv_md, locale: "fr" as const, maxChars: 600 };
  const [sal] = fallbackAnswers([{ qid: "salary", question: "Prétentions ?" }], ctx);
  assert.equal(sal.confirm, true);
  assert.ok(!/\d{3,}/.test(sal.answer), "no invented amount");
  const fact = profileFactAnswer("salary", profile, extra, "fr");
  assert.ok(fact.confirm && /\[/.test(fact.answer));
  const avail = profileFactAnswer("availability", profile, { ...extra, availability: { from: "2026-07-01", to: "" } }, "en");
  assert.ok(!avail.confirm && /from/.test(avail.answer) && /\[for N months\]/.test(avail.answer));
  assert.ok(!profileFactAnswer("mobility", profile, extra, "fr").confirm);
});

test("answer bank: exact normalized match, then Jaccard ≥ 0.8", () => {
  const row = (id: number, question: string): BankAnswer => ({ id, type: "text", question_norm: normalizeQuestion(question), question, answer: `a${id}`, source_app: null, uses: 0, updated_at: "" });
  const rows = [row(1, "Pourquoi notre entreprise ?"), row(2, "Décrivez un projet dont vous êtes fier.")];
  assert.equal(matchBank("pourquoi notre entreprise", rows)?.id, 1);
  assert.equal(matchBank("Décrivez un projet dont vous êtes fier !", rows)?.id, 2);
  assert.equal(matchBank("Décrivez un projet dont vous êtes le plus fier", rows)?.id, 2); // tokens: decrivez projet dont etes fier (+plus) → 5/6 ≥ 0.8
  assert.equal(matchBank("Quel est votre niveau d'anglais ?", rows), null);
  assert.equal(matchBank("", rows), null);
});

test("form fields: lengths enforced, facts from the CV only", () => {
  const f = heuristicFields(job, profile, profile.cv_md, "fr");
  assert.deepEqual(f.intros.map((i) => i.max), [...INTRO_LENGTHS]);
  for (const i of f.intros) assert.ok(i.text.length <= i.max && i.text.length > 20, `${i.max}: ${i.text.length}`);
  assert.ok(f.projects.length >= 2 && f.projects.every((p) => p.text.length <= PROJECT_MAX));
  assert.equal(f.projects[0].title, "Gestionnaire de bibliothèque");
  assert.ok(f.projects[0].stack.includes("Java"));
  assert.ok(f.pitches.length >= 4 && f.pitches.length <= 6);
  assert.ok(!f.intros[0].text.includes("Node.js"), "posting-only skill never claimed");
  const forced = enforceLimits({ intros: [{ max: 150, text: "x".repeat(900) }], projects: [], pitches: ["y".repeat(500)] });
  assert.ok(forced.intros.every((i) => i.text.length <= i.max) && forced.pitches[0].length <= 220);
});
