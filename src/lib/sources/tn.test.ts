import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseKeejobDetail, parseKeejobIndex } from "./keejob";
import { parseTanitDetail, parseTanitList, tanitListUrl } from "./tanitjobs";
import { emploitunisieSearchUrl, parseEmploitunisieList } from "./emploitunisie";
import { parseLinkedinSearch, linkedinSearchUrl } from "./linkedin";
import { farojobListUrl, parseFarojobDetail, parseFarojobList, stripRecruitPrefix } from "./farojob";
import { dedupeKey, guessTypeWithContract, matchesKeywords } from "./classify";
import { mapLimit } from "./http";

// Fixtures are trimmed copies of the live pages saved on 2026-10-13.
const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");

test("keejob index: title, company, location, contract, date, html url", () => {
  const jobs = parseKeejobIndex(fx("keejob-llms-full.txt"));
  assert.equal(jobs.length, 6);
  const dev = jobs.find((j) => j.title.startsWith("Développeur(se) FullStack"))!;
  assert.equal(dev.company, "MOMSOFT");
  assert.equal(dev.location, "Tunisie");
  assert.equal(dev.contract, "CDI");
  assert.equal(dev.posted_at, "2026-10-05");
  assert.equal(dev.url, "https://www.keejob.com/offres-emploi/248044/d%C3%A9veloppeurse-fullstack-mobile-hf/");
  assert.equal(dev.type, "emploi");
  const stage = jobs.find((j) => j.title === "Stage Technicien (H/F)")!;
  assert.equal(stage.location, "Soliman, Nabeul");
  assert.equal(stage.type, "stage");
  assert.equal(jobs.find((j) => j.title === "Assistante Cabinet Orthodontie")!.company, "Entreprise anonyme");
});

test("keejob detail markdown", () => {
  const d = parseKeejobDetail(fx("keejob-detail.md"));
  assert.equal(d.deadline, "2026-10-22");
  assert.equal(d.posted_at, "2026-09-22");
  assert.equal(d.location, "Sousse Jaouhara, Sousse");
  assert.ok(d.description!.startsWith("Responsive Web Systems renforce son équipe"));
  assert.ok(!d.description!.includes("**") && !d.description!.includes("Postulez directement"));
});

test("tanitjobs listing cards and JSON-LD detail", () => {
  const jobs = parseTanitList(fx("tanitjobs-list.html"));
  assert.equal(jobs.length, 3);
  const [first, second] = jobs;
  assert.equal(first.title, "Collaborateur Comptable / Réviseur Comptable");
  assert.equal(first.company, "Audit Business & Consulting Services");
  assert.equal(first.location, "Tunis, Tunis");
  assert.equal(first.contract, "CDI");
  assert.equal(first.posted_at, null);
  assert.equal(second.posted_at, "2026-10-13");
  assert.equal(second.url, "https://www.tanitjobs.com/job/2061931/charg%C3%A9-e-de-saisie-et-contr%C3%B4le/");
  const d = parseTanitDetail(fx("tanitjobs-detail.html"))!;
  assert.equal(d.deadline, "2026-11-12");
  assert.ok(d.description!.startsWith("Focus Marketing recrute"));
  assert.equal(tanitListUrl(""), "https://www.tanitjobs.com/jobs/");
  assert.equal(tanitListUrl("705/informatique-jobs", 2), "https://www.tanitjobs.com/categories/705/informatique-jobs/?page=2");
  assert.equal(tanitListUrl("https://www.tanitjobs.com/categories/705/informatique-jobs/"), "https://www.tanitjobs.com/categories/705/informatique-jobs/");
});

test("emploitunisie listing", () => {
  const jobs = parseEmploitunisieList(fx("emploitunisie-list.html"));
  assert.equal(jobs.length, 3);
  const [j] = jobs;
  assert.equal(j.title, "Stagiaire Assistant Chef de Projet");
  assert.equal(j.company, "Ayp Edge");
  assert.equal(j.location, "Tunis");
  assert.equal(j.posted_at, "2026-10-12");
  assert.equal(j.type, "stage");
  assert.ok(j.description.startsWith("Contrat : Stage\nNiveau d'études : Bac+5 et plus"));
  assert.equal(j.url, "https://www.emploitunisie.com/offre-emploi-tunisie/stagiaire-assistant-chef-projet-tunis-473067");
  // Multi-contract offer is not forced to "stage".
  assert.equal(jobs[1].type, "emploi");
  assert.equal(emploitunisieSearchUrl("Développeur"), "https://www.emploitunisie.com/recherche-jobs-tunisie/d%C3%A9veloppeur");
});

test("farojob listing drops stale posts and strips 'X recrute'", () => {
  const jobs = parseFarojobList(fx("farojob-list.html"), new Date("2026-10-13T12:00:00Z"));
  assert.equal(jobs.length, 2, "the 2025 post is older than the cutoff");
  assert.deepEqual([jobs[0].title, jobs[0].company, jobs[0].location, jobs[0].posted_at], ["Account Manager", "Eminence Consulting", "Tunis", "2026-10-12"]);
  assert.equal(jobs[1].company, "UNITYLINK");
  assert.ok(jobs[1].title.startsWith("Ingénieur(e) MID SENIOR"));
  assert.equal(stripRecruitPrefix("Smart Conseil offre des Stages", "Smart Conseil"), "Stages");
  assert.equal(stripRecruitPrefix("Stage PFE Data", ""), "Stage PFE Data");
  const d = parseFarojobDetail(fx("farojob-detail.html"))!;
  assert.ok(d.description!.startsWith("À propos de Smart Conseil"));
  assert.ok(!d.description!.includes("Postuler"));
  assert.equal(farojobListUrl("informatique", 2), "https://www.farojob.net/job-category/informatique/page/2/");
  assert.equal(farojobListUrl(""), "https://www.farojob.net/jobs/");
});

test("keyword matching, contract typing and dedupe keys", () => {
  assert.ok(matchesKeywords("Stagiaire Développeur Full Stack", ["stage"]));
  assert.ok(matchesKeywords("Développeur Web FullStack (.NET)", ["développeur"]));
  assert.ok(matchesKeywords("Projet de fin d'études – Data", ["PFE"]));
  assert.ok(!matchesKeywords("Comptable junior", ["stage", "dev"]));
  assert.ok(matchesKeywords("anything", []));
  assert.equal(guessTypeWithContract("Commerciale", "CDI, SIVP, Stage/PFE"), "emploi");
  assert.equal(guessTypeWithContract("Assistant chef de projet", "Stage/PFE"), "pfe");
  assert.equal(guessTypeWithContract("Assistant", "Stage"), "stage");
  assert.equal(dedupeKey("MOMSOFT", "Développeur(se) FullStack & Mobile (H/F)"), dedupeKey("Momsoft", "Developpeur(se) Fullstack & mobile"));
  assert.notEqual(dedupeKey("A", "Dev"), dedupeKey("B", "Dev"));
  assert.equal(dedupeKey("Gobi Manufacturing Sarl", "Assistante - Données"), dedupeKey("Gobi Manufacturing", "Assistante – données"));
  assert.ok(!matchesKeywords("Responsable Développement Commercial", ["développeur"]));
  assert.ok(matchesKeywords("Software Developer Intern", ["développeur"]));
});

test("matchesProfile drops sales 'business developer' roles", async () => {
  const { matchesProfile } = await import("./classify");
  const p = { target_roles: ["développeur"], target_types: ["stage"] } as unknown as Parameters<typeof matchesProfile>[1];
  const j = (title: string) => ({ title, type: "stage" }) as Parameters<typeof matchesProfile>[0];
  assert.ok(!matchesProfile(j("Stage – Business Developer B2B"), p));
  assert.ok(!matchesProfile(j("Stage Business Development"), p));
  assert.ok(matchesProfile(j("Stagiaire Développeur Full Stack"), p));
});

test("mapLimit keeps order and caps concurrency", async () => {
  let live = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    peak = Math.max(peak, ++live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

test("linkedin guest search parses cards", () => {
  const html = readFileSync(path.join(import.meta.dirname, "fixtures", "linkedin-search.html"), "utf8");
  const jobs = parseLinkedinSearch(html);
  assert.ok(jobs.length >= 5, `got ${jobs.length}`);
  for (const j of jobs) {
    assert.match(j.url, /^https:\/\/[a-z]+\.linkedin\.com\/jobs\/view\//);
    assert.ok(j.title.length > 3 && j.company.length > 0, JSON.stringify(j));
    assert.equal(j.source, "linkedin");
  }
  assert.match(linkedinSearchUrl("stage dev", "Tunisia"), /keywords=stage\+dev&location=Tunisia/);
});
