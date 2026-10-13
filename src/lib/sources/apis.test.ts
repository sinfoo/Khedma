import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aijobsUrl, himalayasUrl, jobicyUrl, mapAiJobs, mapHimalayas, mapJobicy, mapRemoteOk, mapRemotive, remoteokUrl, remotiveUrl } from "./remote";
import { adzunaUrl, findworkUrl, joobleUrl, mapAdzuna, mapFindwork, mapJooble, mapReed, reedUrl } from "./keyed";
import { scanSource } from "./index";
import { CATALOG } from "./catalog";
import type { Profile } from "../types";

// remoteok/jobicy/himalayas/remotive/aijobs: trimmed live responses saved on 2026-10-13.
// adzuna/jooble/reed/findwork: shaped after the official API docs (no key at save time).
const fx = (name: string) => JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8"));
const plain = (s: string) => !s.includes("<") && !s.includes("&lt;") && !s.includes("&amp;");

test("remoteok: legal preamble skipped, remote flag, ISO dates, plain-text bodies", () => {
  const jobs = mapRemoteOk(fx("remoteok.json"));
  assert.equal(jobs.length, 3);
  for (const j of jobs) {
    assert.equal(j.source, "remoteok");
    assert.equal(j.remote, true);
    assert.match(j.url, /^https:\/\/remoteok\.com\/remote-jobs\//i);
    assert.match(j.posted_at!, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(plain(j.description));
  }
  assert.equal(remoteokUrl("dev"), "https://remoteok.com/api?tag=dev");
});

test("jobicy: geo as location, HTML description to text", () => {
  const jobs = mapJobicy(fx("jobicy.json"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.source, "jobicy");
  assert.match(j.url, /^https:\/\/jobicy\.com\/jobs\/\d+/);
  assert.ok(j.company.length > 1 && j.location.length > 1);
  assert.ok(plain(j.description));
  assert.equal(jobicyUrl("intern", "europe"), "https://jobicy.com/api/v2/remote-jobs?count=50&tag=intern&geo=europe");
  assert.equal(jobicyUrl("", ""), "https://jobicy.com/api/v2/remote-jobs?count=50");
});

test("himalayas: country restrictions as location, epoch dates and deadlines", () => {
  const jobs = mapHimalayas(fx("himalayas.json"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.source, "himalayas");
  assert.match(j.url, /^https:\/\/himalayas\.app\/companies\//);
  assert.match(j.posted_at!, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(j.deadline!, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(j.location.length > 1);
  assert.equal(himalayasUrl("software intern"), "https://himalayas.app/jobs/api?limit=50&search=software+intern");
});

test("remotive: software-dev category feed, candidate location kept", () => {
  const jobs = mapRemotive(fx("remotive.json"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.source, "remotive");
  assert.match(j.url, /^https:\/\/remotive\.com\/remote-jobs\//);
  assert.ok(j.location.length > 1 && plain(j.description));
  assert.equal(remotiveUrl(), "https://remotive.com/api/remote-jobs?category=software-dev&limit=100");
});

test("aijobs: level drives the type when there is no body", () => {
  const jobs = mapAiJobs(fx("aijobs.json"));
  assert.equal(jobs.length, 3);
  assert.equal(jobs[0].source, "aijobs");
  assert.equal(jobs[0].type, "stage");
  assert.match(jobs[0].url, /^https:\/\/artificialintelligencejobs\.co\/jobs\//);
  assert.match(jobs[0].posted_at!, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(aijobsUrl("intern"), "https://artificialintelligencejobs.co/api/jobs?q=intern&limit=100");
});

test("adzuna: markup stripped from titles, redirect url, contract type in classification", () => {
  const jobs = mapAdzuna(fx("adzuna.json"), "fr");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Stagiaire Développeur Logiciel H/F");
  assert.equal(jobs[0].type, "stage");
  assert.equal(jobs[0].posted_at, "2026-10-10");
  assert.ok(jobs[0].tags.includes("Python") && jobs[0].tags.includes("React"));
  assert.ok(plain(jobs[0].description));
  assert.match(adzunaUrl("fr", "stage dev", "ID", "KEY"), /^https:\/\/api\.adzuna\.com\/v1\/api\/jobs\/fr\/search\/1\?app_id=ID&app_key=KEY&what=stage\+dev&results_per_page=50/);
});

test("jooble: snippet to text, location fallback, PFE detection", () => {
  const jobs = mapJooble(fx("jooble.json"), "tunisia");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].type, "pfe");
  assert.equal(jobs[0].location, "Tunis, Tunisie");
  assert.equal(jobs[0].posted_at, "2026-10-11");
  assert.ok(plain(jobs[0].description));
  assert.ok(jobs[1].tags.includes("STM32"));
  assert.equal(joobleUrl("abc/def"), "https://jooble.org/api/abc%2Fdef");
});

test("reed: dd/mm/yyyy dates, UK suffixed location, entities decoded", () => {
  const jobs = mapReed(fx("reed.json"));
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].posted_at, "2026-10-08");
  assert.equal(jobs[0].deadline, "2026-11-15");
  assert.equal(jobs[0].location, "Manchester, United Kingdom");
  assert.equal(jobs[0].type, "stage");
  assert.ok(jobs[0].description.includes("£24k"));
  assert.equal(jobs[1].remote, true);
  assert.equal(reedUrl("software intern"), "https://www.reed.co.uk/api/1.0/search?keywords=software+intern&resultsToTake=100");
});

test("findwork: role as title, remote flag, null location handled", () => {
  const jobs = mapFindwork(fx("findwork.json"));
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Software Engineering Intern");
  assert.equal(jobs[0].type, "stage");
  assert.equal(jobs[0].location, "Berlin, Germany");
  assert.equal(jobs[1].location, "Remote");
  assert.ok(jobs[1].remote && plain(jobs[1].description));
  assert.equal(findworkUrl("intern"), "https://findwork.dev/api/jobs/?search=intern&sort_by=relevance");
});

test("keyed providers: a missing env var is a clear scan error, not a request", async () => {
  const profile = { target_types: [], target_roles: [] } as unknown as Profile;
  for (const c of CATALOG.filter((c) => c.needsEnv)) {
    const saved = c.needsEnv!.map((n) => [n, process.env[n]] as const);
    for (const [n] of saved) delete process.env[n];
    const r = await scanSource({ kind: c.kind, handle: "" }, profile);
    for (const [n, v] of saved) if (v !== undefined) process.env[n] = v;
    assert.equal(r.jobs.length, 0);
    assert.match(r.error ?? "", new RegExp(`Missing env: ${c.needsEnv!.join(", ")}`), c.kind);
  }
});
