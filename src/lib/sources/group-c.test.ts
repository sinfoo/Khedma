// Just Join IT, No Fluff Jobs, StartupJobs.cz and Landing.jobs: trimmed live pages saved on 2026-10-25, fetch stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as justjoin from "./justjoin";
import * as nofluff from "./nofluff";
import * as startupjobs from "./startupjobs";
import * as landingjobs from "./landingjobs";

const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");
const asked: string[] = [];
let route: (url: string) => string = () => "";
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  asked.push(url);
  return new Response(route(url), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}) as typeof fetch;

test("justjoin: ItemList offers with company and city from the URL, category per keyword, JSON-LD detail", async () => {
  const jobs = justjoin.parseJustjoinList(fx("justjoin-list.html"));
  assert.equal(jobs.length, 3);
  assert.deepEqual([jobs[0].title, jobs[0].company, jobs[0].location], ["Junior Software Engineer - Notifications Platform", "Allegro", "Krakow, Poland"]);
  assert.deepEqual([jobs[2].title, jobs[2].company, jobs[2].location], ["Junior Java Developer (f/m)", "Netcompany", "Warszawa, Poland"]);
  assert.equal(jobs[0].source, "justjoin");
  assert.equal(justjoin.justjoinTech("Java developer"), "java");
  assert.equal(justjoin.justjoinTech("React"), "javascript");
  assert.equal(justjoin.justjoinTech("stage"), "");
  assert.equal(justjoin.justjoinUrl("java"), "https://justjoin.it/job-offers/all-locations/java?experience-levels=junior");

  route = () => fx("justjoin-list.html");
  asked.length = 0;
  const r = await justjoin.scan("", ["java", "notifications platform"]);
  assert.deepEqual(asked, [justjoin.justjoinUrl("java"), justjoin.justjoinUrl("")], "one category list, one all-offers list");
  assert.equal(r.jobs.length, 3);

  route = () => fx("justjoin-detail.html");
  const d = (await justjoin.detail(jobs[0]))!;
  assert.deepEqual([d.company, d.location, d.posted_at, d.deadline], ["Allegro", "Kraków, Poland", "2026-10-25", "2026-11-01"]);
  assert.ok(d.description!.length > 100);
  assert.ok(asked.every((u) => !u.includes("/api/")));
});

test("nofluff: list cards with company, city, salary and skills; remote cards; detail keeps the card line", async () => {
  const jobs = nofluff.parseNofluffList(fx("nofluff-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[1];
  assert.deepEqual([j.title, j.company, j.location, j.remote], ["Junior Java Developer (f/m)", "Netcompany Poland", "Warsaw, Poland", false]);
  assert.equal(j.url, "https://nofluffjobs.com/pl/job/junior-java-developer-f-m-netcompany-poland-warsaw-1");
  assert.match(j.description, /^Salary: 8 200 – 9 800 PLN \/ mies\. \(B2B\)\nSkills: Java/);
  assert.deepEqual([jobs[2].remote, jobs[2].location], [true, "Poland"]);
  assert.equal(nofluff.nofluffCategory("python"), "backend");
  assert.equal(nofluff.nofluffCategory("react developer"), "frontend");
  assert.equal(nofluff.nofluffUrl("backend"), "https://nofluffjobs.com/pl/backend?criteria=seniority%3Dtrainee,junior&page=2");

  route = () => fx("nofluff-detail.html");
  const d = (await nofluff.detail(j))!;
  assert.deepEqual([d.company, d.location, d.posted_at], ["Netcompany Poland", "Warsaw, Poland", "2026-10-06"]);
  assert.ok(d.description!.startsWith("Salary: 8 200"), d.description!.slice(0, 40));
  assert.ok(d.description!.includes("Netcompany was founded"));
});

test("startupjobs: sitemap offers newest first, slug titles filtered by keyword, JSON-LD detail", async () => {
  const all = startupjobs.parseStartupjobsSitemap(fx("startupjobs-sitemap.xml"));
  assert.equal(all.length, 5);
  assert.equal(all[0].url, "https://www.startupjobs.cz/nabidka/108857/fifa-player-panska-liga-hraj-za-penize-primo-ve-studiu-v-praze");
  assert.equal(all.find((j) => j.url.endsWith("/70233/java-engineer"))!.title, "Java engineer");

  route = () => fx("startupjobs-sitemap.xml");
  const r = await startupjobs.scan("", ["java"]);
  assert.deepEqual(r.jobs.map((j) => j.title), ["Java engineer"]);
  assert.equal(asked.at(-1), startupjobs.STARTUPJOBS_SITEMAP);

  route = () => fx("startupjobs-detail.html");
  const d = (await startupjobs.detail(r.jobs[0]))!;
  assert.deepEqual([d.title, d.company, d.location], ["Java Engineer", "CONFIRMO s.r.o", "Praha, Hlavní město Praha, Czechia"]);
});

test("landingjobs: search cards with company, city, work mode, salary; detail from JSON-LD, never the API", async () => {
  const jobs = landingjobs.parseLandingjobsList(fx("landingjobs-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.deepEqual([j.title, j.company, j.location, j.remote], ["Data & Integration Architect", "Swisscom", "Lisbon, Portugal", false]);
  assert.equal(j.url, "https://landing.jobs/at/swisscom/data-integration-architect");
  assert.match(j.description, /^Work mode: Hybrid\nContract: Permanent\nSalary: €30\.000 - €40\.000/);
  assert.equal(jobs[2].remote, true);
  assert.equal(landingjobs.landingjobsUrl("java dev"), "https://landing.jobs/jobs?query=java+dev");
  assert.equal(landingjobs.withCountryName("Lisbon, Lisbon, PT"), "Lisbon, Portugal");

  route = () => fx("landingjobs-detail.html");
  asked.length = 0;
  const d = (await landingjobs.detail({ ...jobs[0], url: "https://landing.jobs/at/swisscom/agentic-ai-engineer" }))!;
  assert.deepEqual([d.title, d.location, d.deadline], ["Agentic AI Engineer", "Lisbon, Portugal", "2027-10-05"]);
  assert.ok(d.description!.startsWith("Work mode: Hybrid"));
  assert.ok(asked.every((u) => !u.includes("/api/") && !u.includes("/jobs/search")));
});
