import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Job, type Profile } from "../types";
import { extractSkills } from "../ai/heuristic";
import { QUESTION_IDS, clampLimit, cvFacts, cvProjects, detectQuestions, heuristicAnswer, heuristicCustomAnswer } from "./questions";
import { fallbackAnswers } from "../ai/apply";

const POSTING = `Stage PFE développeur embarqué (6 mois)
Nous cherchons un étudiant ingénieur pour un stage PFE sur STM32 et FreeRTOS, bus CAN, en C et Python.
Démarrage immédiat, gratification 600 DT. Niveau d'anglais professionnel requis. Mobilité sur Sousse souhaitée.
Décrivez un projet dont vous êtes fier. Pourquoi notre entreprise ?`;

const CV = `# Amine Test
amine@example.com

## Compétences
- C, Python, STM32, FreeRTOS, Git
- Anglais : niveau B2

## Projets
### Robot suiveur de ligne
- Firmware C sur STM32 avec FreeRTOS
### Station météo IoT
- Capteurs I2C, MQTT, Raspberry Pi
`;

const job: Job = {
  id: 7, title: "Stage PFE développeur embarqué", company: "Embedix", location: "Sousse", remote: false, url: "https://example.com/j/7",
  source: "manual", type: "pfe", description: POSTING, tags: ["embedded"], posted_at: null, deadline: "2026-11-15", created_at: "2026-10-01", archived: false, starred: false,
};
const profile: Profile = {
  id: 1, name: "Amine Test", email: "amine@example.com", headline: "élève ingénieur en électronique à l'ENIT", cv_md: CV,
  skills: ["C", "Python", "STM32"], target_roles: [], target_locations: ["Tunis", "Sfax"], target_types: ["pfe"], languages: ["fr", "en"], settings: DEFAULT_SETTINGS,
};

test("detectQuestions: flags questions hinted by the posting, keeps defaults selected", () => {
  const qs = detectQuestions(POSTING);
  const by = Object.fromEntries(qs.map((q) => [q.id, q]));
  assert.equal(qs.length, QUESTION_IDS.length);
  for (const id of ["proud_project", "availability", "salary", "english", "mobility", "why_company"] as const) assert.equal(by[id].detected, true, id);
  assert.equal(by.weaknesses.detected, false);
  assert.equal(by.weaknesses.selected, false);
  assert.equal(by.why_you.selected, true); // default even when not mentioned
  assert.ok(detectQuestions("").every((q) => !q.detected));
});

test("cvFacts / cvProjects: skills shared with the posting, project titles, english level", () => {
  const f = cvFacts(job, profile, CV);
  assert.deepEqual(cvProjects(CV), ["Robot suiveur de ligne", "Station météo IoT"]);
  assert.ok(f.skills.includes("STM32") && f.skills.includes("RTOS") && f.skills.includes("C")); // "RTOS" is the canonical name for FreeRTOS
  assert.ok(!f.skills.includes("MQTT")); // in CV but not in the posting
  assert.equal(f.english, "professional");
});

test("heuristic answers: no invented facts — every skill and number comes from the CV, profile or posting", () => {
  const corpus = `${CV}\n${POSTING}\n${profile.skills.join(" ")}\n${profile.headline}\n${profile.target_locations.join(" ")}\n${job.deadline}`;
  const allowedSkills = new Set(extractSkills(corpus));
  const allowedNumbers = new Set(corpus.match(/\d+/g) ?? []);
  for (const locale of ["fr", "en"] as const) {
    const ctx = { job, profile, cvText: CV, locale, maxChars: 600 };
    for (const id of QUESTION_IDS) {
      const a = heuristicAnswer(id, ctx);
      assert.ok(a.length > 20 && a.length <= 600, `${locale}/${id} length`);
      for (const s of extractSkills(a)) assert.ok(allowedSkills.has(s), `${locale}/${id} invented skill ${s}`);
      for (const n of a.match(/\d+/g) ?? []) assert.ok(allowedNumbers.has(n) || n === "2", `${locale}/${id} invented number ${n}`);
    }
    const custom = heuristicCustomAnswer("Pourquoi l'ENIT ?", ctx);
    assert.ok(custom.includes(job.company) && custom.includes("Robot suiveur de ligne"));
  }
});

test("heuristic answers respect the character limit and keep placeholders for unknowns", () => {
  const short = heuristicAnswer("why_you", { job, profile, cvText: CV, locale: "fr", maxChars: 120 });
  assert.ok(short.length <= 120);
  const avail = heuristicAnswer("availability", { job, profile, cvText: CV, locale: "en", maxChars: 600 });
  assert.match(avail, /\[from DD\/MM\/YYYY\]/);
  const noProj = heuristicAnswer("proud_project", { job, profile: { ...profile, cv_md: "" }, cvText: "", locale: "fr", maxChars: 600 });
  assert.match(noProj, /\[Nom du projet\]/);
});

test("fallbackAnswers maps bank ids and custom questions, labelled heuristic", () => {
  const out = fallbackAnswers([{ qid: "why_role", question: "Pourquoi ce stage ?" }, { qid: "custom:enit", question: "Pourquoi l'ENIT ?" }], { job, profile, cvText: CV, locale: "fr", maxChars: 300 });
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.engine === "heuristic" && o.answer.length <= 300));
  assert.equal(out[1].qid, "custom:enit");
});

test("clampLimit keeps the length inside [80, 2000] and defaults on garbage", () => {
  assert.equal(clampLimit(10), 80);
  assert.equal(clampLimit(99999), 2000);
  assert.equal(clampLimit("abc"), 600);
  assert.equal(clampLimit(450.4), 450);
});
