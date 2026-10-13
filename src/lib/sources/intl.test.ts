import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { arbeitnowUrl, mapArbeitnow } from "./arbeitnow";
import { mapJobRoom } from "./jobroom";
import { mapWantedly, wantedlyUrl } from "./wantedly";
import { jobcloudSearchUrl, parseJobcloudDetail, parseJobcloudSearch } from "./jobcloud";
import { englishjobsUrl, parseEnglishjobsList, parseMonthDay } from "./englishjobs";
import { daijobUrl, parseDaijobList } from "./daijob";
import { jobbankUrl, parseJobbankDetail, parseJobbankList } from "./jobbank";
import { CATALOG, LINK_KINDS, PROVIDER_KINDS, placeCodes, platformLinks } from "./catalog";

// Fixtures are trimmed copies of live responses saved on 2026-10-13.
const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");

test("arbeitnow: JSON api -> offers with text descriptions and epoch dates", () => {
  const jobs = mapArbeitnow(JSON.parse(fx("arbeitnow.json")));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.source, "arbeitnow");
  assert.match(j.url, /^https:\/\/www\.arbeitnow\.com\/jobs\//);
  assert.ok(j.company.length > 1 && j.title.length > 3);
  assert.match(j.posted_at!, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!j.description.includes("<") && !j.description.includes("&lt;"), "description is plain text");
  assert.equal(arbeitnowUrl("software intern", 2), "https://www.arbeitnow.com/api/job-board-api?search=software+intern&page=2");
});

test("jobroom: search payload -> title without highlights, Swiss location, dates", () => {
  const jobs = mapJobRoom(JSON.parse(fx("jobroom.json")));
  assert.equal(jobs.length, 3);
  for (const j of jobs) {
    assert.equal(j.source, "jobroom");
    assert.ok(!/<\/?em>/.test(j.title) && !/<\/?em>/.test(j.description), "highlight tags stripped");
    assert.match(j.url, /^https:\/\/www\.job-room\.ch\/job-search\/[0-9a-f-]{36}$/);
    assert.match(j.location, /Switzerland$/);
    assert.match(j.posted_at!, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.ok(jobs.some((j) => j.type === "stage" || j.type === "pfe" || /praktik/i.test(j.title)), "internship search returns internships");
});

test("wantedly: project api -> offers located in Japan", () => {
  const jobs = mapWantedly(JSON.parse(fx("wantedly.json")));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.source, "wantedly");
  assert.match(j.url, /^https:\/\/www\.wantedly\.com\/projects\/\d+$/);
  assert.match(j.location, /, Japan$/);
  assert.ok(j.company.length > 1);
  assert.match(wantedlyUrl("software engineer"), /q=software\+engineer&page=1/);
});

test("jobs.ch / jobup.ch: JSON-LD ItemList on the search page, JobPosting on the detail page", () => {
  const jobs = parseJobcloudSearch(fx("jobsch-search.html"), "jobsch");
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Senior Software Engineer (a) 80–100%");
  assert.equal(j.company, "Swiss Casinos");
  assert.equal(j.location, "Zürich, Switzerland");
  assert.equal(j.posted_at, "2026-09-23");
  assert.equal(j.source, "jobsch");
  assert.equal(j.url, "https://www.jobs.ch/en/vacancies/detail/262b1ae2-5324-467a-bbf3-7a1efa13e74a/");
  assert.equal(j.description, "Contract: Permanent position", "listing boilerplate dropped");
  assert.equal(parseJobcloudSearch(fx("jobsch-search.html"), "jobup")[0].source, "jobup");
  const d = parseJobcloudDetail(fx("jobsch-detail.html"))!;
  assert.ok(d.description!.startsWith("Your Game"), d.description!.slice(0, 40));
  assert.ok(d.description!.includes("- You enthusiastically develop"));
  assert.equal(jobcloudSearchUrl("jobsch", "software intern", "Zurich"), "https://www.jobs.ch/en/vacancies/?location=Zurich&term=software+intern");
  assert.equal(jobcloudSearchUrl("jobup", "stage"), "https://www.jobup.ch/en/jobs/?term=stage");
});

test("englishjobs: listing cards -> company, city, month-day date, clickout url", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const jobs = parseEnglishjobsList(fx("englishjobs-list.html"), "englishjobs_de", now);
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Software Engineer (Intern / Working Student)");
  assert.equal(j.company, "acemate.ai");
  assert.equal(j.location, "Berlin, Germany");
  assert.equal(j.posted_at, "2026-08-04");
  assert.equal(j.type, "stage");
  assert.equal(j.url, "https://www.englishjobs.de/clickout/8340b4183ba533f8");
  assert.equal(j.source, "englishjobs_de");
  assert.ok(j.description.startsWith("Tags: student"));
  assert.equal(parseEnglishjobsList(fx("englishjobs-list.html"), "englishjobs_fr", now)[0].location, "Berlin, France".replace("Berlin, France", "Berlin, France"));
  assert.equal(parseMonthDay("December 25", now), "2025-12-25", "future month-day rolls back a year");
  assert.equal(parseMonthDay("nope", now), null);
  assert.equal(englishjobsUrl("englishjobs_ch", "Software Intern", 2), "https://www.englishjobsearch.ch/jobs/software_intern?page=2");
});

test("daijob: job cards -> title, company, location chain, salary, snippet", () => {
  const jobs = parseDaijobList(fx("daijob-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "[Support Engineer – AI Server Infrastructure]Global Team");
  assert.equal(j.company, "systemsGo Corporation");
  assert.equal(j.location, "Tokyo, Japan");
  assert.equal(j.url, "https://www.daijob.com/en/jobs/detail/1555722");
  assert.equal(j.source, "daijob");
  assert.ok(j.description.includes("Japanese: Business Level"));
  assert.equal(daijobUrl("software engineer", 2), "https://www.daijob.com/en/jobs/search_result?keywords=software+engineer&page=2");
});

test("jobbank: search articles and posting page", () => {
  const jobs = parseJobbankList(fx("jobbank-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "intern");
  assert.equal(j.company, "Strik, Baldinelli, Moniz Ltd.");
  assert.equal(j.location, "London, ON, Canada");
  assert.equal(j.posted_at, "2026-10-09");
  assert.equal(j.url, "https://www.jobbank.gc.ca/jobsearch/jobposting/50465229");
  assert.equal(j.source, "jobbank");
  assert.ok(j.description.includes("Salary: $25.00 hourly"));
  const d = parseJobbankDetail(fx("jobbank-detail.html"))!;
  assert.ok(d.description!.includes("Civil Engineering Intern"));
  assert.ok(!d.description!.includes("&#160;") && !d.description!.includes("<p>"));
  assert.ok(d.description!.startsWith("Terms: Part time · Work location: On site"));
  assert.equal(jobbankUrl("software intern", "Toronto", 2), "https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=software+intern&sort=M&fage=30&locationstring=Toronto&page=2");
});

test("catalog: every kind registered once, link-only entries build real search URLs", () => {
  const kinds = CATALOG.map((c) => c.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  for (const k of [...PROVIDER_KINDS, ...LINK_KINDS]) assert.ok(kinds.includes(k), `${k} missing from CATALOG`);
  for (const c of CATALOG) {
    if (!c.linkOnly) continue;
    assert.ok(c.searchUrl, c.kind);
    const u = c.searchUrl!("software engineer intern", "Germany", "DE");
    assert.match(u, /^https:\/\//, u);
    assert.ok(/software|engineer/i.test(decodeURIComponent(u)), u);
  }
  assert.equal(CATALOG.find((c) => c.kind === "indeed")!.searchUrl!("x", "Germany", "DE"), "https://de.indeed.com/jobs?q=x&l=Germany");
  assert.equal(CATALOG.find((c) => c.kind === "stepstone")!.searchUrl!("Software Engineer Intern", "Berlin", "DE"), "https://www.stepstone.de/jobs/software-engineer-intern/in-berlin");
});

test("platformLinks: one link per chosen country, worldwide boards repeated per country", () => {
  const links = platformLinks(["software engineer intern"], ["DE", "JP"]);
  const names = links.map((l) => l.name);
  assert.ok(names.includes("StepStone") && names.includes("Daijob") === false && names.includes("GaijinPot Jobs"));
  assert.equal(links.filter((l) => l.name === "Indeed").length, 2);
  assert.ok(links.find((l) => l.name === "Indeed" && l.flag === "🇯🇵")!.url.startsWith("https://jp.indeed.com/"));
  assert.ok(!names.includes("HelloWork"), "French boards are not listed for DE+JP");
  assert.ok(links.every((l) => /^https:\/\//.test(l.url)));
  // No country -> Tunisia defaults (worldwide boards only).
  const tn = platformLinks(["stage"], []);
  assert.ok(tn.every((l) => l.flag === "🇹🇳") && tn.some((l) => l.url.startsWith("https://tn.indeed.com/")));
  assert.deepEqual(placeCodes("DE,FR"), ["DE", "FR"]);
  assert.deepEqual(placeCodes("Allemagne, Tunis, Remote"), ["DE", "TN"]);
  assert.deepEqual(placeCodes("REMOTE"), []);
});
