// Offers the 2026-10-25 audit saw kept, dropped or mis-typed for the wrong reason, each with the input that showed it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilter, titleMatch, compilePositives } from "./filter";
import { guessRemote, guessType, matchesKeywords, normalizeDate } from "../sources/classify";
import { extractSkills } from "../ai/heuristic";
import { matchBreakdown, jobLevel } from "../match";
import { countryOf, inTargetPlaces } from "../geo";

const base = { company: "Acme", description: "", location: "", remote: false, type: "emploi" as const, posted_at: null };

test("short keywords match whole words only", () => {
  const pos = compilePositives(["IA", "UI", "ml", "java"]);
  for (const t of ["Stagiaire comptable", "Commercial terrain", "Équipe support client", "Intégrateur HTML", "Développeur JavaScript"]) assert.equal(titleMatch(t, pos), null, t);
  assert.ok(titleMatch("Ingénieur IA", pos));
  assert.ok(titleMatch("Développeur Java / Spring", pos));
});

test("junior experience ranges and company age are not senior requirements", () => {
  const f = buildFilter({ keywords: ["java"], profile: { target_roles: [], target_types: [] }, places: { countries: [], remote: "yes" } });
  for (const description of ["Profil : 0 à 3 ans d'expérience en Java.", "1-3 years of experience with Java.", "Acme, créée il y a plus de 10 ans, recrute un développeur Java."])
    assert.ok(f.decide({ ...base, title: "Développeur Java Junior", description }).keep, description);
  assert.ok(!f.decide({ ...base, title: "Développeur Java", description: "Minimum 5 ans d'expérience en Java." }).keep);
  assert.equal(jobLevel({ title: "Développeur Java", type: "emploi", description: "0 à 3 ans d'expérience" }), null);
});

test("an offer listed in several places passes when one of them is chosen", () => {
  const f = buildFilter({ keywords: [], profile: { target_roles: [], target_types: [] }, places: { countries: ["TN"], remote: "yes" } });
  assert.ok(f.decide({ ...base, title: "Stage dev", location: "Paris, France; Tunis, Tunisie" }).keep);
  assert.ok(!f.decide({ ...base, title: "Stage dev", location: "Paris, France" }).keep);
});

test("a date-only posting from yesterday is still under 24 hours old", () => {
  const f = buildFilter({ keywords: [], profile: { target_roles: [], target_types: [] }, places: { countries: [], remote: "yes" }, prefs: { hoursOld: 24, levels: [], titleBlacklist: [], companyBlacklist: [], locationReject: [], includeSenior: false }, now: Date.parse("2026-10-25T10:00:00Z") });
  assert.ok(f.decide({ ...base, title: "Stage", posted_at: "2026-10-24" }).keep);
  assert.ok(!f.decide({ ...base, title: "Stage", posted_at: "2026-10-22" }).keep);
});

test("board keywords: whole words, spelling variants, no early-stage internships", () => {
  assert.ok(matchesKeywords("Développeur Fullstack", ["full stack"]));
  assert.ok(matchesKeywords("Front-end developer", ["frontend"]));
  assert.ok(matchesKeywords("Stages en développement", ["stage"]));
  assert.ok(matchesKeywords("Software Engineering Internship", ["stage"]));
  assert.ok(!matchesKeywords("Développeur JavaScript", ["java"]));
  assert.ok(!matchesKeywords("Backend engineer at an early-stage startup", ["stage"]));
  assert.ok(!matchesKeywords("Reactive systems engineer", ["react"]));
});

test("contract type comes from the offer, not from the candidate's past or mentoring", () => {
  assert.equal(guessType("Software Engineer", "Requirements: completed at least one internship in backend."), "emploi");
  assert.equal(guessType("Ingénieur Java", "Profil : ingénieur ayant réalisé son projet de fin d'études en Java."), "emploi");
  assert.equal(guessType("Tech Lead", "Vous encadrerez un stagiaire."), "emploi");
  assert.equal(guessType("Coop Bank – Backend Engineer"), "emploi");
  assert.equal(guessType("Développeur web", "Offre de stage de 6 mois."), "stage");
});

test("remote negations and US-only remote", () => {
  assert.equal(guessRemote("Remote work is not an option for this role."), false);
  assert.equal(countryOf("Remote - US"), "US");
  assert.equal(countryOf("Remote (U.S. only)"), "US");
  assert.equal(countryOf("Remote, worldwide"), "REMOTE");
});

test("dates keep the calendar day they show", () => {
  assert.equal(normalizeDate("Tue, 21 Oct 2026 00:30:00 +0200"), "2026-10-21");
  assert.equal(normalizeDate("25 octobre 2026"), "2026-10-25");
  assert.equal(normalizeDate("1er février 2027"), "2027-02-01");
  assert.equal(normalizeDate("12/11/2026"), "2026-11-12");
  assert.equal(normalizeDate(1792900000), "2026-10-25");
  assert.equal(normalizeDate(1792900000000), "2026-10-25");
  assert.equal(normalizeDate("2026-02-30"), null);
});

test("CV skills: whole skills only, and French c'est is not the C language", () => {
  assert.deepEqual(extractSkills("C'est un stage en Python."), ["Python"]);
  const m = matchBreakdown({ title: "Stage", type: "stage", description: "Java, SQL, Git et C requis.", tags: [] }, { target_roles: [] }, "JavaScript, NoSQL, GitHub", ["intern"]);
  const s = m.lines[0];
  assert.ok(s.kind === "skills");
  assert.equal(s.found.length, 0, `found ${s.found.join(",")}`);
});

test("Tunisian cities count as Tunisia when the board drops the country", () => {
  assert.ok(inTargetPlaces("Sfax", ["Tunisie", "Remote"]));
  assert.ok(inTargetPlaces("Lac 2, Tunis", ["Tunisie"]));
  assert.ok(!inTargetPlaces("Paris", ["Tunisie"]));
});

test("a page that names a future closing date or a contact rule is not a closed posting", async () => {
  const { CLOSED_MARKERS } = await import("../company/liveness");
  const closed = (s: string) => CLOSED_MARKERS.some((re) => re.test(s));
  assert.ok(!closed("les candidatures sont closes le 30 novembre"));
  assert.ok(!closed("pas de candidatures acceptees par telephone"));
  assert.ok(!closed("applications are closed on a rolling basis"));
  assert.ok(closed("les candidatures sont closes."));
  assert.ok(closed("applications are now closed"));
});
