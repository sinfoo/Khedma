import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jobLinksUrl, jobSearchUrl, mapJobLinks, mapJobSearch } from "./jobtech";
import { mapSimplify, simplifyPlace } from "./simplify";
import { flightText, navPostingUrl, navSearchUrl, parseNavDetail, parseNavSearch } from "./nav";
import { ftSearchUrl, infojobsUrl, itjobsUrl, mapFranceTravail, mapInfojobs, mapItjobs } from "./keyed";
import { countryOf } from "../geo";

// jobtech/nav/simplify: trimmed live responses saved on 2026-10-25.
// francetravail/itjobs/infojobs: shaped after the official API docs (no key at save time).
const raw = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");
const fx = (name: string) => JSON.parse(raw(name));

test("jobtech: Platsbanken ads with terms, deadline and Swedish municipality", () => {
  const jobs = mapJobSearch(fx("jobtech-search.json"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Junior Frontendutvecklare");
  assert.equal(j.company, "Arbetsförmedlingen");
  assert.equal(j.location, "Solna, Sweden");
  assert.equal(countryOf(j.location), "SE");
  assert.equal(j.url, "https://arbetsformedlingen.se/platsbanken/annonser/31625936");
  assert.equal(j.source, "jobtech");
  assert.equal(j.posted_at, "2026-10-21");
  assert.equal(j.deadline, "2026-11-05");
  assert.ok(j.description.startsWith("Terms: Vanlig anställning · Tills vidare"), j.description.slice(0, 60));
  assert.equal(jobSearchUrl("junior developer"), "https://jobsearch.api.jobtechdev.se/search?q=junior+developer&limit=100");
});

test("jobtech links: other boards' ads keep their source link and label", () => {
  const jobs = mapJobLinks(fx("jobtech-links.json"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.company, "Cisco");
  assert.equal(j.location, "Stockholm, Sweden");
  assert.equal(j.url, "https://www.studentjob.se/lediga-jobb/8892758-junior-software-developer-sweden");
  assert.ok(j.description.includes("Posted on studentjob.se"));
  assert.equal(jobs[1].location, "Sweden", "no address -> country only");
  assert.equal(jobLinksUrl("praktik"), "https://links.api.jobtechdev.se/joblinks?q=praktik&limit=100");
});

test("simplify: open rows only, U.S.-citizens-only dropped, places made recognisable", () => {
  const jobs = mapSimplify(fx("simplify.json"), "intern");
  assert.equal(jobs.length, 3, "closed and citizenship-required rows are dropped");
  assert.ok(jobs.every((j) => j.source === "simplify" && j.type === "stage"));
  assert.equal(jobs[0].location, "New York, NY, United States");
  assert.ok(jobs[0].description.includes("Visa sponsorship: Offers Sponsorship"));
  assert.equal(jobs[0].posted_at, "2026-03-11");
  assert.match(jobs[2].location, /^London, UK · San Francisco, CA, United States · New York, NY, United States · \+1$/);
  assert.ok(!jobs.some((j) => j.company === "Hermeus"));
  assert.equal(simplifyPlace("Toronto, ON"), "Toronto, ON, Canada");
  assert.equal(countryOf(simplifyPlace("Mountain View, CA")), "US");
  assert.equal(simplifyPlace("Munich, Germany"), "Munich, Germany");
  assert.equal(mapSimplify(fx("simplify.json"), "newgrad")[0].type, "stage", "an Internship title stays an internship");
});

test("nav: ads from the flight data split across chunks, posting text from the page", () => {
  const html = raw("nav-search.html");
  assert.ok(flightText(html).includes('"searchResult"'));
  const jobs = parseNavSearch(html);
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Seniorrådgiver - utvikler");
  assert.equal(j.company, "Finansdepartementet");
  assert.equal(j.location, "Oslo, Norway");
  assert.equal(j.url, "https://arbeidsplassen.nav.no/stillinger/stilling/7f92724b-c4d8-4b92-9701-3103fcbee0d6");
  assert.equal(j.posted_at, "2026-10-12");
  assert.equal(j.deadline, "2026-11-02");
  assert.ok(j.description.startsWith("Occupation: Utvikler"));
  assert.ok(jobs.every((x) => x.source === "nav"));
  assert.deepEqual(parseNavSearch("<html>no data</html>"), []);
  const d = parseNavDetail(raw("nav-detail.html"))!;
  assert.ok(d.startsWith("Vi styrker arbeidet"), d.slice(0, 40));
  assert.ok(!d.includes("Om arbeidsgiveren") && !d.includes("<"));
  assert.equal(navSearchUrl("utvikler"), "https://arbeidsplassen.nav.no/stillinger?q=utvikler");
  assert.equal(navPostingUrl("abc"), "https://arbeidsplassen.nav.no/stillinger/stilling/abc");
});

test("france travail: contract terms, department-free place, partner URL or France Travail page", () => {
  const jobs = mapFranceTravail(fx("francetravail.json"));
  assert.equal(jobs.length, 3);
  const [a, b, c] = jobs;
  assert.equal(a.location, "Lyon 3e Arrondissement, France");
  assert.equal(a.company, "ACME LOGICIELS");
  assert.equal(a.type, "stage");
  assert.equal(a.posted_at, "2026-10-20");
  assert.ok(a.description.startsWith("Contract: Contrat à durée déterminée - 6 Mois · Contrat travail\nExperience: Débutant accepté\nSalary:"));
  assert.equal(b.type, "alternance", "apprenticeship contract");
  assert.equal(b.url, "https://www.partenaire.example/offre/123");
  assert.equal(c.url, "https://candidat.francetravail.fr/offres/recherche/detail/201XAAA");
  assert.equal(c.company, "France Travail");
  assert.equal(c.location, "France");
  assert.equal(ftSearchUrl("stage java"), "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?motsCles=stage+java&range=0-149");
});

test("itjobs: types and contracts in the description, entities decoded, posting URL", () => {
  const jobs = mapItjobs(fx("itjobs.json"));
  assert.equal(jobs.length, 2);
  const j = jobs[0];
  assert.equal(j.title, "Estágio Profissional – Frontend Developer");
  assert.equal(j.location, "Lisboa, Porto, Portugal");
  assert.equal(j.url, "https://www.itjobs.pt/oferta/512345/estagio-profissional-frontend-developer");
  assert.ok(j.description.includes("Salary: 900 €") && !j.description.includes("<"));
  assert.equal(j.posted_at, "2026-10-22");
  assert.equal(jobs[1].location, "Portugal");
  assert.equal(jobs[1].remote, true);
  assert.equal(itjobsUrl("K", "estágio"), "https://api.itjobs.pt/job/search.json?api_key=K&q=est%C3%A1gio&limit=100");
});

test("infojobs: prácticas read as internships, city and province, remote-only flag", () => {
  const jobs = mapInfojobs(fx("infojobs.json"));
  assert.equal(jobs.length, 2);
  const [a, b] = jobs;
  assert.equal(a.type, "stage");
  assert.equal(a.location, "Madrid, Spain");
  assert.equal(a.company, "Iberia Software SL");
  assert.ok(a.description.startsWith("Contract: Otros contratos\nHours: Jornada completa"));
  assert.equal(a.remote, false);
  assert.equal(b.location, "Sant Cugat del Vallès, Barcelona, Spain");
  assert.equal(b.remote, true);
  assert.equal(b.type, "emploi");
  assert.equal(infojobsUrl("prácticas"), "https://api.infojobs.net/api/9/offer?q=pr%C3%A1cticas&maxResults=50");
});
