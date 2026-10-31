// Boards for the Maghreb, Egypt, the Gulf, Africa, Eastern Europe, Asia and Latin America (fixtures trimmed from live
// responses saved on 2026-10-31).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { countryOf } from "../geo";
import { planSearch } from "../search/plan";
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
