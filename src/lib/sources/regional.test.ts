// Boards for the Maghreb, Egypt, the Gulf, Africa, Eastern Europe, Asia and Latin America (fixtures trimmed from live
// responses saved on 2026-10-31).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { countryOf } from "../geo";
import { planSearch } from "../search/plan";
import { jobslyDetailText, jobslyUrl, mapJobsly } from "./jobsly";
import { mapMcf, mcfUrl } from "./mycareersfuture";
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
