import { test } from "node:test";
import assert from "node:assert/strict";
import type { Job } from "../types";
import { buildCandidateModel, detectField, detectLevel, detectSeniorityMonths, detectLanguages } from "./profile-model";
import { similarity, tokenize, topKeywords } from "./similarity";
import { recommendActions, recommendOffers, recommendRoles, recommendSkills, recommendSources, recommendCompanies } from "./engine";

const CV_FR = `# Safwen Ben Salah
Élève ingénieur en 2ème année, Génie Informatique, ENIT — Tunis

## Compétences
Java, Spring Boot, MySQL, Git, Docker, React, TypeScript, Python, Linux, Scrum

## Expériences
### Stage d'été — Vermeg (juin 2025 – août 2025)
- Développement d'une API REST avec Spring Boot et MySQL, réduction du temps de réponse de 30 %
- Mise en place de tests unitaires (JUnit) couvrant 80 % du code

## Projets
### Application de gestion de bibliothèque
- Backend Java / Spring Boot, frontend React, déploiement Docker

## Langues
Français (natif), Anglais (B2), Arabe (natif)
`;

const profile = {
  headline: "Élève ingénieur en génie informatique à l'ENIT",
  skills: ["Java", "Spring Boot", "MySQL", "Git"],
  target_roles: [] as string[],
  target_locations: ["Tunis"],
  target_types: ["stage", "pfe"] as Job["type"][],
  languages: ["fr", "en"],
};

const job = (over: Partial<Job> & { id: number; title: string }): Job => ({
  company: "ACME",
  location: "Tunis",
  remote: false,
  url: `https://x/${over.id}`,
  source: "manual",
  type: "stage",
  description: "",
  tags: [],
  posted_at: null,
  deadline: null,
  created_at: "2026-10-10 10:00:00",
  archived: false,
  starred: false,
  ...over,
});

const NOW = new Date("2026-10-13T12:00:00Z").getTime();

test("field detection from a French software CV", () => {
  const f = detectField(CV_FR);
  assert.ok(f);
  assert.equal(f!.field, "software");
  assert.equal(detectField("Stage PFE en génie mécanique : conception CAO sous CATIA et SolidWorks, calcul RDM")!.field, "mechanical");
  assert.equal(detectField("Internship: deep learning, PyTorch, computer vision, data science")!.field, "data");
  assert.equal(detectField("Développement firmware STM32, FreeRTOS, I2C/SPI, systèmes embarqués")!.field, "embedded");
  assert.equal(detectField("Bonjour, je cherche un poste."), null);
});

test("level detection: declared year wins, then CV cues, default year2", () => {
  assert.equal(detectLevel(CV_FR), "year2");
  assert.equal(detectLevel("Projet de fin d'études chez X, 3ème année"), "year3");
  assert.equal(detectLevel("First year engineering student looking for a summer internship"), "year1");
  assert.equal(detectLevel("Jeune diplômé ingénieur, diplômé en 2026"), "graduate");
  assert.equal(detectLevel(CV_FR, "3e année ingénieur"), "year3");
  assert.equal(detectLevel("", ""), "year2");
});

test("seniority months and languages", () => {
  assert.equal(detectSeniorityMonths(CV_FR), 3); // juin–août 2025
  assert.equal(detectSeniorityMonths("Stage de 2 mois puis stage de 6 months"), 8);
  const langs = detectLanguages(CV_FR, []);
  assert.deepEqual(langs.map((l) => l.name).sort(), ["Anglais", "Arabe", "Français"]);
  assert.equal(langs.find((l) => l.name === "Anglais")!.level, "B2");
});

test("candidate model: skills, locations, strengths and weaknesses are grounded in the CV", () => {
  const m = buildCandidateModel({ cvText: CV_FR, profile, extra: { level: "2ème année" } });
  assert.equal(m.field, "software");
  assert.equal(m.level, "year2");
  assert.deepEqual(m.preferredTypes, ["stage", "alternance"]);
  const names = m.skills.map((s) => s.name);
  for (const s of ["Java", "Spring Boot", "MySQL", "Docker", "React"]) assert.ok(names.includes(s), s);
  assert.ok(m.skills.find((s) => s.name === "Spring Boot")!.mentions >= 2);
  assert.ok(m.locations.includes("Tunis"));
  assert.ok(m.strengths.some((s) => s.key === "quantified"));
  assert.ok(m.strengths.some((s) => s.key === "experience" && s.vars?.n === 3));
  assert.ok(m.weaknesses.some((w) => w.key === "noTargets"));
  assert.ok(!m.weaknesses.some((w) => w.key === "noQuantified"));
  // override wins
  const o = buildCandidateModel({ cvText: CV_FR, profile, override: { field: "data", level: "year3" } });
  assert.equal(o.field, "data");
  assert.equal(o.level, "year3");
  assert.notEqual(o.hash, m.hash);
  // empty CV
  const e = buildCandidateModel({ cvText: "", profile: { ...profile, skills: [] } });
  assert.ok(e.weaknesses.some((w) => w.key === "noCv"));
});

test("similarity folds accents, synonyms and inflections", () => {
  assert.deepEqual(tokenize("Développeur stage données"), ["dev", "internship", "data"]);
  assert.ok(similarity("développeur stage données", "developer internship data") > 0.99);
  assert.ok(similarity("Ingénieur réseaux", "network engineer") > 0.99);
  assert.ok(similarity("stage génie civil béton", "machine learning internship") < 0.4);
  assert.deepEqual(topKeywords("React React React Spring Spring Docker", 2), ["react", "spring"]);
});

test("offers ranking: matching, in-field, right-type, local offers come first with reasons", () => {
  const m = buildCandidateModel({ cvText: CV_FR, profile });
  const jobs: Job[] = [
    job({ id: 1, title: "Stage développeur Java Spring Boot", description: "Spring Boot, MySQL, Git, Docker. Stage d'été à Tunis.", type: "stage", deadline: "2026-10-18" }),
    job({ id: 2, title: "Ingénieur génie civil", description: "Béton armé, chantier, structures. CDI, 5 ans d'expérience.", type: "emploi", location: "Sfax" }),
    job({ id: 3, title: "Stage data science", description: "Python, machine learning, pandas, deep learning", type: "stage", location: "Sousse" }),
    job({ id: 4, title: "Stage développeur Java Spring Boot", company: "ACME", description: "Spring Boot, MySQL (duplicate)", type: "stage" }),
  ];
  const r = recommendOffers(
    m,
    jobs.map((j) => ({ job: j, evaluation: null, application: j.id === 3 ? ({ id: 1 } as never) : null })),
    { now: NOW, targetRoles: ["Développeur Back-End"] },
  );
  assert.equal(r[0].id, 1);
  assert.ok(r[0].score > r[1].score);
  const keys = r[0].reasons.map((x) => x.key);
  assert.ok(keys.includes("skills"));
  assert.ok(keys.includes("field"));
  assert.ok(keys.includes("level"));
  assert.equal(r[0].reasons.find((x) => x.key === "skills")!.vars!.n, 5); // Java, Spring Boot, MySQL, Git, Docker
  assert.ok(!r.some((x) => x.id === 3 && !x.tracked), "tracked offer is flagged or pushed out");
  assert.ok(r.find((x) => x.id === 1)!.score > r.find((x) => x.id === 4)!.score, "duplicate is penalised");
  assert.equal(r[r.length - 1].id === 2 || !r.some((x) => x.id === 2), true, "civil job ranks last or is dropped");
  assert.equal(recommendOffers(m, [], {}).length, 0);
});

test("roles, sources, skills, companies, actions", () => {
  const m = buildCandidateModel({ cvText: CV_FR, profile });
  const roles = recommendRoles(m, ["Développeur Back-End"]);
  assert.ok(roles.length >= 2);
  assert.ok(!roles.some((r) => r.role === "Développeur Back-End"));
  assert.ok(roles.every((r) => r.keywords.length > 0));

  const src = recommendSources(m, [{ kind: "keejob", handle: "" }]);
  assert.ok(!src.some((s) => s.kind === "provider" && s.providerKind === "keejob"));
  assert.ok(src.some((s) => s.kind === "provider" && s.providerKind === "tanitjobs" && s.handle === "705/informatique-jobs"));
  const cos = src.filter((s) => s.kind === "company");
  assert.ok(cos.length >= 5);
  assert.ok(cos.every((s) => s.kind === "company" && s.fields.includes("software") && /^https:\/\//.test(s.url)));
  assert.ok(src.filter((s) => s.kind === "provider").length <= 6);

  const jobs: Job[] = [
    job({ id: 1, title: "Stage Java", description: "Java, Spring Boot, Kubernetes" }),
    job({ id: 2, title: "Stage Java cloud", description: "Java, Kubernetes, Terraform, AWS" }),
    job({ id: 3, title: "Stage data", description: "Python, PyTorch, Kubernetes" }),
  ];
  const skills = recommendSkills(m, jobs);
  assert.equal(skills[0].skill, "Kubernetes");
  assert.equal(skills[0].demand, 3);
  assert.equal(skills[0].unlocks, 1);
  assert.ok(!skills.some((s) => s.skill === "Java"));

  const offers = recommendOffers(m, jobs.map((j) => ({ job: j, evaluation: null, application: null })), { now: NOW });
  const companies = recommendCompanies(offers, m);
  assert.equal(companies.length, 1);
  assert.equal(companies[0].offers, 3);

  const actions = recommendActions(m, {
    now: NOW,
    hasCv: true,
    offers: [{ ...offers[0], score: 80, deadline: "2026-10-15" }],
    unevaluated: 2,
    sources: 1,
    lastScanAt: "2026-10-01T10:00:00Z",
    targetRoles: 0,
    applications: [{ id: 7, title: "X", company: "Vermeg", status: "applied", lastContactAt: "2026-10-01T10:00:00Z", interviewAt: null }],
    skills,
  });
  const k = actions.map((a) => a.key);
  assert.ok(k.includes("deadlineSoon"));
  assert.ok(k.includes("followUp"));
  assert.equal(actions.find((a) => a.key === "followUp")!.vars!.n, 12);
  assert.ok(k.includes("noTargets"));
  assert.ok(k.includes("unevaluated"));
  assert.ok(k.includes("staleScan"));
  assert.ok(actions.every((a) => a.href));
  assert.equal(actions[0].priority >= actions[actions.length - 1].priority, true);
  assert.ok(recommendActions(m, { hasCv: false, offers: [], unevaluated: 0, sources: 0, lastScanAt: null, targetRoles: 1, applications: [], skills: [] }).some((a) => a.key === "noCv"));
});
