import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getinitTopics, getinitUrl, parseGetinit } from "./getinit";
import { parseStudySmarter, studysmarterUrl } from "./studysmarter";
import { iamexpatUrl, parseIamExpat } from "./iamexpat";
import { karriereDate, karriereUrl, parseKarriere } from "./karriere";

// Trimmed live pages saved on 2026-10-25 (three offers each).
const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");

test("get in IT: __NEXT_DATA__ offers, topics picked from keywords", () => {
  const jobs = parseGetinit(fx("getinit-list.html"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Referent Anwendungsentwicklung (w/m/d) im Referat »Anwendungsentwicklung«");
  assert.equal(j.company, "Statistisches Landesamt Baden-Württemberg");
  assert.equal(j.location, "Fellbach, Germany");
  assert.equal(j.url, "https://www.get-in-it.de/jobsuche/p313502");
  assert.equal(j.source, "getinit");
  assert.ok(j.description.includes("Home office possible"));
  assert.deepEqual(parseGetinit("<html>no data</html>"), []);
  assert.deepEqual(getinitTopics(["stage développeur"]), [36]);
  assert.deepEqual(getinitTopics(["data engineer", "frontend"]), [39, 36, 5]);
  assert.deepEqual(getinitTopics([]), [36]);
  assert.equal(getinitUrl(36), "https://www.get-in-it.de/jobsuche?thematicPriority=36");
});

test("StudySmarter: WP Job Manager cards -> contract, pay, relative date", () => {
  const jobs = parseStudySmarter(JSON.parse(fx("studysmarter-list.json")).html, new Date("2026-10-25T12:00:00Z"));
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "Werkstudent Consumer Finance (m/w/d)");
  assert.equal(j.company, "HomeServe Gruppe Deutschland");
  assert.equal(j.location, "Frankfurt am Main, Germany");
  assert.equal(j.type, "stage");
  assert.equal(j.description, "Contract: Werkstudent\nPay: 15 € / Stunde");
  assert.equal(j.posted_at, "2026-10-24");
  assert.match(j.url, /^https:\/\/talents\.studysmarter\.de\/companies\//);
  assert.equal(jobs[1].type, "stage", "Praktikum");
  assert.equal(studysmarterUrl("informatik"), "https://talents.studysmarter.de/jm-ajax/get_listings/?search_keywords=informatik&per_page=50&page=1");
});

test("IamExpat: cards -> employer from the logo, city + country, posted date", () => {
  const jobs = parseIamExpat(fx("iamexpat-list.html"), "nl");
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "IT Internship - Backend Engineer: Automation, Monitoring & Alerting in SAP RMCA");
  assert.equal(j.company, "Swisscom");
  assert.equal(j.location, "Rotterdam, Netherlands");
  assert.equal(j.posted_at, "2026-09-22");
  assert.equal(j.type, "stage");
  assert.equal(j.description, "Category: IT & technology");
  assert.match(j.url, /^https:\/\/www\.iamexpat\.nl\/career\/jobs-netherlands\/it-technology-positions\//);
  assert.equal(parseIamExpat(fx("iamexpat-list.html"), "ch")[0].location, "Rotterdam, Switzerland", "country follows the site");
  assert.equal(iamexpatUrl("de", "it-technology-positions", 2), "https://www.iamexpat.de/career/jobs-germany/it-technology-positions?page=2");
});

test("karriere.at: cards -> places, pills, summary, absolute and relative dates", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const jobs = parseKarriere(fx("karriere-list.html"), now);
  assert.equal(jobs.length, 3);
  const j = jobs[0];
  assert.equal(j.title, "FH Internship (FH Praktikum) in the Medical Device Software Industry");
  assert.equal(j.company, "Becton Dickinson Austria GmbH");
  assert.equal(j.location, "Wien, Austria");
  assert.equal(j.url, "https://www.karriere.at/jobs/10031004");
  assert.equal(j.posted_at, "2026-10-07");
  assert.equal(j.type, "stage");
  assert.ok(j.description.startsWith("Praktika · Homeoffice · ab 1.900 € monatlich"));
  assert.equal(jobs[1].posted_at, "2026-10-21", "vor 4 Tagen");
  assert.equal(karriereDate("heute", now), "2026-10-25");
  assert.equal(karriereDate("nope", now), null);
  assert.equal(karriereUrl("Praktikum Software", "Wien"), "https://www.karriere.at/jobs/praktikum-software/wien");
  assert.equal(karriereUrl("Développeur"), "https://www.karriere.at/jobs/developpeur");
});
