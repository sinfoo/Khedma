import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFlatchr, mapGem, mapJobScore, mapPersonio, mapRecruitee, mapRippling, mapWorkable } from "./ats-more";
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

test("BambooHR, Breezy and JOIN listings map to the employer's posting URLs", async () => {
  const { mapBamboo, mapBreezy, mapJoin } = await import("./ats-more");
  const b = mapBamboo([{ id: "52", jobOpeningName: "Marketing Intern", location: { city: "Berlin", state: "BE" }, locationType: "1" }], "acme");
  assert.equal(b[0].url, "https://acme.bamboohr.com/careers/52");
  assert.equal(b[0].remote, true);
  assert.equal(b[0].type, "stage");
  const z = mapBreezy([{ name: "Data Intern", url: "https://acme.breezy.hr/p/52-data-intern", location: { name: "Paris, FR" }, published_date: "2026-10-01T10:00:00Z" }, { name: "Elsewhere", url: "https://evil.example/p/1" }], "acme");
  assert.equal(z.length, 1);
  assert.equal(z[0].posted_at, "2026-10-01");
  const j = mapJoin([{ id: 16797130, idParam: "16797130-praktikum-marketing", title: "Praktikum Marketing", workplaceType: "REMOTE", city: { cityName: "Hamburg", countryName: "Germany" } }], { name: "Just Hiring", domain: "justhiringde" });
  assert.equal(j[0].url, "https://join.com/companies/justhiringde/16797130-praktikum-marketing");
  assert.equal(j[0].location, "Hamburg, Germany");
});

test("softgarden links, SuccessFactors and iCIMS sitemaps give titled offers", async () => {
  const { softgardenLinks, parseSitemap, mapSuccessFactors, mapIcims, itemprops } = await import("./ats-more");
  const links = softgardenLinks(`<a href="../job/61467642/Initiativbewerbung-Pflichtpraktikum-m-w-d-?jobDbPVId=1&amp;l=de"><span>Pflichtpraktikum (m/w/d)</span></a>`, "bundesdruckerei");
  assert.deepEqual(links, [{ url: "https://bundesdruckerei.softgarden.io/job/61467642/Initiativbewerbung-Pflichtpraktikum-m-w-d-", title: "Pflichtpraktikum (m/w/d)" }]);
  const sm = parseSitemap(`<urlset><url><loc>https://jobs.tetrapak.com/job/Lund-Software-Intern/1445988633/</loc><lastmod>2026-10-17</lastmod></url><url><loc>https://other.example/job/X/1/</loc></url></urlset>`);
  const sf = mapSuccessFactors(sm.urls, "jobs.tetrapak.com");
  assert.equal(sf.length, 1);
  assert.equal(sf[0].title, "Lund Software Intern");
  assert.equal(sf[0].posted_at, "2026-10-17");
  const ic = mapIcims(parseSitemap(`<urlset><url><loc>https://careers-360care.icims.com/jobs/search</loc></url><url><loc>https://careers-360care.icims.com/jobs/4872/audiology-intern/job</loc></url></urlset>`).urls, "careers-360care.icims.com");
  assert.deepEqual(ic.map((j) => j.title), ["audiology intern"]);
  assert.equal(parseSitemap(`<sitemapindex><sitemap><loc>https://x.example/a.xml</loc></sitemap></sitemapindex>`).sitemaps[0], "https://x.example/a.xml");
  assert.deepEqual(itemprops(`<div itemprop="description"><div><p>Python</p></div><p>SQL</p></div><div>footer</div><span itemprop="description">Docker</span>`, "description"), ["<div><p>Python</p></div><p>SQL</p>", "Docker"]);
});

test("thehub cards and Hacker News hiring comments become offers", async () => {
  const { mapTheHub, mapHnComment } = await import("./ats-more");
  const hub = mapTheHub(`<div class="card card-job-find-list"><span class="card-job-find-list__position">AI Engineering Intern</span> <div class="bullet-inline-list x"><span>Light</span> <span>London</span> <!----> <span>Internship</span></div> <a href="/jobs/6aa667bf2964a051fd989323" class="card-job-find-list__link"></a></div>`);
  assert.deepEqual([hub[0].title, hub[0].company, hub[0].location, hub[0].type], ["AI Engineering Intern", "Light", "London", "stage"]);
  const hn = mapHnComment({ id: 42, created_at: "2026-10-01T15:00:00Z", text: `Acme | Software Engineering Intern | Berlin | Full-time | Remote (EU)<p>We build things. Apply: <a href="https:&#x2F;&#x2F;jobs.lever.co&#x2F;acme&#x2F;123">jobs.lever.co/acme/123</a>` });
  assert.equal(hn?.company, "Acme");
  assert.equal(hn?.title, "Software Engineering Intern");
  assert.equal(hn?.location, "Berlin");
  assert.equal(hn?.url, "https://jobs.lever.co/acme/123");
  assert.equal(mapHnComment({ id: 43, text: "Senior Engineer looking for work | Remote" }), null);
});

test("new careers URLs are recognised; apply pages and board ads lead to the employer's posting", async () => {
  const { canonicalPostingUrl } = await import("./url");
  const { employerLink } = await import("./trust");
  assert.equal(detectAtsUrl("https://acme.bamboohr.com/careers")?.kind, "bamboohr");
  assert.equal(detectAtsUrl("https://acme.breezy.hr/")?.handle, "acme");
  assert.equal(detectAtsUrl("https://join.com/companies/justhiringde")?.kind, "join");
  assert.equal(detectAtsUrl("https://bundesdruckerei.softgarden.io/de/vacancies")?.kind, "softgarden");
  assert.equal(detectAtsUrl("https://careers-360care.icims.com/jobs/4872/x/job")?.handle, "360care");
  assert.equal(canonicalPostingUrl("https://jobs.lever.co/acme/abc-123/apply"), "https://jobs.lever.co/acme/abc-123");
  assert.equal(canonicalPostingUrl("https://jobs.ashbyhq.com/acme/uuid/application?src=x"), "https://jobs.ashbyhq.com/acme/uuid?src=x");
  assert.equal(canonicalPostingUrl("https://jobs.lever.co/apply"), "https://jobs.lever.co/apply");
  assert.equal(employerLink("https://www.arbeitnow.com/jobs/x", "Apply here: https://jobs.lever.co/acme/abc-123."), "https://jobs.lever.co/acme/abc-123");
  assert.equal(employerLink("https://www.arbeitnow.com/jobs/x", "See https://jobs.lever.co/acme for all roles"), null);
  assert.equal(employerLink("https://jobs.lever.co/acme/1", "https://jobs.lever.co/acme/2"), null);
});

// Shapes trimmed from real responses (2026-10-23).
test("gem, rippling, flatchr and jobscore boards map to offers", () => {
  const [g] = mapGem([{ title: "Rotational Operations Program", absolute_url: "https://jobs.gem.com/soeffects/am9i", content_plain: "Company Overview: Second Order Effects", location: { name: "El Segundo, United States" }, location_type: "in_office", employment_type: "full_time", first_published_at: "2026-07-12T15:55:21.518Z" }], "soeffects");
  assert.equal(g.title, "Rotational Operations Program");
  assert.equal(g.remote, false);
  assert.equal(g.location, "El Segundo, United States");
  const [r] = mapRippling([{ uuid: "ef0b", name: " Account Executive, Broker Channel ", url: "https://ats.rippling.com/rippling/jobs/ef0b", workLocation: { label: "AR" } }], "rippling");
  assert.equal(r.title, "Account Executive, Broker Channel");
  assert.equal(r.source, "rippling");
  const [f] = mapFlatchr({ items: [{ published: true, vacancy: { title: "Account exective _HR Tech ", slug: "d86r-account", description: "<p>Rejoins Flatchr</p>", mission: "<p>Ton rôle</p>", salary: 35000, salary_max: 60000, currency: "EUR", mensuality: "y", remote: "notime", contract_type: "CDI", address: { locality: "Boulogne-Billancourt" }, company: { name: "Flatchr" } } }] }, "flatchr");
  assert.equal(f.url, "https://careers.flatchr.io/company/flatchr/vacancy/d86r-account/");
  assert.equal(f.remote, false);
  assert.match(f.description, /Salaire : 35000 - 60000 EUR par an/);
  const [s] = mapJobScore({ company_name: "Atlantic BT", jobs: [{ title: "Cloud Operations Engineer", detail_url: "https://careers.jobscore.com/careers/atlanticbt/jobs/cloud-ops", location: "Raleigh, NC / Full-time Remote", description: "<p>Atlantic BT helps clients</p>", job_type: "Full Time" }] }, "atlanticbt");
  assert.equal(s.company, "Atlantic BT");
  assert.equal(s.remote, true);
});

test("gem, rippling, flatchr and jobscore board URLs are recognised", () => {
  assert.equal(detectAtsUrl("https://jobs.gem.com/soeffects/am9i")?.kind, "gem");
  assert.equal(detectAtsUrl("https://ats.rippling.com/rippling/jobs")?.kind, "rippling");
  assert.deepEqual([detectAtsUrl("https://careers.flatchr.io/fr/company/flatchr/vacancy/x/")?.kind, detectAtsUrl("https://careers.flatchr.io/company/flatchr.json")?.handle], ["flatchr", "flatchr"]);
  assert.equal(detectAtsUrl("https://careers.jobscore.com/careers/atlanticbt")?.handle, "atlanticbt");
});
