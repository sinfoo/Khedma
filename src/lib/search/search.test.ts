import { test } from "node:test";
import assert from "node:assert/strict";
import type { NewJob } from "../db";
import { dedupeKey } from "../sources/classify";
import { detectAtsInHtml, detectAtsUrl, collectJobLinks } from "../sources/ats";
import { hostClass, trustScore } from "../sources/trust";
import { planSearch, planSources } from "./plan";
import { buildFilter, compileKeyword, compilePositives, compileLocation, locationRules, titleMatch } from "./filter";
import { companyKey, scoreJob } from "./rank";
import { buildTiers } from "./tiers";
import { normalizePrefs } from "./prefs";
import { expiredDeadline, urgentDeadline } from "./sweep";

const job = (over: Partial<NewJob>): NewJob => ({
  title: "Développeur Java", company: "Acme", location: "Tunis", remote: false, url: "https://e.x/1", source: "manual",
  type: "stage", description: "", tags: [], posted_at: null, deadline: null, ...over,
});
const profile = { target_roles: ["Développeur Full-Stack"], target_types: ["stage", "pfe"] as ("stage" | "pfe")[] };
const kinds = (runs: { kind: string }[]) => runs.map((r) => r.kind);

test("plan: CH + CA runs the Swiss and Canadian boards, LinkedIn per country, worldwide boards, never a Tunisian board", () => {
  const p = planSearch({ keywords: ["stage développeur"], countries: ["CH", "CA"], remote: "yes" });
  const k = kinds(p.runs);
  for (const x of ["jobsch", "jobup", "jobroom", "englishjobs_ch", "jobbank", "remoteok", "jobicy", "himalayas", "remotive"]) assert.ok(k.includes(x), x);
  for (const x of ["keejob", "tanitjobs", "emploitunisie", "farojob", "arbeitnow", "daijob", "reed", "adzuna"]) assert.ok(!k.includes(x), `${x} must not run`);
  const li = p.runs.filter((r) => r.kind === "linkedin").map((r) => r.handle);
  assert.deepEqual(li, ["Switzerland", "Canada"]);
  assert.equal(p.runs[0].country, "CH");
  assert.ok(p.runs.every((r) => r.keywords[0] === "stage développeur"));
});

test("plan: TN runs the Tunisian boards and LinkedIn Tunis; saved sources from other countries are reported as skipped", () => {
  const p = planSearch({
    keywords: [],
    countries: ["TN"],
    cities: ["Sfax"],
    remote: "no",
    defaultKeywords: ["développeur"],
    enabledSources: [
      { id: 1, kind: "keejob", label: "Keejob", handle: "", keywords: ["pfe"] },
      { id: 2, kind: "jobsch", label: "jobs.ch", handle: "zurich" },
      { id: 3, kind: "greenhouse", label: "Vercel", handle: "vercel" },
      { id: 4, kind: "remoteok", label: "Remote OK", handle: "" },
      { id: 5, kind: "linkedin", label: "LinkedIn", handle: "" },
    ],
  });
  const k = kinds(p.runs);
  for (const x of ["keejob", "tanitjobs", "emploitunisie", "farojob", "greenhouse", "linkedin"]) assert.ok(k.includes(x), x);
  assert.ok(!k.includes("jobsch") && !k.includes("remoteok") && !k.includes("jobbank"));
  assert.deepEqual(p.skipped.map((s) => [s.label, s.reason]), [["jobs.ch", "country"], ["Remote OK", "remote"]]);
  const keejob = p.runs.find((r) => r.kind === "keejob")!;
  assert.deepEqual([keejob.sourceId, keejob.keywords], [1, ["pfe"]]);
  assert.equal(p.runs.filter((r) => r.kind === "keejob").length, 1, "saved source replaces the catalog run");
  assert.equal(p.runs.find((r) => r.kind === "linkedin")!.handle, "Sfax, Tunisia");
  assert.equal(p.runs.find((r) => r.kind === "tanitjobs")!.keywords[0], "développeur");
  assert.ok(p.runs.find((r) => r.kind === "greenhouse")!.company);
});

test("plan: no country = home market; remote only = no country boards; explicit ids run regardless", () => {
  assert.ok(kinds(planSearch({ keywords: [], countries: [] }).runs).includes("keejob"));
  const ro = planSearch({ keywords: [], countries: ["REMOTE"] });
  assert.ok(!kinds(ro.runs).includes("keejob") && kinds(ro.runs).includes("remoteok") && !kinds(ro.runs).includes("linkedin"));
  const ids = planSources([{ id: 9, kind: "keejob", label: "Keejob", handle: "" }], [], ["dev"]);
  assert.deepEqual([ids.runs[0].sourceId, ids.runs[0].keywords, ids.runs[0].country], [9, ["dev"], "TN"]);
});

test("compileKeyword: word:, stem:, acronyms and substrings", () => {
  assert.ok(compileKeyword("word:intern")("operations intern"));
  assert.ok(!compileKeyword("word:intern")("internal tools engineer"));
  assert.ok(compileKeyword("stem:agent")("agentforce lead"));
  assert.ok(!compileKeyword("stem:agent")("reagents specialist"));
  assert.ok(compileKeyword("agent")("reagents specialist"));
  assert.ok(!compileKeyword("ai")("maintenance"));
  assert.ok(compileKeyword("ai")("ai engineer"));
  assert.ok(compileKeyword("director + engineering")("senior director, platform engineering"));
  assert.ok(compileKeyword("word:intern")("stagiaire / intern (h/f)"));
});

test("titleMatch folds FR/EN synonyms and scores partial role matches", () => {
  const pos = compilePositives(["stage développeur", "Ingénieur DevOps"]);
  assert.equal(titleMatch("Software Engineer Intern", pos)?.score, 1);
  assert.equal(titleMatch("Développeur Java – Stage", pos)?.score, 1);
  assert.equal(titleMatch("DevOps Intern", pos)?.score, 0.5);
  assert.equal(titleMatch("Comptable", pos), null);
  assert.equal(titleMatch("C++ developer", compilePositives(["C++"]))?.hits[0], "C++");
});

test("filter: seniority rejected FR/EN unless the title says internship or includeSenior", () => {
  const f = buildFilter({ keywords: ["développeur"], profile: { ...profile, target_types: [] }, places: { countries: ["TN"], remote: "yes" } });
  assert.equal(f.decide(job({ title: "Senior Java Developer" })).keep, false);
  assert.equal(f.decide(job({ title: "Développeur confirmé (5+ ans)" })).reasons[0], "senior:confirme");
  assert.equal(f.decide(job({ title: "Lead développeur" })).keep, false);
  assert.equal(f.decide(job({ title: "Head of Engineering" })).keep, false);
  assert.equal(f.decide(job({ title: "Développeur PHP", type: "emploi", description: "Minimum 3 ans d'expérience exigés." })).reasons[0], "senior:minimum 3 ans");
  assert.equal(f.decide(job({ title: "Stage développeur senior tooling" })).keep, true);
  assert.equal(f.decide(job({ title: "Développeur PHP", type: "emploi", description: "2 ans d'expérience" })).keep, true);
  const loose = buildFilter({ keywords: ["développeur"], profile: { ...profile, target_types: [] }, places: { countries: ["TN"], remote: "yes" }, includeSenior: true });
  assert.equal(loose.decide(job({ title: "Senior Java Developer" })).keep, true);
});

test("filter: title gate, sales roles, type gate with junior exception, user negatives and prefs", () => {
  const f = buildFilter({ keywords: ["développeur"], profile, places: { countries: ["TN"], remote: "yes" }, extraNegatives: ["word:php"] });
  assert.equal(f.decide(job({ title: "Comptable stagiaire" })).reasons[0], "title");
  assert.equal(f.decide(job({ title: "Business Developer stage" })).reasons[0], "sales:business developer");
  assert.equal(f.decide(job({ title: "Stage développeur commercial" })).keep, true, "a technical word rescues the title");
  assert.equal(f.decide(job({ title: "Développeur Java", type: "emploi" })).reasons[0], "type:emploi");
  const junior = f.decide(job({ title: "Développeur Java junior", type: "emploi" }));
  assert.ok(junior.keep && junior.reasons.includes("junior"));
  assert.equal(f.decide(job({ title: "Stage développeur PHP" })).reasons[0], "negative:php");
  const kept = f.decide(job({ title: "Développeur full stack – stage", location: "Lac 2, Tunis" }));
  assert.ok(kept.keep && kept.reasons.includes("place:TN") && kept.reasons[0].startsWith("title:"));

  const prefs = normalizePrefs({ levels: ["intern", "entry"], hoursOld: 72, companyBlacklist: ["Globex"], titleBlacklist: ["stem:manag"], locationReject: ["Sfax"] });
  const g = buildFilter({ keywords: ["développeur"], profile, places: { countries: ["TN"], remote: "yes" }, prefs, now: Date.parse("2026-10-13T12:00:00Z") });
  assert.equal(g.decide(job({ company: "Globex Tunisie" })).reasons[0], "blacklist:Globex");
  assert.equal(g.decide(job({ posted_at: "2026-10-01" })).reasons[0], "age:12");
  assert.equal(g.decide(job({ title: "Stage développeur management tools" })).reasons[0], "blacklist:manag");
  assert.equal(g.decide(job({ location: "Sfax, Tunisie" })).reasons[0], "location:Sfax");
  assert.equal(g.decide(job({ title: "Développeur Java", type: "emploi" })).reasons[0], "type:emploi", "entry level needs junior wording");
  assert.equal(g.decide(job({ title: "Développeur Java débutant", type: "emploi", posted_at: "2026-10-12" })).keep, true);
});

test("filter: location tiers (block_hard beats always_allow), remote preference, language", () => {
  const rules = locationRules({ countries: ["CH", "US"], cities: [] });
  const loc = compileLocation(rules);
  assert.equal(loc("Genève, Suisse").keep, true);
  assert.equal(loc("Paris, Texas, United States").keep, true);
  assert.equal(loc("Paris, France").keep, false);
  assert.equal(loc("Tunis").keep, false, "a city of a non-chosen country is blocked");
  assert.equal(loc("").keep, true);
  assert.equal(loc("Mars").keep, true, "unknown places pass");
  assert.equal(compileLocation({ block_hard: ["brazil"], always_allow: ["porto"], block: [], allow: [] })("Porto Alegre, Brazil").keep, false);

  const f = buildFilter({ keywords: ["développeur"], profile, places: { countries: ["CH"], remote: "only" } });
  assert.equal(f.decide(job({ title: "Stage développeur", location: "Zurich" })).reasons[0], "remote");
  assert.equal(f.decide(job({ title: "Stage développeur", location: "Zurich", remote: true })).keep, true);
  const onsite = buildFilter({ keywords: ["développeur"], profile, places: { countries: ["TN"], remote: "no" } });
  assert.equal(onsite.decide(job({ title: "Stage développeur", location: "Remote", remote: true })).reasons[0], "remote");
  const de = "Wir suchen eine Werkstudentin für unsere Entwicklung. Sie arbeiten mit dem Team und werden bei uns nicht allein sein, sondern mit einer guten Betreuung. Ihre Aufgaben sind vielfältig und unsere Kultur ist offen, als Teil des Teams sowie zum Beispiel bei Events.";
  assert.equal(buildFilter({ keywords: ["développeur"], profile, places: { countries: ["TN"], remote: "yes" } }).decide(job({ title: "Stage développeur", location: "", description: de })).reasons[0], "lang:de");
  assert.equal(buildFilter({ keywords: ["développeur"], profile, places: { countries: ["DE"], remote: "yes" } }).decide(job({ title: "Stage développeur", location: "", description: de })).keep, true);
  assert.equal(buildFilter({ keywords: ["développeur"], profile, places: { countries: ["TN"], remote: "yes" } }).decide(job({ title: "Stage développeur", location: "", description: "東京のエンジニア募集" })).reasons[0], "lang:ja");
});

test("rank: order and why", () => {
  const f = buildFilter({ keywords: ["stage développeur"], profile, places: { countries: ["TN"], remote: "yes" } });
  const ctx = { positives: f.positives, keywords: ["stage développeur"], types: f.types, places: { countries: ["TN"], remote: "yes" as const }, tracked: new Set([companyKey("Vermeg")]), seen: new Set<string>(), now: Date.parse("2026-10-13T12:00:00Z") };
  const best = scoreJob(job({ title: "Stage développeur full stack", company: "Vermeg", location: "Tunis", posted_at: "2026-10-12", description: "Stage développeur full stack React Node, développeur confirmé bienvenu" }), ctx);
  const mid = scoreJob(job({ title: "DevOps Intern", company: "Acme", location: "Tunis", posted_at: "2026-09-01" }), ctx);
  const low = scoreJob(job({ title: "Comptable", company: "Acme", location: "Paris", type: "emploi" }), ctx);
  assert.ok(best.score > mid.score && mid.score > low.score, `${best.score} > ${mid.score} > ${low.score}`);
  assert.ok(best.score >= 85 && best.score <= 100, String(best.score));
  for (const w of ["title:stage développeur", "type:stage", "place:TN", "company", "fresh:1"]) assert.ok(best.why.includes(w), `${w} in ${best.why}`);
  assert.ok(!mid.why.some((w) => w.startsWith("title:")) && mid.why.includes("type:stage"), String(mid.why));
  assert.ok(best.why.some((w) => w.startsWith("desc:")));
  assert.ok(!low.why.some((w) => w.startsWith("title:")));
  const skilled = scoreJob(job({ title: "Stage développeur full stack", company: "Vermeg", location: "Tunis", posted_at: "2026-10-12", description: "React Node TypeScript PostgreSQL" }), { ...ctx, skills: ["React", "PostgreSQL", "Rust"] });
  const plain = scoreJob(job({ title: "Stage développeur full stack", company: "Vermeg", location: "Tunis", posted_at: "2026-10-12", description: "React Node TypeScript PostgreSQL" }), ctx);
  assert.ok(skilled.score > plain.score && skilled.why.includes("skills:React,PostgreSQL"), `${skilled.score} ${skilled.why}`);
  const dupCtx = { ...ctx, seen: new Set([dedupeKey("Vermeg", "Stage développeur full stack")]) };
  const dup = scoreJob(job({ title: "Stage développeur full stack", company: "Vermeg", location: "Tunis" }), dupCtx);
  assert.ok(dup.why.includes("dup") && dup.score < best.score);
});

test("dedupe key ignores accents, (H/F), legal suffixes and punctuation", () => {
  assert.equal(dedupeKey("Vermeg SARL", "Développeur Full-Stack (H/F)"), dedupeKey("vermeg", "Developpeur Full Stack"));
  assert.notEqual(dedupeKey("Vermeg", "Développeur"), dedupeKey("Vermeg", "Data Analyst"));
});

test("tiers: own keywords, then adjacent FR/EN titles, then broad contract words", () => {
  const t = buildTiers(["développeur"], ["Ingénieur DevOps"]);
  assert.deepEqual(t[1], ["développeur"]);
  assert.ok(t[2].includes("developer") && t[2].some((x) => /cloud|sre/.test(x)), String(t[2]));
  assert.deepEqual(t[3], ["stage", "internship", "pfe"]);
  assert.deepEqual(buildTiers([], ["Data Scientist"])[1], ["data"]);
});

test("ATS detection from URLs", () => {
  assert.deepEqual(detectAtsUrl("https://boards.greenhouse.io/vercel/jobs/123"), { kind: "greenhouse", handle: "vercel", label: "Vercel", ats: "Greenhouse" });
  assert.equal(detectAtsUrl("https://job-boards.eu.greenhouse.io/doctolib")?.handle, "doctolib");
  assert.equal(detectAtsUrl("https://boards.greenhouse.io/embed/job_board?for=acme-corp")?.handle, "acme-corp");
  assert.deepEqual(detectAtsUrl("https://jobs.lever.co/qonto"), { kind: "lever", handle: "qonto", label: "Qonto", ats: "Lever" });
  assert.equal(detectAtsUrl("https://jobs.eu.lever.co/qonto/abc")?.kind, "lever");
  assert.deepEqual(detectAtsUrl("https://jobs.ashbyhq.com/supabase"), { kind: "ashby", handle: "supabase", label: "Supabase", ats: "Ashby" });
  assert.deepEqual(detectAtsUrl("https://acme.teamtailor.com/jobs"), { kind: "rss", handle: "https://acme.teamtailor.com/jobs.rss", label: "Acme", ats: "Teamtailor" });
  assert.equal(detectAtsUrl("https://acme.wd5.myworkdayjobs.com/en-US/careers")?.ats, "Workday");
  assert.equal(detectAtsUrl("https://careers.smartrecruiters.com/Acme")?.ats, "SmartRecruiters");
  assert.equal(detectAtsUrl("https://acme.recruitee.com/")?.ats, "Recruitee");
  assert.equal(detectAtsUrl("https://acme.bamboohr.com/careers")?.ats, "BambooHR");
  assert.equal(detectAtsUrl("https://www.vermeg.com/careers/"), null);
  assert.equal(detectAtsUrl("nope"), null);
});

test("ATS detection inside a careers page: board scripts, iframes, links, jobs RSS", () => {
  assert.equal(detectAtsInHtml(`<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>`)?.handle, "acme");
  assert.equal(detectAtsInHtml(`<iframe src="https://jobs.lever.co/initech?lever-source=site"></iframe>`)?.kind, "lever");
  assert.equal(detectAtsInHtml(`<a href="https://jobs.ashbyhq.com/globex/">Open roles</a>`)?.handle, "globex");
  assert.equal(detectAtsInHtml(`fetch("https://boards-api.greenhouse.io/v1/boards/umbrella/jobs")`)?.handle, "umbrella");
  assert.deepEqual(detectAtsInHtml(`<link rel="alternate" type="application/rss+xml" href="https://acme.io/jobs.rss">`), { kind: "rss", handle: "https://acme.io/jobs.rss", label: "", ats: "RSS" });
  assert.equal(detectAtsInHtml(`<p>Nothing here</p>`), null);
});

test("careers page: posting links are collected from the same site or an ATS host, never the page itself", () => {
  const page = new URL("https://acme.tn/careers/");
  const html = `<a href="/careers/">Careers</a><a href="/careers/stage-dev-2026">Stage développeur</a><a href="https://jobs.lever.co/acme/1">Data intern</a>
    <a href="https://other.com/jobs/1">x</a><a href="/about">About</a><a href="/careers/brochure.pdf">pdf</a><a href="/careers/stage-dev-2026#apply">dup</a>`;
  assert.deepEqual(collectJobLinks(html, page), [
    { href: "https://acme.tn/careers/stage-dev-2026", text: "Stage développeur" },
    { href: "https://jobs.lever.co/acme/1", text: "Data intern" },
  ]);
});

test("trust score and host class", () => {
  const good = trustScore(job({ url: "https://boards.greenhouse.io/acme/jobs/1", description: "x".repeat(400) }));
  assert.deepEqual([good.score, good.flags, good.host], [100, [], "ats"]);
  const bad = trustScore(job({ url: "https://bit.ly/abc", company: "Acme", description: "Contact gmail: recruit@gmail.com. Frais de dossier requis." }));
  assert.ok(bad.score < 60 && bad.flags.includes("suspicious_domain") && bad.flags.includes("webmail_contact") && bad.flags.includes("fees"));
  assert.equal(trustScore(job({ url: "manual://x", description: "x".repeat(400) })).flags[0], "missing_apply_url");
  assert.ok(trustScore(job({ url: "https://globex.com/jobs/1", company: "Acme Corp", description: "x".repeat(400) })).flags.includes("company_domain_mismatch"));
  assert.ok(!trustScore(job({ url: "https://www.vermeg.com/jobs/1", company: "Vermeg SARL", description: "x".repeat(400) })).flags.includes("company_domain_mismatch"));
  assert.equal(hostClass("https://www.keejob.com/x"), "portal");
  assert.equal(hostClass("https://www.vermeg.com/careers"), "company");
});

test("sweep: urgent deadline window", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(urgentDeadline("2026-10-15", now), true);
  assert.equal(urgentDeadline("2026-10-30", now), false);
  assert.equal(urgentDeadline(null, now), false);
  assert.equal(urgentDeadline("2026-10-01", now), false);
});

test("sweep: expired deadline needs a full day of grace", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(expiredDeadline("2026-10-11", now), true);
  assert.equal(expiredDeadline("2026-10-13", now), false);
  assert.equal(expiredDeadline("2026-10-20", now), false);
  assert.equal(expiredDeadline(null, now), false);
  assert.equal(expiredDeadline("not a date", now), false);
});

test("plan: EURES runs once for the chosen EU countries, never for non-EU ones", () => {
  const p = planSearch({ keywords: ["developer"], countries: ["FR", "DE", "CA"], remote: "no" });
  const eu = p.runs.filter((r) => r.kind === "eures");
  assert.equal(eu.length, 1);
  assert.equal(eu[0].handle, "fr,de");
  assert.ok(p.runs.some((r) => r.kind === "arbeitsagentur"), "German federal board runs for DE");
  assert.equal(planSearch({ keywords: ["x"], countries: ["TN", "CA"], remote: "no" }).runs.filter((r) => r.kind === "eures").length, 0);
});
