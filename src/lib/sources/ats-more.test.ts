import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPersonio, mapRecruitee, mapWorkable } from "./ats-more";
import { detectAtsUrl } from "./ats";

test("employer boards map to offers that link to the employer", () => {
  const w = mapWorkable({ name: "Hugging Face", jobs: [{ title: "ML Intern", shortcode: "ABC", city: "Paris", country: "France", telecommuting: false, employment_type: "Internship", published_on: "2026-10-01", description: "<p>Python</p>", url: "https://apply.workable.com/j/ABC" }] }, "huggingface");
  assert.equal(w[0].company, "Hugging Face");
  assert.equal(w[0].type, "stage");
  assert.equal(w[0].url, "https://apply.workable.com/j/ABC");
  const r = mapRecruitee({ offers: [{ title: "Stage développeur", careers_url: "https://acme.recruitee.com/o/dev", location: "Tunis", description: "<p>React</p>" }] }, "acme");
  assert.equal(r[0].location, "Tunis");
  const p = mapPersonio("<position><id>7</id><office>Munich</office><name>Werkstudent Data</name><jobDescriptions><jobDescription><value>\n<![CDATA[<p>SQL</p>]]>\n</value></jobDescription></jobDescriptions></position>", "acme");
  assert.equal(p[0].url, "https://acme.jobs.personio.com/job/7");
  assert.match(p[0].description, /SQL/);
});

test("careers URLs on the new systems are recognised", () => {
  assert.equal(detectAtsUrl("https://apply.workable.com/huggingface/")?.kind, "workable");
  assert.equal(detectAtsUrl("https://apply.workable.com/j/ABC123"), null);
  assert.equal(detectAtsUrl("https://jobs.smartrecruiters.com/BoschGroup/7440")?.kind, "smartrecruiters");
  assert.equal(detectAtsUrl("https://bunq.recruitee.com/")?.handle, "bunq");
  assert.equal(detectAtsUrl("https://acme.jobs.personio.de/job/1")?.kind, "personio");
  assert.equal(detectAtsUrl("https://app.recruitee.com/"), null);
});

test("dated reposts share one duplicate key; distinct roles do not", async () => {
  const { dedupeKey, guessType } = await import("./classify");
  assert.equal(dedupeKey("Doctolib", "Stage - Sales Development Representative (x/f/m) - décembre 2026"), dedupeKey("Doctolib", "Stage - Sales Development Representative (x/f/m) - janvier 2027"));
  assert.notEqual(dedupeKey("Acme", "Développeur Java - Tunis"), dedupeKey("Acme", "Développeur PHP - Tunis"));
  assert.equal(guessType("Werkstudent Data Engineering"), "stage");
});

test("workday boards: URL parsing, listing map and relative dates", async () => {
  const { parseWorkdayBoard, mapWorkday, workdayPostedOn } = await import("./ats-more");
  const b = parseWorkdayBoard("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x");
  assert.deepEqual(b, { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite", publicPath: "NVIDIAExternalCareerSite" });
  assert.equal(parseWorkdayBoard("wd1.myworkdaysite.com/recruiting/snapchat/snap")?.publicPath, "recruiting/snapchat/snap");
  assert.equal(parseWorkdayBoard("https://evil.example.com/site"), null);
  const jobs = mapWorkday([{ title: "Software Intern", externalPath: "/job/Paris/Software-Intern_R1", locationsText: "Paris", postedOn: "Posted 3 Days Ago" }], b!);
  assert.equal(jobs[0].url, "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Paris/Software-Intern_R1");
  assert.equal(jobs[0].source, "workday");
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(workdayPostedOn("Posted 3 Days Ago", now), "2026-10-15");
  assert.equal(workdayPostedOn("Posted 30+ Days Ago", now), null);
  assert.equal(detectAtsUrl("https://acme.wd3.myworkdayjobs.com/fr-FR/Careers")?.handle, "acme.wd3.myworkdayjobs.com/Careers");
});

test("teamtailor listing links carry the title; careers URLs are recognised", async () => {
  const { teamtailorLinks } = await import("./ats-more");
  const html = `<a href="https://acme.teamtailor.com/jobs/123-data-intern" class="x"><span title="Data Intern">Data Intern</span><span>Paris</span></a>
    <a href="/jobs/456-backend-developer"><div><span>Backend Developer</span></div></a>
    <a href="https://other.teamtailor.com/jobs/9-x">X</a><a href="/jobs">All jobs</a>`;
  assert.deepEqual(teamtailorLinks(html, "acme.teamtailor.com"), [
    { url: "https://acme.teamtailor.com/jobs/123-data-intern", title: "Data Intern" },
    { url: "https://acme.teamtailor.com/jobs/456-backend-developer", title: "Backend Developer" },
  ]);
  assert.equal(detectAtsUrl("https://acme.teamtailor.com/jobs")?.kind, "teamtailor");
});
