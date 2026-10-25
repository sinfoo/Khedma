import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { flagUkRightToWork, jobsacukUrl, parseDayMonth, parseJobsacukList } from "./jobsacuk";
import { builtinUrl, parseBuiltinDetail, parseBuiltinList } from "./builtin";
import { jobbankFeedUrl, parseJobbankFeed } from "./jobbank";
import { pickJsonLdJobPosting } from "./html";
import { fromJsonLd } from "./url";

// Trimmed live pages saved on 2026-10-25.
const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");
const now = new Date("2026-10-25T12:00:00Z");

test("jobs.ac.uk: result cards -> employer, place, salary, placed and closing dates", () => {
  const jobs = parseJobsacukList(fx("jobsacuk-list.html"), now);
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Software Engineer");
  assert.equal(j.company, "The University of Edinburgh");
  assert.equal(j.location, "Edinburgh, Hybrid, United Kingdom");
  assert.equal(j.url, "https://www.jobs.ac.uk/job/DTJ293/software-engineer");
  assert.equal(j.source, "jobsacuk");
  assert.equal(j.posted_at, "2026-10-22");
  assert.equal(j.deadline, "2026-11-04");
  assert.ok(j.description.includes("Salary: £41,064 to £48,822"));
  assert.equal(parseDayMonth("04 Jan", true, now), "2027-01-04", "a closing date in January is next year");
  assert.equal(parseDayMonth("20 Dec", false, now), "2025-12-20", "a placed date in December is last year");
  assert.equal(jobsacukUrl("phd ai"), "https://www.jobs.ac.uk/search/?keywords=phd+ai&sortOrder=0&pageSize=25&startIndex=1");
  const ld = fromJsonLd(pickJsonLdJobPosting(fx("jobsacuk-detail.html"))!, j.url);
  assert.ok(ld.description.length > 200 && ld.description.includes("Software Engineer"));
});

test("UK right to work: flagged when sponsorship is refused, not when offered", () => {
  assert.ok(flagUkRightToWork("You must have the right to work in the UK.").startsWith("UK right to work required\n\n"));
  assert.ok(flagUkRightToWork("We are unable to offer visa sponsorship for this role.").startsWith("UK right to work required"));
  assert.ok(flagUkRightToWork("Sponsorship is not available.").startsWith("UK right to work required"));
  assert.equal(flagUkRightToWork("We can offer visa sponsorship."), "We can offer visa sponsorship.");
  const once = flagUkRightToWork("No sponsorship.");
  assert.equal(flagUkRightToWork(once), once, "flag added once");
});

test("builtin: job cards -> company, US place, work mode, salary, skills; JSON-LD detail behind an escaped type", () => {
  const jobs = parseBuiltinList(fx("builtin-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[1];
  assert.equal(j.title, "Software Engineer II");
  assert.equal(j.company, "Mastercard");
  assert.equal(j.location, "Arlington, VA, USA");
  assert.equal(j.url, "https://builtin.com/job/software-engineer-ii/11864543");
  assert.equal(j.source, "builtin");
  assert.equal(j.remote, false);
  assert.ok(j.description.startsWith("Hybrid · Entry level · Salary: 106K-169K Annually"));
  assert.ok(j.description.includes("Top skills: Angular"));
  const d = parseBuiltinDetail(fx("builtin-detail.html"), j.url)!;
  assert.ok(d.description!.startsWith("Our Purpose"));
  assert.equal(d.posted_at, "2026-10-24");
  assert.equal(builtinUrl(""), "https://builtin.com/jobs/dev-engineering/entry-level");
  assert.equal(builtinUrl("internship", 2), "https://builtin.com/jobs/internship?page=2");
  assert.ok(!builtinUrl("x?search=java").includes("search"), "never a search query");
});

test("jobbank: Atom feed entries -> employer, location, salary, posting URL", () => {
  const jobs = parseJobbankFeed(fx("jobbank-feed.xml"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "software developer");
  assert.equal(j.company, "The French Sourcer");
  assert.equal(j.location, "Toronto, ON, Canada");
  assert.equal(j.url, "https://www.jobbank.gc.ca/jobsearch/jobposting/50576301");
  assert.equal(j.posted_at, "2026-10-25");
  assert.equal(j.description, "Salary: $220,000.00 to $320,000.00 annually");
  assert.equal(j.source, "jobbank");
  assert.equal(jobbankFeedUrl("junior developer", "Toronto"), "https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=junior+developer&locationstring=Toronto&sort=D");
});
