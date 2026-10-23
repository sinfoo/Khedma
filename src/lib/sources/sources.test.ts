import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, pickJsonLdJobPosting, pickMeta } from "./html";
import { guessRemote, guessType, matchesProfile, normalizeDate } from "./classify";
import { parseRss } from "./rss";
import { ashbyPay } from "./ashby";
import { mapGreenhouse } from "./greenhouse";
import { importFromUrl, validatePublicUrl } from "./url";
import { DEMO_JOBS } from "./demo";
import type { NewJob } from "../db";
import type { Profile } from "../types";

const job = (over: Partial<NewJob>): NewJob => ({
  title: "x", company: "c", location: "", remote: false, url: "https://e.x/1", source: "manual",
  type: "stage", description: "", tags: [], posted_at: null, deadline: null, ...over,
});
const profile = (over: Partial<Profile>): Profile => ({
  id: 1, name: "", email: "", headline: "", cv_md: "", skills: [], target_roles: [], target_locations: [],
  target_types: [], languages: [], settings: { locale: "fr", theme: "system", provider: "offline", claude_model: "" }, ...over,
});

test("htmlToText drops scripts, keeps lists and decodes entities", () => {
  const html = `<html><head><style>p{}</style><script>var x=1;</script></head><body>
    <nav>menu</nav><h1>Titre&nbsp;&amp; co</h1><p>Caf&eacute; &#233;t&#xE9;</p>
    <ul><li>Un</li><li>Deux</li></ul>Fin<br>ligne<footer>foot</footer></body></html>`;
  const t = htmlToText(html);
  assert.equal(t, "Titre & co\n\nCafé été\n\n- Un\n- Deux\nFin\nligne");
  assert.ok(!t.includes("menu") && !t.includes("var x"));
});

test("pickMeta and pickJsonLdJobPosting", () => {
  const html = `<head><meta content="Acme" property="og:site_name"><meta name="description" content="d">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["JobPosting"],"title":"Dev"}]}</script></head>`;
  assert.equal(pickMeta(html, "og:site_name"), "Acme");
  assert.equal(pickJsonLdJobPosting(html)?.title, "Dev");
  assert.equal(pickJsonLdJobPosting("<p>no</p>"), null);
});

test("guessType FR/EN", () => {
  assert.equal(guessType("Stage PFE – Développeur Flutter"), "pfe");
  assert.equal(guessType("Stage d'été Java", "Projet de fin d'études possible"), "pfe");
  assert.equal(guessType("Software Engineering Intern"), "stage");
  assert.equal(guessType("Stagiaire data"), "stage");
  assert.equal(guessType("Alternance développeur .NET"), "alternance");
  assert.equal(guessType("Apprenticeship – Backend"), "alternance");
  assert.equal(guessType("Freelance React developer"), "freelance");
  assert.equal(guessType("Senior Backend Engineer", "We hire. Internship program also exists."), "stage");
  assert.equal(guessType("Account Executive", "Join an early-stage startup in hyper-growth stage."), "emploi");
  assert.equal(guessType("Développeur Java", "Offre de stage de 2 mois, stage rémunéré."), "stage");
  assert.equal(guessType("Senior Backend Engineer"), "emploi");
});

test("matchesProfile is accent and language forgiving", () => {
  const p = profile({ target_roles: ["developer"], target_types: ["stage", "pfe"] });
  assert.ok(matchesProfile(job({ title: "Développeur Java – Stage", type: "stage" }), p));
  assert.ok(matchesProfile(job({ title: "Dev Fullstack", type: "pfe" }), p));
  assert.ok(!matchesProfile(job({ title: "Développeur Java", type: "emploi" }), p));
  assert.ok(!matchesProfile(job({ title: "Comptable", type: "stage" }), p));
  assert.ok(matchesProfile(job({ title: "Ingénieur logiciel" }), profile({ target_roles: ["software engineer"] })));
  assert.ok(matchesProfile(job({ title: "Data Scientist" }), profile({ target_roles: ["data"] })));
  assert.ok(matchesProfile(job({ title: "Anything" }), profile({})));
});

test("normalizeDate", () => {
  assert.equal(normalizeDate("Wed, 07 Oct 2026 16:27:03 +0000"), "2026-10-07");
  assert.equal(normalizeDate(1652790736245), "2022-05-17");
  assert.equal(normalizeDate("nope"), null);
  assert.equal(normalizeDate(undefined), null);
});

test("parseRss handles RSS items, CDATA and Atom entries", () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>Acme Jobs: feed</title>
    <item><title><![CDATA[Backend Intern - Tunis]]></title><link>https://acme.io/j/1</link>
      <description>&lt;p&gt;Python &amp;amp; Django&lt;/p&gt;</description><pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate></item>
    <item><title>Globex: Remote Data Engineer</title><link>https://g.io/2</link><description>Spark</description></item>
    <item><title>no link</title></item></channel></rss>`;
  const jobs = parseRss(rss, "https://acme.io/feed");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Backend Intern");
  assert.equal(jobs[0].location, "Tunis");
  assert.equal(jobs[0].company, "Acme Jobs");
  assert.equal(jobs[0].description, "Python & Django");
  assert.equal(jobs[0].posted_at, "2026-10-05");
  assert.equal(jobs[0].type, "stage");
  assert.deepEqual([jobs[1].company, jobs[1].title, jobs[1].remote], ["Globex", "Remote Data Engineer", true]);

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Initech</title>
    <entry><title>SRE</title><link rel="alternate" href="https://i.io/sre"/><summary>k8s</summary><updated>2026-10-01T00:00:00Z</updated></entry></feed>`;
  const a = parseRss(atom, "https://i.io/atom");
  assert.deepEqual([a[0].url, a[0].company, a[0].posted_at, a[0].tags], ["https://i.io/sre", "Initech", "2026-10-01", ["Kubernetes"]]);
});

test("mapGreenhouse unescapes content and normalizes dates", () => {
  const payload = {
    jobs: [
      {
        title: "Software Engineer Intern", absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
        location: { name: "Paris, Remote" }, content: "&lt;p&gt;Build with &lt;b&gt;React&lt;/b&gt; &amp;amp; Node&lt;/p&gt;",
        first_published: "2026-09-24T13:34:54-04:00", company_name: "Acme Corp",
      },
      { title: "No url" },
    ],
  };
  const [j, ...rest] = mapGreenhouse(payload, "acme-corp");
  assert.equal(rest.length, 0);
  assert.equal(j.company, "Acme Corp");
  assert.equal(j.description, "Build with React & Node");
  assert.equal(j.type, "stage");
  assert.equal(j.remote, true);
  assert.equal(j.posted_at, "2026-09-24");
  assert.equal(j.source, "greenhouse");
  assert.ok(j.tags.includes("React") && j.tags.includes("Node.js"));
  assert.equal(mapGreenhouse({ jobs: [{ title: "T", absolute_url: "https://x/1" }] }, "acme-corp")[0].company, "Acme Corp");
});

test("importFromUrl rejects private hosts and bad schemes", async () => {
  for (const u of ["http://127.0.0.1/x", "http://localhost:3000/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.20.0.1/", "http://[::1]/", "http://0.0.0.0/", "http://box.local/", "ftp://example.com/", "nope"]) {
    const r = await importFromUrl(u);
    assert.ok(r.error, `expected error for ${u}`);
    assert.equal(r.job, undefined);
  }
  assert.ok(validatePublicUrl("https://example.com/jobs/1").url);
});

test("demo data is well formed", () => {
  assert.equal(DEMO_JOBS.length, 12);
  assert.equal(new Set(DEMO_JOBS.map((j) => j.url)).size, 12);
  for (const j of DEMO_JOBS) {
    assert.ok(j.description.length >= 600 && j.description.length <= 1300, `${j.title}: ${j.description.length} chars`);
    assert.ok(j.deadline! > new Date().toISOString().slice(0, 10));
    assert.ok(j.tags.length > 0, j.title);
  }
});

test("remote: negations and hybrid are not remote", () => {
  assert.equal(guessRemote("No remote work possible"), false);
  assert.equal(guessRemote("Pas de télétravail"), false);
  assert.equal(guessRemote("Hybrid - Paris"), false);
  assert.equal(guessRemote("Hybride, 100 % télétravail possible"), true);
  assert.equal(guessRemote("Remote (EMEA)"), true);
});

test("ashby structured pay becomes a salary line", () => {
  assert.equal(ashbyPay({ scrapeableCompensationSalarySummary: "$211.4K - $290.6K", compensationTiers: [{ components: [{ compensationType: "EquityPercentage", interval: "NONE" }, { compensationType: "Salary", interval: "1 YEAR" }] }] }), "Salary: $211.4K - $290.6K per year");
  assert.equal(ashbyPay(null), "");
});
