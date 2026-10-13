import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalName, companySlug, normalizeCompany } from "./normalize";
import { classifyLiveness } from "./liveness";
import { parseRobots, robotsAllow } from "./robots";
import { extractFacts, findLink } from "./research";

test("normalizeCompany: legal noise, accents, case and aliases collapse", () => {
  assert.equal(normalizeCompany("VERMEG Tunisie SARL"), "vermeg");
  assert.equal(normalizeCompany("Vermeg"), "vermeg");
  assert.equal(normalizeCompany("Télnet Holding"), "telnet");
  assert.equal(normalizeCompany("Sofrecom Tunisie"), "sofrecom");
  assert.equal(normalizeCompany("Proxym-IT"), "proxym");
  assert.equal(normalizeCompany("Doctolib SAS"), "doctolib");
  assert.equal(normalizeCompany("  Acme   Corp. Ltd "), "acme");
  assert.equal(normalizeCompany("SARL"), "");
  assert.equal(companySlug("Telnet Technologies"), "telnet");
  assert.equal(companySlug("Nexora Systems"), "nexora-systems");
  assert.equal(canonicalName("vermeg tunisie"), "VERMEG");
  assert.equal(canonicalName("Nexora  Systems"), "Nexora Systems");
});

test("classifyLiveness: status codes", () => {
  assert.equal(classifyLiveness(404, "").status, "closed");
  assert.equal(classifyLiveness(410, "").status, "closed");
  assert.equal(classifyLiveness(403, "").status, "unknown");
  assert.equal(classifyLiveness(429, "").status, "unknown");
  assert.equal(classifyLiveness(503, "").status, "unknown");
  assert.equal(classifyLiveness(0, "").status, "unknown");
});

const page = (body: string) => `<html><head><title>Job</title></head><body><nav>Menu</nav><main>${body}</main></body></html>`;
const filler = "<p>We are hiring a software engineer intern to work on our platform with React and Node.js. Apply before the end of the month. Great team.</p>";

test("classifyLiveness: open page vs FR/EN closed markers", () => {
  assert.equal(classifyLiveness(200, page(filler)).status, "open");
  assert.equal(classifyLiveness(200, page(`${filler}<p>Cette offre n’est plus disponible.</p>`)).status, "closed");
  assert.equal(classifyLiveness(200, page(`${filler}<div class="alert">This job is no longer accepting applications.</div>`)).status, "closed");
  assert.equal(classifyLiveness(200, page(`${filler}<p>Le poste a été pourvu.</p>`)).status, "closed");
  assert.equal(classifyLiveness(200, page(`${filler}<p>The job you are looking for is no longer open.</p>`)).status, "closed");
  assert.equal(classifyLiveness(200, page("<p>tiny</p>")).status, "unknown", "near-empty (JS-only) page");
});

test("robots: group selection and longest-match rules", () => {
  const rules = parseRobots(`User-agent: Googlebot\nDisallow: /private\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\n`);
  assert.equal(robotsAllow(rules, "/careers"), true);
  assert.equal(robotsAllow(rules, "/admin/x"), false);
  assert.equal(robotsAllow(rules, "/admin/public/y"), true);
  assert.equal(robotsAllow(rules, "/doc.pdf"), false);
  assert.equal(robotsAllow(rules, "/private"), true, "googlebot group does not apply to us");
  const ours = parseRobots(`User-agent: ENITJobs\nDisallow: /\n\nUser-agent: *\nAllow: /`);
  assert.equal(robotsAllow(ours, "/"), false);
  assert.equal(robotsAllow([], "/anything"), true);
});

const HOME = `<html><head><title>Acme – Fintech platform</title>
<meta property="og:description" content="Acme builds payment infrastructure for banks across Africa and Europe.">
</head><body>
<nav><a href="/about-us">About us</a><a href="https://boards.greenhouse.io/acme">Careers</a></nav>
<main><h1>Payments, reinvented</h1>
<p>We are a scale-up of 250+ employees headquartered in Tunis, with offices in Paris. Our stack: Python, Django, PostgreSQL, Kubernetes and React.</p>
<p>We value transparency, mentoring and a hybrid work model.</p></main>
<footer><a href="https://www.linkedin.com/company/acme-fintech">LinkedIn</a><a href="https://github.com/acme-fintech">GitHub</a><a href="https://twitter.com/share?u=x">share</a></footer>
</body></html>`;

test("research: link discovery and fact extraction from fixture HTML", () => {
  const base = new URL("https://acme.example.com/");
  assert.equal(findLink(HOME, base, "about"), "https://acme.example.com/about-us");
  assert.equal(findLink(HOME, base, "careers"), "https://boards.greenhouse.io/acme");
  const f = extractFacts([{ url: base.href, html: HOME }]);
  assert.equal(f.description, "Acme builds payment infrastructure for banks across Africa and Europe.");
  assert.equal(f.sector, "Fintech / Banking");
  assert.equal(f.size, "250+ employees");
  assert.equal(f.hq, "Tunis");
  for (const s of ["Python", "Django", "PostgreSQL", "Kubernetes", "React"]) assert.ok(f.tech.includes(s), `tech ${s}`);
  assert.equal(f.social.linkedin, "https://www.linkedin.com/company/acme-fintech");
  assert.equal(f.social.github, "https://github.com/acme-fintech");
  assert.equal(f.social.x, undefined, "share links ignored");
  for (const k of ["Transparency", "Mentoring", "Hybrid"]) assert.ok(f.culture.includes(k), `culture ${k}`);
  assert.deepEqual(f.pages, [base.href]);
  assert.ok(f.excerpt.includes("Payments, reinvented"));
});
