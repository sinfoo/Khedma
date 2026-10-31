// Boards for the Maghreb, Egypt, the Gulf, Africa, Eastern Europe, Asia and Latin America (fixtures trimmed from live
// responses saved on 2026-10-31).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { countryOf } from "../geo";
import { planSearch } from "../search/plan";
import { COUNTRY_FEEDS } from "./catalog";
import { devbgCompany, devbgUrl, mapDevbg } from "./devbg";
import { agoDate, drjobUrl, parseDrjobList } from "./drjobpro";
import { emploiticUrl, parseEmploiticList } from "./emploitic";
import { pickJsonLdJobPosting } from "./html";
import { jobslyDetailText, jobslyUrl, mapJobsly } from "./jobsly";
import { mapMcf, mcfUrl } from "./mycareersfuture";
import { fromJsonLd } from "./url";
import { mapWorkableJobs, workableJobsUrl } from "./workablejobs";

const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");

test("workable search: every employer's offers in a country, remote ones flagged, run once for the chosen countries", () => {
  const jobs = mapWorkableJobs(JSON.parse(fx("workablejobs.json")));
  assert.equal(jobs.length, 3);
  const [remote, onsite] = jobs;
  assert.equal(remote.company, "CXG");
  assert.equal(remote.location, "Morocco");
  assert.equal(remote.remote, true);
  assert.ok(remote.url.startsWith("https://jobs.workable.com/view/bJvB3Zm74s56PBT9nBsFDL/"));
  assert.equal(remote.source, "workablejobs");
  assert.equal(remote.posted_at, "2026-10-30");
  assert.ok(remote.description.startsWith("We are growing!") && remote.description.includes("What you will bring along"));
  assert.equal(onsite.location, "Casablanca, Casablanca-Settat, Morocco");
  assert.equal(onsite.remote, false);
  assert.equal(countryOf(onsite.location), "MA");
  assert.equal(workableJobsUrl("data engineer", "Ivory Coast"), "https://jobs.workable.com/api/v1/jobs?query=data+engineer&location=Ivory+Coast");
  const runs = planSearch({ keywords: ["engineer"], countries: ["FR", "MA", "EG"], remote: "no" }).runs.filter((r) => r.kind === "workablejobs");
  assert.deepEqual(runs.map((r) => r.handle), ["ma,eg"], "one run, only for the countries it covers");
});

test("mycareersfuture: Singapore's public search -> employer, district, monthly pay, internship type and closing date", () => {
  const jobs = mapMcf(JSON.parse(fx("mycareersfuture.json")));
  assert.equal(jobs.length, 2);
  const j = jobs[0];
  assert.equal(j.title, "Production Engineer Intern");
  assert.equal(j.company, "KEYSTONE CABLE (S) PTE LTD");
  assert.equal(j.location, "North, Singapore");
  assert.equal(countryOf(j.location), "SG");
  assert.equal(j.url, "https://www.mycareersfuture.gov.sg/job/engineering/production-engineer-intern-keystone-cable-6871fc63df8ad951c23cf4096650e6aa");
  assert.equal(j.type, "stage");
  assert.equal(j.posted_at, "2026-10-30");
  assert.equal(j.deadline, "2026-11-29");
  assert.ok(j.description.startsWith("Salary: S$900 – S$1,100 / month · Internship/Attachment · Fresh/entry level"), j.description.slice(0, 90));
  assert.ok(j.description.includes("Skills: Internships, SQL Database"));
  assert.equal(mcfUrl("software intern"), "https://api.mycareersfuture.gov.sg/v2/jobs?search=software+intern&limit=50&page=0");
});

test("jobs.ly: English titles, Libyan city, salary in dinars, remote mode; every offer links to its jobs.ly page", () => {
  const jobs = mapJobsly(JSON.parse(fx("jobsly.json")));
  assert.equal(jobs.length, 3);
  const [dev, remote] = jobs;
  assert.equal(dev.title, "Full Stack Developer");
  assert.equal(dev.company, "Engineering Group");
  assert.equal(dev.location, "Benghazi, Libya");
  assert.equal(countryOf(dev.location), "LY");
  assert.ok(dev.url.startsWith("https://jobs.ly/en/jobs/883901f4-59b1-4ac9-a250-118221b29570-full-stack-developer"));
  assert.ok(dev.description.startsWith("Salary: 2,000 LYD / month · Full-time"), dev.description);
  assert.equal(dev.posted_at !== null, true);
  assert.equal(remote.remote, true);
  assert.equal(jobs.every((j) => j.source === "jobsly"), true);
  assert.equal(jobslyUrl("engineer"), "https://jobs.ly/api/v1/jobs?q=engineer&perPage=50&page=1");
  const body = jobslyDetailText({ data: { description: { en: "Build our web apps.", ar: "" }, requirements: { en: ["React", "Node.js"] } } });
  assert.equal(body, "Build our web apps.\n\nRequirements:\n- React\n- Node.js");
});

test("dr.job: country listing cards -> employer, place, posting day; JobPosting detail; only covered countries searched", () => {
  const now = new Date("2026-10-31T21:00:00Z");
  const jobs = parseDrjobList(fx("drjobpro-list.html"), now);
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Lead Software Engineer Automation & Control");
  assert.equal(j.company, "Baker Hughes");
  assert.equal(j.location, "Cairo, Egypt");
  assert.equal(countryOf(j.location), "EG");
  assert.equal(j.url, "https://www.drjobpro.com/egypt/jobs/lead-software-engineer-automation-control-cairo-baker-hughes-MVVLUXR027NWSI1");
  assert.equal(j.posted_at, "2026-10-31", "23 hours ago");
  assert.ok(j.description.startsWith("Are you an experienced Software Engineer"));
  assert.equal(agoDate("3 days ago", now), "2026-10-28");
  assert.equal(agoDate("2 weeks ago", now), "2026-10-17");
  assert.equal(drjobUrl("saudi-arabia", "Software Engineer"), "https://www.drjobpro.com/saudi-arabia/software-engineer-jobs");
  assert.equal(drjobUrl("egypt", ""), "https://www.drjobpro.com/egypt/jobs");
  const ld = fromJsonLd(pickJsonLdJobPosting(fx("drjobpro-detail.html"))!, j.url);
  assert.equal(ld.title, "Showroom Sales Engineer");
  assert.ok(ld.description.length > 300);
  const run = planSearch({ keywords: ["engineer"], countries: ["AE", "SA", "EG"], remote: "no" }).runs.find((r) => r.kind === "drjobpro");
  assert.equal(run?.handle, "sa,eg", "the UAE has no Dr.Job listing");
});

test("emploitic: search results' JobPostings -> Algerian place, employer, internship type; full posting from the detail page", () => {
  const jobs = parseEmploiticList(fx("emploitic-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[1];
  assert.equal(j.title, "Stage Commercial(e)");
  assert.equal(j.company, "LIFE BOX");
  assert.equal(j.location, "Alger, Alger, Algeria");
  assert.equal(countryOf(j.location), "DZ");
  assert.equal(j.url, "https://emploitic.com/entreprises/life-box/offres-d-emploi/services/stage-commerciale-pysmg");
  assert.equal(j.type, "stage");
  assert.equal(j.posted_at, "2026-09-06");
  assert.equal(j.source, "emploitic");
  assert.equal(emploiticUrl("Développeur web"), "https://emploitic.com/offres-d-emploi/q-developpeur-web");
  assert.equal(emploiticUrl(""), "https://emploitic.com/offres-d-emploi");
  const ld = fromJsonLd(pickJsonLdJobPosting(fx("emploitic-detail.html"))!, j.url);
  assert.ok(ld.title && ld.description.length > 300, ld.description.slice(0, 80));
});

test("dev.bg: job search -> employer from the slug, one offer per company and title with all its cities, intern level", () => {
  const jobs = mapDevbg(JSON.parse(fx("devbg.json")));
  assert.deepEqual(jobs.map((j) => [j.title, j.company]), [["Head of AI Engineering (f/m/x)", "Neoshare"], ["Junior Python Developer (with experience)", "Ict Strypes"]]);
  const [lead, junior] = jobs;
  assert.equal(lead.location, "Sofia, Bulgaria");
  assert.equal(countryOf(lead.location), "BG");
  assert.equal(junior.location, "Plovdiv · Sofia · Burgas · Varna, Bulgaria");
  assert.equal(junior.remote, true, "one of its posts is remote");
  assert.equal(junior.type, "stage");
  assert.equal(junior.url, "https://dev.bg/company/jobads/ict-strypes-junior-python-developer-with-experience-1/");
  assert.equal(junior.source, "devbg");
  assert.equal(junior.posted_at, "2026-10-30");
  assert.ok(lead.description.startsWith("Your mission"));
  assert.equal(devbgCompany("dsk-bank-ekspert-suotvetstvie", "Експерт Съответствие"), "", "a Cyrillic title is not in the slug");
  assert.equal(devbgUrl("data engineer"), "https://dev.bg/wp-json/wp/v2/job-listings?per_page=50&_fields=link%2Cslug%2Cdate%2Ctitle%2Ccontent%2Cclass_list&search=data+engineer");
  assert.ok(!COUNTRY_FEEDS.some((f) => f.handle.includes("dev.bg")), "the provider replaces the plain feed");
});
