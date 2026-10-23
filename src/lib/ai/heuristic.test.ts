import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Job, type Profile } from "../types";
import { cautiousVerdict, computeSkillGaps, extractSkills, heuristicEvaluate, postingLocale, verdictFor } from "./heuristic";
import { detectLanguage } from "./index";

const job = (over: Partial<Job> = {}): Job => ({
  id: 1,
  starred: false,
  title: "Stage PFE – Développeur Embarqué C++",
  company: "Acme Robotics",
  location: "Tunis, Tunisia",
  remote: false,
  url: "https://example.com/j/1",
  source: "manual",
  type: "pfe",
  description: `Nous recherchons un(e) stagiaire PFE pour rejoindre notre équipe embarqué.
Vous travaillerez sur des cartes STM32 en C++ et sur un backend Node.js avec PostgreSQL.
Compétences : C++, Node.js, Linux, Git, Docker, FreeRTOS. Encadrement par un ingénieur senior, formation assurée.
Le stage est rémunéré et se déroule dans nos locaux à Tunis, en mode hybride, au sein d'une équipe de 8 personnes.
We also value teamwork and good communication skills. Durée : 6 mois.`,
  tags: [],
  posted_at: null,
  deadline: null,
  created_at: "2026-01-01T00:00:00Z",
  archived: false,
  ...over,
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 1,
  name: "Test Student",
  email: "test@example.com",
  headline: "Élève ingénieur ENIT",
  cv_md: "# Test Student\n\n## Compétences\n\n- C++, Node.js, Linux, Git\n\n## Projets\n\n### Drone autonome STM32\n- Firmware en C++\n",
  skills: ["C++", "Node.js", "Linux"],
  target_roles: ["Développeur Embarqué", "Embedded Software Engineer"],
  target_locations: ["Tunis"],
  target_types: ["stage", "pfe"],
  languages: ["fr", "en"],
  settings: DEFAULT_SETTINGS,
  ...over,
});

test("extractSkills handles symbols and mixed FR/EN", () => {
  const skills = extractSkills(job().title + "\n" + job().description);
  for (const s of ["C++", "Node.js", "STM32", "PostgreSQL", "Linux", "Git", "Docker", "RTOS", "Teamwork", "Communication"]) {
    assert.ok(skills.includes(s), `expected ${s} in ${skills.join(", ")}`);
  }
  assert.ok(!skills.includes("C"), "bare C must not match inside C++");
  assert.deepEqual(extractSkills("We use C and C# and .NET"), ["C", "C#", ".NET"]);
});

test("heuristicEvaluate ranks a matching profile above a non-matching one", () => {
  const good = heuristicEvaluate(job(), profile());
  const bad = heuristicEvaluate(
    job(),
    profile({ skills: ["Photoshop"], cv_md: "# X\n\n## Skills\n\n- Photoshop", target_roles: ["Marketing Manager"], target_types: ["emploi"], target_locations: ["Paris"] }),
  );
  assert.ok(good.global > bad.global, `${good.global} should be > ${bad.global}`);
  assert.ok(good.match > bad.match);
  assert.ok(good.strengths.includes("C++"));
  assert.equal(good.engine, "heuristic");
  for (const k of ["global", "match", "target", "growth", "culture", "red_flags"] as const) {
    assert.ok(good[k] >= 1 && good[k] <= 5 && Number.isInteger(good[k] * 10), `${k}=${good[k]} must be 1-5 with one decimal`);
  }
});

test("heuristicEvaluate flags an unpaid internship in French", () => {
  const e = heuristicEvaluate(job({ description: job().description.replace("rémunéré", "non rémunéré") }), profile());
  assert.ok(e.flags.some((f) => /non rémunéré/i.test(f)), e.flags.join("|"));
  assert.ok(e.red_flags < 5);
  assert.ok(e.global < heuristicEvaluate(job(), profile()).global);
});

test("computeSkillGaps counts demand and marks missing skills", () => {
  const gaps = computeSkillGaps(
    [job(), job({ id: 2, title: "Backend Intern", description: "Node.js, Docker and Kubernetes. ".repeat(10) })],
    profile(),
  );
  const node = gaps.find((g) => g.skill === "Node.js")!;
  const k8s = gaps.find((g) => g.skill === "Kubernetes")!;
  assert.equal(node.demand, 2);
  assert.deepEqual(node.jobs, [1, 2]);
  assert.equal(node.have, true);
  assert.equal(k8s.have, false);
  // Same demand (2) as Node.js, but missing skills sort first.
  assert.equal(gaps[0].skill, "Docker");
});

test("detectLanguage", () => {
  assert.equal(detectLanguage("Nous recherchons un stagiaire pour rejoindre notre équipe dans les locaux de Tunis."), "fr");
  assert.equal(detectLanguage("We are looking for an intern to join our team in the Tunis office."), "en");
});

test("a model verdict can be stricter than its score, never kinder", () => {
  assert.equal(cautiousVerdict("apply_now", verdictFor(3.2)), "skip");
  assert.equal(cautiousVerdict("skip", verdictFor(4.6)), "skip");
  assert.equal(cautiousVerdict("apply", verdictFor(4.6)), "apply");
});

test("letters follow the posting's language when there is enough text", () => {
  const en = "We are looking for an intern to join our team. You will work with the data team and help us build our pipelines. ".repeat(3);
  assert.equal(postingLocale({ description: en }, "fr"), "en");
  assert.equal(postingLocale({ description: "Stage React" }, "fr"), "fr");
});

test("skill gaps from offers you nearly fit rank first", () => {
  const near = { ...job({ id: 3, description: "Kubernetes. ".repeat(20) }), evaluation: { global: 4.5 } };
  const far = [4, 5].map((id) => ({ ...job({ id, description: "Terraform. ".repeat(20) }), evaluation: { global: 1.5 } }));
  const gaps = computeSkillGaps([near, ...far], profile());
  const k8s = gaps.find((g) => g.skill === "Kubernetes")!;
  const tf = gaps.find((g) => g.skill === "Terraform")!;
  assert.equal(tf.demand, 2);
  assert.ok(k8s.weight > tf.weight, `${k8s.weight} > ${tf.weight}`);
  assert.ok(gaps.indexOf(k8s) < gaps.indexOf(tf));
});

test("language: French job titles with accents are French; a tie keeps the fallback", () => {
  assert.equal(detectLanguage("Stage PFE: Développeur Full Stack"), "fr");
  assert.equal(detectLanguage("Ingénieur DevOps H/F – CDI à Sfax"), "fr");
  assert.equal(detectLanguage("Software Engineering Internship 2027"), "en");
  assert.equal(detectLanguage("Full Stack Developer", "fr"), "fr");
});
