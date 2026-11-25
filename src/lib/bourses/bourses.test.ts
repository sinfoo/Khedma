import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Profile } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { canonicalUrl, classifyItem, extractCountries, extractDeadline, extractFields, extractFunding, extractLevels, extractTunisia, matchProgram, parseFeed, toCalls } from "./calls";
import { docsFor } from "./checklist";
import { EMPTY_CRITERIA, cleanCriteria, criteriaFromQuery, criteriaToQuery, destinationCodes, inferCriteria, type Criteria } from "./criteria";
import { daysBetween, deadlineInfo } from "./deadline";
import { eligibility, eligibleVia, inGroup } from "./eligibility";
import type { Feed } from "./feeds";
import { fromProgram } from "./model";
import { evaluate, facets, rank, sortRanked } from "./rank";
import type { Program } from "./types";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-bourses-")), "test.db");

const TODAY = "2026-11-25";

const program = (over: Partial<Program> & Pick<Program, "id">): Program => ({
  name: over.id,
  provider: "Test provider",
  providerType: "government",
  hostCountries: ["DE"],
  levels: ["master"],
  fields: ["*"],
  funding: "full",
  covers: { tuition: true, stipend: true, travel: true, insurance: true, housing: false },
  applicationFee: 0,
  eligibleNationalities: ["*"],
  tunisiaEligible: true,
  languages: ["en"],
  url: `https://example.org/${over.id}`,
  summary: { en: "A test scholarship.", fr: "Une bourse de test." },
  verified: "2026-11-01",
  ...over,
});

const PROGRAMS: Program[] = [
  program({ id: "daad-epos", name: "DAAD EPOS", fields: ["engineering", "computer-science"], opens: "08", deadline: "12-15", monthlyStipend: { amount: 992, currency: "EUR" } }),
  program({ id: "eiffel", name: "Eiffel Excellence", hostCountries: ["FR"], levels: ["master", "doctorat"], languages: ["fr", "en"], opens: "10", deadline: "01-08", monthlyStipend: { amount: 1200, currency: "EUR" } }),
  program({ id: "partial-any", name: "Partial Any Field", funding: "partial", deadline: "rolling" }),
  program({ id: "law-only", name: "Law Only", fields: ["law"], deadline: "03" }),
  program({ id: "pricey", name: "Pricey Fee", applicationFee: 80, deadline: "04-30" }),
  program({ id: "eu-only", name: "EU Citizens Only", eligibleNationalities: ["FR", "DE"], tunisiaEligible: false }),
  program({ id: "africa-phd", name: "Africa PhD", levels: ["doctorat"], eligibleNationalities: ["africa"], hostCountries: ["*"], ageLimit: 30, deadline: "06-30" }),
  program({ id: "german-taught", name: "German Taught", languages: ["de"], deadline: "07-15" }),
];
const ITEMS = PROGRAMS.map(fromProgram);
const criteria = (over: Partial<Criteria> = {}): Criteria => ({ ...EMPTY_CRITERIA, ...over });

const profile = (over: Partial<Profile>): Profile => ({
  id: 1,
  name: "Test",
  email: "",
  headline: "",
  cv_md: "",
  skills: [],
  target_roles: [],
  target_locations: [],
  target_types: ["stage", "pfe"],
  languages: ["fr", "en"],
  settings: DEFAULT_SETTINGS,
  ...over,
});

// ---------- criteria ----------

test("a final-year engineering student gets master then doctorat, and the field of the profile", () => {
  const { stage, criteria: c } = inferCriteria(
    profile({
      headline: "Élève ingénieur en informatique à l'ENIT, 3e année, cherche un PFE",
      skills: ["Python", "React", "SQL", "Machine Learning"],
      target_roles: ["Développeur backend"],
      cv_md: "## Formation\n- ENIT, cycle ingénieur en génie informatique, 2024 - 2027",
    }),
    TODAY,
  );
  assert.equal(stage, "final-year");
  assert.deepEqual(c.levels, ["master", "doctorat"]);
  assert.equal(c.fields[0], "computer-science");
  assert.deepEqual(c.languages, ["fr", "en"]);
  assert.equal(c.nationality, "TN");
  assert.equal(c.maxFee, null, "budget is never guessed");
});

test("the study period decides the stage when the headline does not: early years, last year, graduate", () => {
  const cv = (range: string) => profile({ headline: "Engineering student", cv_md: `Education: National engineering school, ${range}` });
  assert.equal(inferCriteria(cv("2026 - 2029"), TODAY).stage, "student");
  assert.deepEqual(inferCriteria(cv("2026 - 2029"), TODAY).criteria.levels, ["master", "court"]);
  assert.equal(inferCriteria(cv("2024 - 2027"), TODAY).stage, "final-year", "November 2026: the year that ends in 2027 has started");
  assert.equal(inferCriteria(cv("2024 - 2027"), "2026-03-10").stage, "student", "March 2026: still one more year to go");
  assert.equal(inferCriteria(cv("2023 - 2026"), TODAY).stage, "graduate", "the diploma is in hand since the summer");
  assert.deepEqual(inferCriteria(cv("2023 - 2026"), TODAY).criteria.levels, ["doctorat", "master"]);
});

test("PhD holders get postdoc, PhD students get research stays, and an empty profile gets no guess", () => {
  assert.deepEqual(inferCriteria(profile({ cv_md: "PhD in Computer Science, University of Tunis El Manar, 2021 - 2025" }), TODAY).criteria.levels, ["postdoc", "recherche"]);
  assert.deepEqual(inferCriteria(profile({ headline: "Doctorante en génie électrique" }), TODAY).criteria.levels, ["recherche", "postdoc"]);
  assert.equal(inferCriteria(profile({ headline: "Étudiant en licence de gestion, L2" }), TODAY).stage, "licence");
  const blank = inferCriteria(profile({}), TODAY);
  assert.equal(blank.stage, null);
  assert.deepEqual(blank.criteria.levels, []);
  assert.deepEqual(blank.criteria.fields, []);
});

test("criteria survive the URL round trip, junk is dropped, and an empty search still has a URL", () => {
  const c = criteria({ levels: ["master", "doctorat"], fields: ["computer-science"], destinations: ["FR", "europe"], fullOnly: true, maxFee: 0, languages: ["fr"], window: "closing", closingDays: 60, q: "daad epos", age: 24 });
  const query = Object.fromEntries(criteriaToQuery(c));
  assert.deepEqual(criteriaFromQuery(query), c);
  assert.equal(criteriaFromQuery({ tab: "calls" }), null, "no criteria key: the page falls back to the stored ones");
  assert.deepEqual(criteriaFromQuery(Object.fromEntries(criteriaToQuery(EMPTY_CRITERIA))), EMPTY_CRITERIA);
  const dirty = cleanCriteria({ levels: ["master", "wizard"], fields: "law,nope", destinations: ["fr", "europe", "Atlantis"], maxFee: "-5", nationality: "tunisia", age: "abc", window: "never", q: "x".repeat(200) });
  assert.deepEqual(dirty.levels, ["master"]);
  assert.deepEqual(dirty.fields, ["law"]);
  assert.deepEqual(dirty.destinations, ["FR", "europe"]);
  assert.equal(dirty.maxFee, null);
  assert.equal(dirty.nationality, "TN");
  assert.equal(dirty.age, null);
  assert.equal(dirty.window, "any");
  assert.equal(dirty.q.length, 80);
  assert.ok(destinationCodes(["europe", "CA"]).has("DE") && destinationCodes(["europe", "CA"]).has("CA"));
});

// ---------- eligibility ----------

test("nationality groups resolve for Tunisia and for other countries", () => {
  for (const g of ["*", "africa", "mena", "maghreb", "developing", "francophonie", "non-eu"]) assert.ok(inGroup("TN", g), `Tunisia is in ${g}`);
  assert.ok(!inGroup("FR", "africa") && !inGroup("FR", "non-eu") && !inGroup("FR", "developing") && inGroup("FR", "francophonie"));
  assert.ok(inGroup("DZ", "maghreb") && !inGroup("DZ", "francophonie"), "Algeria is in the Maghreb but not in the OIF");
  assert.ok(!inGroup("EG", "maghreb") && inGroup("EG", "mena") && inGroup("EG", "africa"));
  assert.ok(inGroup("US", "non-eu") && !inGroup("US", "developing"));
  assert.ok(inGroup("CH", "francophonie") && !inGroup("CH", "non-eu"), "Switzerland counts with the EU area");
  assert.ok(!inGroup("TN", "atlantis"));
  assert.equal(eligibleVia(["FR", "maghreb"], "tn"), "maghreb");
  assert.equal(eligibleVia(["TN", "africa"], "TN"), "TN", "the country itself is named before a group");
  assert.equal(eligibleVia(["FR", "DE"], "TN"), null);
});

test("for Tunisia the hand-checked flag wins; calls that say nothing stay unknown", () => {
  assert.deepEqual(eligibility({ eligibleNationalities: ["*"], tunisiaEligible: false }, "TN"), { eligible: false, via: null });
  assert.deepEqual(eligibility({ eligibleNationalities: ["FR"], tunisiaEligible: true }, "TN"), { eligible: true, via: "verified" });
  assert.deepEqual(eligibility({ eligibleNationalities: ["africa"], tunisiaEligible: true }, "TN"), { eligible: true, via: "africa" });
  assert.deepEqual(eligibility({ eligibleNationalities: ["africa"], tunisiaEligible: true }, "FR"), { eligible: false, via: null });
  assert.deepEqual(eligibility({ eligibleNationalities: ["*"], tunisiaEligible: false }, "MA"), { eligible: true, via: "*" });
  assert.deepEqual(eligibility({ eligibleNationalities: null, tunisiaEligible: null }, "TN"), { eligible: null, via: null });
});

// ---------- deadlines ----------

test("a yearly deadline is open, closing, opening soon or closed until the next cycle", () => {
  const epos = { opens: "08", deadline: "12-15" };
  assert.deepEqual(deadlineInfo(epos, TODAY), { status: "closing", date: "2026-12-15", daysLeft: 20, opensOn: "2026-08-01", opensInDays: null, approximate: false, assumed: false });
  assert.equal(deadlineInfo(epos, "2026-09-01").status, "open");
  assert.equal(deadlineInfo(epos, "2026-12-15").daysLeft, 0, "the deadline day itself is still open");
  const after = deadlineInfo(epos, "2026-12-16");
  assert.equal(after.status, "closed");
  assert.equal(after.date, "2027-12-15");
  assert.equal(after.opensOn, "2027-08-01");
  assert.equal(after.opensInDays, 228);
  const soon = deadlineInfo(epos, "2027-07-01");
  assert.equal(soon.status, "soon");
  assert.equal(soon.opensInDays, 31);
});

test("year wrap: a call that opens in autumn and closes in January", () => {
  const eiffel = { opens: "10", deadline: "01-08" };
  const nov = deadlineInfo(eiffel, TODAY);
  assert.equal(nov.status, "open");
  assert.equal(nov.date, "2027-01-08");
  assert.equal(nov.opensOn, "2026-10-01");
  assert.equal(nov.daysLeft, 44);
  assert.equal(deadlineInfo(eiffel, "2027-01-02").status, "closing");
  const feb = deadlineInfo(eiffel, "2027-02-01");
  assert.equal(feb.status, "closed");
  assert.equal(feb.date, "2028-01-08");
  assert.equal(feb.opensOn, "2027-10-01");
  assert.equal(deadlineInfo(eiffel, "2026-12-31", 7).status, "open", "8 days left with a 7-day window");
  assert.equal(deadlineInfo(eiffel, "2026-12-31", 10).status, "closing");
});

test("rolling, month-only, leap days, live calls and missing data", () => {
  assert.equal(deadlineInfo({ deadline: "rolling" }, TODAY).status, "rolling");
  const march = deadlineInfo({ deadline: "03" }, TODAY);
  assert.equal(march.date, "2027-03-31", "month only: the last day of the month");
  assert.ok(march.approximate && march.assumed);
  assert.equal(march.status, "closed", "126 days ahead with no opening month: not open yet");
  assert.equal(deadlineInfo({ deadline: "03" }, "2027-01-15").status, "open");
  assert.equal(deadlineInfo({ deadline: "02" }, "2028-01-01").date, "2028-02-29");
  assert.equal(deadlineInfo({ deadline: "02-29" }, "2027-01-01").date, "2027-02-28", "a leap day in a common year");
  assert.deepEqual([deadlineInfo({ deadline: "2026-12-01" }, TODAY).status, deadlineInfo({ deadline: "2026-12-01" }, TODAY).daysLeft], ["closing", 6]);
  const past = deadlineInfo({ deadline: "2026-11-24" }, TODAY);
  assert.deepEqual([past.status, past.daysLeft], ["closed", null]);
  assert.equal(deadlineInfo({}, TODAY).status, "unknown");
  assert.equal(deadlineInfo({ deadline: "13-40" }, TODAY).status, "unknown");
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2027-03-27", "2027-03-29"), 2, "the day summer time starts is not shorter");
});

// ---------- ranking ----------

test("hard filters: nationality, level and fee always; unknown facts never hide a result", () => {
  const c = criteria({ levels: ["master"], fields: ["computer-science"], maxFee: 20, languages: ["fr", "en"] });
  const ids = rank(ITEMS, c, TODAY).map((r) => r.item.id);
  assert.ok(!ids.includes("eu-only"), "not eligible");
  assert.ok(!ids.includes("africa-phd"), "wrong level");
  assert.ok(!ids.includes("pricey"), "fee above the maximum");
  assert.ok(!ids.includes("law-only"), "another field");
  assert.ok(!ids.includes("german-taught"), "a language the student cannot study in");
  assert.deepEqual(ids, ["daad-epos", "eiffel", "partial-any"]);
  assert.deepEqual(evaluate(ITEMS.find((i) => i.id === "eu-only")!, c, TODAY).blockers, ["nationality"]);
  assert.ok(evaluate(ITEMS.find((i) => i.id === "africa-phd")!, criteria({ age: 31 }), TODAY).blockers.includes("age"));
  const call = { ...fromProgram(program({ id: "call-1" })), kind: "call" as const, levels: [], fields: [], languages: [], funding: null, applicationFee: null, eligibleNationalities: null, tunisiaEligible: null, deadline: "2026-12-20" };
  assert.deepEqual(evaluate(call, criteria({ ...c, fullOnly: true }), TODAY).blockers, []);
  assert.ok(evaluate(call, c, TODAY).score < evaluate(ITEMS[0], c, TODAY).score);
});

test("ranking order is explained: own field over any field, full over partial, first level first", () => {
  const c = criteria({ levels: ["master", "doctorat"], fields: ["computer-science"], languages: ["fr", "en"] });
  const ranked = rank(ITEMS, c, TODAY);
  assert.deepEqual(ranked.map((r) => r.item.id), ["daad-epos", "eiffel", "partial-any", "africa-phd", "pricey"]);
  const top = ranked[0];
  assert.ok(top.score > ranked[1].score && top.score <= 100);
  assert.deepEqual(top.reasons.map((r) => r.key), ["field", "level", "fullyFunded", "free", "language", "closing"]);
  assert.deepEqual(top.reasons[0].vars, { field: "computer-science" });
  const eiffel = ranked.find((r) => r.item.id === "eiffel")!;
  assert.ok(eiffel.reasons.some((r) => r.key === "fieldAny") && eiffel.reasons.some((r) => r.key === "language" && r.vars?.lang === "fr"));
  const partial = ranked.find((r) => r.item.id === "partial-any")!;
  assert.ok(partial.score < eiffel.score, "partial funding scores below full funding");
  assert.ok(ranked[4].score < partial.score, "an 80 EUR fee and a closed cycle cost more than partial funding");
  assert.deepEqual(rank(ITEMS, c, TODAY).map((r) => r.item.id), ranked.map((r) => r.item.id), "same input, same order");
  for (const r of ranked) assert.ok(r.score >= 0 && r.score <= 100);
});

test("filters the student sets: destination, funding, deadline window, keywords; and the sorts", () => {
  assert.deepEqual(rank(ITEMS, criteria({ destinations: ["FR"] }), TODAY).map((r) => r.item.id).sort(), ["africa-phd", "eiffel"], "the holder picks the country: fits any destination");
  assert.ok(rank(ITEMS, criteria({ destinations: ["europe"] }), TODAY).length >= 6);
  assert.ok(rank(ITEMS, criteria({ fullOnly: true }), TODAY).every((r) => r.item.funding === "full"));
  assert.deepEqual(rank(ITEMS, criteria({ funding: ["partial"] }), TODAY).map((r) => r.item.id), ["partial-any"]);
  assert.deepEqual(rank(ITEMS, criteria({ window: "closing" }), TODAY).map((r) => r.item.id), ["daad-epos"]);
  assert.deepEqual(rank(ITEMS, criteria({ window: "open" }), TODAY).map((r) => r.item.id).sort(), ["daad-epos", "eiffel", "partial-any"]);
  assert.deepEqual(rank(ITEMS, criteria({ q: "Eiffel excellence" }), TODAY).map((r) => r.item.id), ["eiffel"]);
  const all = rank(ITEMS, criteria(), TODAY);
  assert.deepEqual(sortRanked(all, "deadline").slice(0, 2).map((r) => r.item.id), ["daad-epos", "eiffel"]);
  assert.deepEqual(sortRanked(all, "amount").slice(0, 2).map((r) => r.item.id), ["eiffel", "daad-epos"]);
});

test("facet counts say what each option would give with the other filters kept", () => {
  const f = facets(ITEMS, criteria({ levels: ["doctorat"] }), TODAY);
  assert.equal(f.levels.doctorat, 2);
  assert.equal(f.levels.master, 6, "every eligible master programme, whatever level is ticked");
  assert.equal(f.fields.law, 2, "the two doctorat programmes are open to every field");
  assert.equal(f.countries.FR, 1);
  assert.equal(f.countries["*"], 1);
});

// ---------- live calls ----------

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Opportunities</title>
<item><title>DAAD EPOS Scholarships 2027 in Germany for Development-Related Postgraduate Courses (Fully Funded)</title>
<link>https://www.example.org/daad-epos-2027/?utm_source=rss&#038;utm_medium=rss</link>
<pubDate>Mon, 23 Nov 2026 08:00:00 +0000</pubDate><category><![CDATA[Scholarships]]></category><category><![CDATA[Masters]]></category>
<description><![CDATA[<p>Applications are open for Master and PhD courses in engineering. Deadline: 15 December 2026.</p><p>The post DAAD EPOS first appeared on Opportunities.</p>]]></description></item>
<item><title>DAAD EPOS Scholarships 2027 in Germany (duplicate link)</title><link>https://example.org/daad-epos-2027#apply</link><category>Scholarships</category><description>Same call.</description></item>
<item><title>Recrutement Dakar : Technicien informatique (Session 2026)</title><link>https://www.example.org/job-1/</link><category>Bourses</category><description>CDI.</description></item>
<item><title>Top 20+ Scholarships in Sweden for International Students</title><link>https://www.example.org/top-20/</link><description>A list.</description></item>
<item><title>Séminaire en ligne : « Comment poser sa candidature pour une bourse à travers le portail du DAAD »</title><link>https://www.example.org/webinar/</link><description>Inscription.</description></item>
<item><title>Prix de thèse de la CNDP</title><link>https://www.example.org/prix/</link><description>Concours.</description></item>
<item><title>Bourses d'excellence Eiffel 2027 : master et doctorat en France</title><link>https://www.example.org/eiffel/</link>
<pubDate>Tue, 24 Nov 2026 23:30:00 +0100</pubDate><description>Bourse complète. Date limite : 8 janvier.</description></item>
<item><title>Appel à candidature : cours d'été universitaires en Allemagne pour les étudiants 2027</title><link>https://www.example.org/cours-ete/</link><description>Le DAAD offre des bourses pour des cours de langue. Candidatures jusqu'au 01/12/2026.</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Research funding</title>
<entry><title>Geoffrey H. Hartman Postdoctoral Fellowship</title><link rel="alternate" href="https://funding.example.net/hartman"/><updated>2026-11-20T10:00:00Z</updated>
<category term="Humanities"/><category term="United States"/><summary type="html">&lt;p&gt;Fellowship in literature at Yale. Apply by November 30th, 2026.&lt;/p&gt;</summary></entry>
<entry><title>Postdoctoral Research Associate in Political Science</title><link href="https://funding.example.net/associate"/><updated>2026-11-21T10:00:00Z</updated><summary>A job.</summary></entry>
</feed>`;

const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  items: [
    { title: "Mobility grants for PhD students in mathematics", url: "https://api.example.com/calls/12", content_text: "Travel grant for a research stay at the University of Geneva.", tags: ["Switzerland"], date_published: "2026-11-01T09:00:00+01:00", deadline: "2027-01-31" },
    { title: "Annual conference on applied statistics", url: "https://api.example.com/calls/13", content_text: "Call for papers." },
    { title: "No link", content_text: "Scholarship without a URL." },
  ],
});

const FEED: Feed = { id: "test-feed", label: "Test feed", url: "https://www.example.org/feed/", format: "rss", lang: "en", scope: "test", checked: "2026-11-25" };

test("RSS, Atom and JSON feeds parse into the same items", () => {
  const rss = parseFeed(RSS, "rss");
  assert.equal(rss.length, 8);
  assert.equal(rss[0].url, "https://www.example.org/daad-epos-2027/?utm_source=rss&utm_medium=rss");
  assert.deepEqual(rss[0].categories, ["Scholarships", "Masters"]);
  assert.equal(rss[0].published, "2026-11-23");
  assert.equal(rss[6].published, "2026-11-24", "the calendar day the feed wrote, not its UTC day");
  const atom = parseFeed(ATOM, "atom");
  assert.equal(atom.length, 2);
  assert.equal(atom[0].url, "https://funding.example.net/hartman");
  assert.deepEqual(atom[0].categories, ["Humanities", "United States"]);
  assert.match(atom[0].text, /Fellowship in literature at Yale/);
  const json = parseFeed(JSON_FEED, "json");
  assert.equal(json.length, 2, "an item without a link is skipped");
  assert.equal(json[0].deadline, "2027-01-31");
  assert.throws(() => parseFeed("<html>blocked</html>", "json"));
  assert.deepEqual(parseFeed("<html>blocked</html>", "rss"), []);
});

test("only real scholarships are kept: jobs, events, prizes and lists are dropped", () => {
  const kind = (title: string, text = "", categories: string[] = []) => classifyItem({ title, text, categories });
  assert.equal(kind("Chevening Scholarships 2027/2028 for International Students"), "scholarship");
  assert.equal(kind("Bourses du gouvernement français pour les étudiants tunisiens"), "scholarship");
  assert.equal(kind("Funza Lushaka Bursary Scheme 2027"), "scholarship");
  assert.equal(kind("Schwarzman Scholars Program 2027 in China"), "scholarship");
  assert.equal(kind("Junior Research Prize Fellowship in Mathematics"), "scholarship", "a scholarship word beats a prize word");
  assert.equal(kind("Travel grants to attend the ICTP workshop on climate"), "scholarship", "the grant comes first: it funds the stay");
  assert.equal(kind("Fully funded PhD position in robotics"), "scholarship");
  assert.equal(kind("New Zealand Government Scholarships 2027"), "scholarship");
  assert.equal(kind("Postdoctoral Research Associate in Political Science"), "job");
  assert.equal(kind("Recrutement GPF : Plusieurs Commerciaux Terrain"), "job");
  assert.equal(kind("Webinar: applying for a DAAD scholarship"), "event");
  assert.equal(kind("Session d'information en ligne avec des universités allemandes"), "event");
  assert.equal(kind("Global Student Innovation Challenge 2027"), "competition");
  assert.equal(kind("Prix de thèse de la CNDP"), "competition");
  assert.equal(kind("Top 20+ Scholarships in Sweden for International Students"), "news");
  assert.equal(kind("10+ New Scholarships for International Students"), "news");
  assert.equal(kind("New Scholarships at Oxford, NTU, Stockholm and Geneva"), "news");
  assert.equal(kind("Eiffel scholarship winners announced"), "news");
  assert.equal(kind("Fermeture annuelle"), "news");
  assert.equal(kind("Mastercard Foundation at the University of Cambridge 2027", "", ["Scholarships"]), "scholarship", "the feed's own category");
  assert.equal(kind("Appel à candidature : cours d'été en Allemagne 2027", "Le DAAD offre des bourses pour des cours de langue."), "scholarship");
  assert.equal(kind("Appel à candidature : module de formation", "Inscription avant vendredi."), "other");
  assert.equal(kind("Announcing the 2027 Fulbright Foreign Student Program Application", "Application Deadline: June 30, 2027. The Fulbright grant covers tuition."), "scholarship");
  assert.equal(kind("The College of Europe: applications for 2027-2028 are open!", "Scholarships are available for candidates from the Southern Neighbourhood."), "scholarship");
  assert.equal(kind("MSCA Doctoral Networks 2027 call"), "scholarship");
  assert.equal(kind("Call for tenders: evaluation of a youth programme"), "job");
  assert.equal(kind("Scholarships in Sweden", "", ["List of", "Sweden"]), "news", "the feed's own tag for lists");
  assert.equal(kind("5 Fully Funded Leadership Programs in the USA 2027"), "news", "a title that starts with a count is a list");
  assert.equal(kind("CAS ANSO Scholarship 2027 in China | Up to 500 Fully Funded Scholarships"), "scholarship", "a count later in the title is the number of awards");
  assert.equal(kind("MSCA Doctoral Networks 2026 receives 1939 proposals"), "news");
  assert.equal(kind("VBC Summer School 2027 in Austria (Fully Funded)"), "scholarship");
  assert.equal(kind("Leadership and Peace Summit Morocco 2027 (Fully Funded)"), "event");
  // What we know about a feed: INSPIRE lists funded research positions, DAAD Tunisie publishes its own calls.
  assert.equal(kind("PhD position in theoretical physics"), "job");
  assert.equal(classifyItem({ title: "PhD position in theoretical physics", text: "", categories: ["PHD"] }, "inspire-phd"), "scholarship");
  assert.equal(classifyItem({ title: "Appel à candidature : cours d'été universitaires en Allemagne 2027", text: "", categories: [] }, "daad-tunisie"), "scholarship");
  assert.equal(classifyItem({ title: "Séminaire en ligne : étudier en Allemagne", text: "", categories: [] }, "daad-tunisie"), "event");
});

test("level, field, host country, funding and deadline come from simple, stated words", () => {
  const item = (title: string, text = "", categories: string[] = []) => ({ title, text, categories, published: "2026-11-20" });
  assert.deepEqual(extractLevels(item("Scholarships for Master and PhD students")), ["master", "doctorat"]);
  assert.deepEqual(extractLevels(item("Post-doctoral fellowship in physics")), ["postdoc"]);
  assert.deepEqual(extractLevels(item("Bourses de licence et de mastère", "Ces bourses financent les études.")), ["licence", "master"], "the English word \"these\" is not a thesis");
  assert.deepEqual(extractLevels(item("Summer school grants", "", ["Undergraduate"])), ["court"], "the title comes before the tags");
  assert.deepEqual(extractLevels(item("UCD Iseult Honohan Doctoral Scholarship", "For Master graduates.", ["PhD/Postdoctoral"])), ["doctorat"]);
  assert.deepEqual(extractLevels(item("Government scholarships 2027", "Open to Master and PhD applicants.")), ["master", "doctorat"]);
  assert.deepEqual(extractLevels(item("Government scholarships 2027")), []);
  assert.deepEqual(extractFields(item("University scholarships", "", ["Engineering", "Law", "Medicine", "Economics", "History"])), [], "four fields or more: any field");
  assert.deepEqual(extractFields(item("Scholarships in Computer Science and Artificial Intelligence")), ["computer-science"]);
  assert.deepEqual(extractFields(item("LLM scholarships in International Humanitarian Law and Human Rights")), ["law"]);
  assert.deepEqual(extractFields(item("Chevening Scholarships", "Covers tuition, health insurance and higher education fees.")), [], "the body's boilerplate is not a field");
  assert.deepEqual(extractCountries(item("DAAD Scholarships 2027 in Germany for Tunisian students")), ["DE"]);
  assert.deepEqual(extractCountries(item("Ertegun Graduate Scholarships in the Humanities at University of Oxford")), ["GB"]);
  assert.deepEqual(extractCountries(item("Bourses d'excellence : master en France")), ["FR"]);
  assert.deepEqual(extractCountries(item("Scholarships for Tunisian students")), [], "where applicants come from is not the host");
  assert.deepEqual(extractCountries(item("NPU President Scholarship 2027 in China | Fully Funded Scholarships")), ["CN"]);
  assert.deepEqual(extractCountries(item("Bourses d'études à l'île Maurice 2027 aux Africains")), ["MU"]);
  assert.deepEqual(extractCountries(item("Hartman Fellowship", "", ["Humanities", "United States"])), ["US"]);
  assert.deepEqual(extractCountries(item("Stockholm University Scholarships", "", ["Europe", "Sweden", "scholarships for oman people", "Australia and Oceania"])), ["SE"], "tags about who may apply are not the host");
  assert.deepEqual(extractCountries(item("Stockholm University Scholarships", "Masters Degree\n\nStudy in: Sweden\n\nCourse starts August 2027")), ["SE"]);
  assert.equal(extractFunding(item("X Scholarship (Fully Funded)")), "full");
  assert.equal(extractFunding(item("Bourse", "Bourse partielle couvrant une partie des frais.")), "partial");
  assert.equal(extractFunding(item("Travel grant for young researchers")), "mobility");
  assert.equal(extractFunding(item("Scholarship")), null);
  assert.equal(extractDeadline(item("A", "Deadline: 15 December 2026."), TODAY), "2026-12-15");
  assert.equal(extractDeadline(item("A", "Apply by November 30th, 2026 at noon."), TODAY), "2026-11-30");
  assert.equal(extractDeadline(item("A", "Candidatures jusqu'au 01/12/2026."), TODAY), "2026-12-01");
  assert.equal(extractDeadline(item("A", "Date limite : 8 janvier."), TODAY), "2027-01-08", "no year: the next 8 January after the item");
  assert.equal(extractDeadline(item("A", "The programme starts on 1 September 2027."), TODAY), null, "a date without a deadline word");
  assert.equal(extractDeadline({ ...item("A"), deadline: "2027-01-31T23:59:00Z" }, TODAY), "2027-01-31");
  assert.equal(extractDeadline(item("Swedish Institute Scholarships 2027-28", "", ["Masters", "feb 2027", "Sweden"]), TODAY), "2027-02-28", "a month tag: the last day of that month");
});

test("who may apply, as far as a feed says: Tunisians yes, another nationality only no, silence unknown", () => {
  const who = (title: string, categories: string[] = []) => extractTunisia({ title, categories });
  assert.equal(who("Scholarships for Tunisian students in Germany"), true);
  assert.equal(who("Mastercard Foundation Scholars Program 2027 for young Africans"), true);
  assert.equal(who("ANSO Scholarship for students from developing countries"), true);
  assert.equal(who("Stockholm University Scholarships for International Students"), true);
  assert.equal(who("Funza Lushaka Bursary Programme 2027 for young South Africans"), false);
  assert.equal(who("NNPC National Merit Scholarship for Nigerian students"), false);
  assert.equal(who("Funza Lushaka Bursary Scheme 2027 for Students in South Africa"), false);
  assert.equal(who("Bourses d'Excellence du Gouvernement Suisse 2027-2028 (Sénégal)"), false);
  assert.equal(who("Bourses d'Excellence du Gouvernement Suisse 2027-2028 (Tunisie)"), true);
  assert.equal(who("EPSRC PhD studentship (home fees only)"), false);
  assert.equal(who("ETH Summer Fellowship 2027 in Switzerland"), null);
  assert.equal(who("Scholarships for Chinese language studies in Beijing"), null, "a language is not an audience");
  assert.equal(who("Stockholm University Scholarships", ["Sweden", "scholarships for afghans", "scholarships for albanians", "scholarships for indians", "scholarships for nepalese", "scholarships for peruvians", "scholarships for tunisians"]), true, "a list of audience tags");
  assert.equal(who("Some Scholarship", ["scholarships for afghans", "scholarships for albanians", "scholarships for indians", "scholarships for nepalese", "scholarships for peruvians"]), false);
  assert.equal(who("SI Pioneering Women in STEM Scholarship 2027 in Sweden", ["scholarships for women"]), null, "one such tag is not a nationality list");
  assert.equal(who("Healthy Futures Scholarship 2027", ["Scholarships", "Call for Applications"]), null, "\"for\" in a tag is not an audience");
  assert.equal(who("Ghent University Doctoral Scholarships 2027 for Candidates from the Global South"), true);
  assert.equal(who("The LAWA Fellowship Program 2027 for Women in Africa"), true);
  assert.equal(who("The PPS Foundation's Bursary Programme 2027 for young South African students."), false);
  assert.equal(who("Bourses MINJEC 2026 : 500 places pour jeunes camerounais"), false);
  assert.equal(who("MESRI Sénégal : ouverture des demandes de bourses étrangères 2026-2027"), false);
});

test("a call is linked to a curated programme only when it clearly names it", () => {
  const programs = [{ id: "daad-epos", name: "DAAD EPOS" }, { id: "daad-research", name: "DAAD Research Grants" }, { id: "eiffel", name: "Bourse d'excellence Eiffel" }, { id: "chevening", name: "Chevening Scholarships" }, { id: "mext", name: "MEXT Scholarship" }];
  assert.equal(matchProgram("DAAD EPOS Scholarships 2027 in Germany", programs), "daad-epos");
  assert.equal(matchProgram("Bourses d'excellence Eiffel 2027 : master et doctorat", programs), "eiffel");
  assert.equal(matchProgram("Chevening Scholarships 2027/2028: applications open", programs), "chevening");
  assert.equal(matchProgram("Chevening alumni residency programme 2027", programs), null, "a lone name also needs the same kind of award");
  assert.equal(matchProgram("DAAD scholarships for artists", programs), null, "the provider alone is not a programme");
  assert.equal(matchProgram("MEXT 2027", programs), null, "one short word is not proof");
  assert.equal(matchProgram("Government of Ireland scholarships", programs), null);
  const real = [{ id: "eiffel-master", name: "France Excellence Eiffel (master)", levels: ["master" as const] }, { id: "eiffel-doctorat", name: "France Excellence Eiffel (doctorat)", levels: ["doctorat" as const] }, { id: "daad-doctoral", name: "DAAD Research Grants: Doctoral Programmes in Germany" }, { id: "epos", name: "DAAD EPOS (Development-Related Postgraduate Courses)" }];
  assert.equal(matchProgram("DAAD EPOS Scholarships 2027 in Germany", real), "epos", "the words in parentheses describe, they are not the name");
  assert.equal(matchProgram("DAAD scholarships 2027 in Germany", real), null, "a provider and a country are not a programme");
  assert.equal(matchProgram("Eiffel Excellence Scholarship 2027 for PhD students", real), "eiffel-doctorat", "twins are told apart by the level");
  assert.equal(matchProgram("Eiffel Excellence Scholarship 2027", real), null);
});

test("canonical URLs ignore tracking, www, scheme, fragments and trailing slashes", () => {
  const key = canonicalUrl("https://www.Example.org/daad-epos-2027/?utm_source=rss&utm_medium=rss#apply");
  assert.equal(key, "https://example.org/daad-epos-2027");
  assert.equal(canonicalUrl("http://example.org/daad-epos-2027"), key);
  assert.equal(canonicalUrl("https://example.org/call?id=7&utm_campaign=x&fbclid=abc"), "https://example.org/call?id=7");
  assert.notEqual(canonicalUrl("https://example.org/call?id=7"), canonicalUrl("https://example.org/call?id=8"));
});

test("feed items become calls: classified, extracted, linked and deduped", () => {
  const calls = toCalls(parseFeed(RSS, "rss"), FEED, PROGRAMS, TODAY);
  assert.deepEqual(calls.map((c) => c.urlKey), ["https://example.org/daad-epos-2027", "https://example.org/eiffel", "https://example.org/cours-ete"]);
  const [epos, eiffel, summer] = calls;
  assert.deepEqual([epos.programId, epos.countries, epos.funding, epos.deadline], ["daad-epos", ["DE"], "full", "2026-12-15"]);
  assert.deepEqual(epos.levels, ["master"], "\"postgraduate\" in the title, whatever the body adds");
  assert.deepEqual(epos.tags, ["Masters"], "a tag that repeats the title adds nothing");
  assert.equal(epos.tunisia, null);
  for (const c of calls) {
    assert.ok(!("summary" in c) && !("text" in c), "the article text is never part of a call");
    assert.ok(!JSON.stringify(c).includes("Applications are open for Master"), "nor any sentence of it");
  }
  assert.deepEqual([eiffel.countries, eiffel.funding, eiffel.deadline, eiffel.levels], [["FR"], "full", "2027-01-08", ["master", "doctorat"]]);
  assert.deepEqual([summer.countries, summer.deadline, summer.levels], [["DE"], "2026-12-01", ["court"]]);
  const fromAtom = toCalls(parseFeed(ATOM, "atom"), FEED, PROGRAMS, TODAY);
  assert.deepEqual(fromAtom.map((c) => [c.title, c.levels, c.countries, c.deadline]), [["Geoffrey H. Hartman Postdoctoral Fellowship", ["postdoc"], ["US"], "2026-11-30"]]);
  const fromJson = toCalls(parseFeed(JSON_FEED, "json"), FEED, PROGRAMS, TODAY);
  assert.deepEqual(fromJson.map((c) => [c.levels, c.fields, c.countries, c.funding, c.deadline]), [[["doctorat"], ["mathematics"], ["CH"], "mobility", "2027-01-31"]]);
});

// ---------- storage and scan ----------

test("a re-scan updates instead of duplicating; vanished or expired calls are closed, not deleted", async () => {
  const { allBourses, closeCalls, findBourse, listCalls, scanFeeds, scanState, upsertCalls } = await import("./store");
  const calls = toCalls(parseFeed(RSS, "rss"), FEED, PROGRAMS, TODAY);
  assert.deepEqual(upsertCalls(calls, "2026-11-25T10:00:00.000Z"), { added: 3, updated: 0, unchanged: 0 });
  assert.deepEqual(upsertCalls(calls, "2026-11-26T10:00:00.000Z"), { added: 0, updated: 0, unchanged: 3 });
  const changed = calls.map((c, i) => (i === 0 ? { ...c, deadline: "2026-12-20" } : c));
  assert.deepEqual(upsertCalls(changed.slice(0, 2), "2026-11-27T10:00:00.000Z"), { added: 0, updated: 1, unchanged: 1 });
  let stored = listCalls();
  assert.equal(stored.length, 3);
  const epos = stored.find((c) => c.urlKey.endsWith("daad-epos-2027"))!;
  assert.deepEqual([epos.firstSeen, epos.lastSeen, epos.deadline], ["2026-11-25T10:00:00.000Z", "2026-11-27T10:00:00.000Z", "2026-12-20"]);

  // The summer course left the feed but its deadline (1 December) is still ahead: it stays open until then.
  assert.equal(closeCalls(FEED.id, "2026-11-27T10:00:00.000Z", "2026-11-27"), 0);
  assert.equal(closeCalls(null, "2026-12-02T10:00:00.000Z", "2026-12-02"), 1);
  stored = listCalls();
  assert.equal(stored.length, 3, "closed calls stay in the table");
  assert.deepEqual(stored.filter((c) => c.closedAt).map((c) => c.urlKey), ["https://example.org/cours-ete"]);

  // Seen again after its deadline: still closed, and nothing to report. Seen again with a new deadline: open again.
  const summer = calls.filter((c) => c.urlKey.endsWith("cours-ete"));
  assert.deepEqual(upsertCalls(summer, "2026-12-03T10:00:00.000Z", "2026-12-03"), { added: 0, updated: 0, unchanged: 1 });
  assert.equal(listCalls().filter((c) => c.closedAt).length, 1);
  assert.deepEqual(upsertCalls([{ ...summer[0], deadline: "2026-12-20" }], "2026-12-03T11:00:00.000Z", "2026-12-03"), { added: 0, updated: 1, unchanged: 0 });
  assert.equal(listCalls().filter((c) => c.closedAt).length, 0);
  assert.equal(closeCalls(null, "2026-12-21T10:00:00.000Z", "2026-12-21"), 2, "the summer course and the DAAD call, both due on 20 December");
  upsertCalls(calls.slice(0, 2), "2026-11-27T12:00:00.000Z", "2026-11-27");

  // A feed fetch that fails closes nothing and says why; one that works again reopens what it lists.
  const events: string[] = [];
  const failed = await scanFeeds({ feeds: [FEED], force: true, fetcher: async () => ({ text: "", error: "HTTP 503 for https://www.example.org/feed/" }), onEvent: (e) => events.push(e.type === "feed" ? `${e.type}:${e.state}` : e.type) });
  assert.deepEqual(events, ["plan", "feed:running", "feed:error", "done"]);
  assert.equal(failed?.feeds[FEED.id].error, "HTTP 503 for https://www.example.org/feed/");
  assert.equal(listCalls().filter((c) => c.closedAt).length, 1);
  const wall = await scanFeeds({ feeds: [FEED], force: true, fetcher: async () => ({ text: "<html>Just a moment...</html>" }) });
  assert.match(wall?.feeds[FEED.id].error ?? "", /Not an RSS\/Atom feed/);

  let fetches = 0;
  const fetcher = async () => (fetches++, { text: RSS });
  const ok = await scanFeeds({ feeds: [FEED], fetcher });
  assert.deepEqual([ok?.feeds[FEED.id].state, ok?.feeds[FEED.id].items, ok?.feeds[FEED.id].kept], ["done", 8, 3]);
  assert.equal(scanState().at, ok?.at);
  const again = await scanFeeds({ feeds: [FEED], fetcher });
  assert.equal(again?.feeds[FEED.id].state, "cached");
  assert.equal(fetches, 1, "two scans in a row fetch the feed once");
  await scanFeeds({ feeds: [FEED], fetcher, force: true });
  assert.equal(fetches, 2);

  const { db } = await import("../db");
  const columns = (db().prepare("PRAGMA table_info(bourse_calls)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(!columns.some((c) => /summary|text|body|content|description/.test(c)), "no column can hold a feed item's article text");
  assert.ok(!JSON.stringify(db().prepare("SELECT * FROM bourse_calls").all()).includes("Applications are open for Master"));
  const { calls: bourses } = allBourses(TODAY);
  assert.ok(bourses.every((b) => b.summary.en === "" && b.summary.fr === ""));
  assert.equal(bourses.length, 3);
  assert.ok(bourses.every((b) => b.kind === "call" && /^call-\d+$/.test(b.id)));
  assert.equal(findBourse(bourses[0].id, TODAY)?.name, bourses[0].name);
  assert.equal(findBourse("call-9999", TODAY), null);
  assert.equal(findBourse("no-such-programme", TODAY), null);
});

test("tracking keeps status, notes and ticked documents per item", async () => {
  const { getTracking, listTracking, track, untrack } = await import("./store");
  assert.equal(getTracking("daad-epos"), null);
  assert.equal(track("daad-epos").status, "saved");
  track("daad-epos", { status: "preparing", checklist: { cv: true } });
  track("daad-epos", { notes: "Ask Pr. Ben Salah for a letter" });
  const t = getTracking("daad-epos")!;
  assert.deepEqual([t.status, t.notes, t.checklist], ["preparing", "Ask Pr. Ben Salah for a letter", { cv: true }]);
  track("call-2");
  assert.equal(listTracking().length, 2);
  untrack("call-2");
  assert.deepEqual(listTracking().map((x) => x.item), ["daad-epos"]);
});

test("the document checklist depends on the level", () => {
  assert.ok(docsFor(["master"]).includes("admission") && docsFor(["master"]).includes("rank") && !docsFor(["master"]).includes("proposal"));
  assert.ok(docsFor(["doctorat"]).includes("proposal") && docsFor(["doctorat"]).includes("supervisor") && docsFor(["doctorat"]).includes("thesis"));
  assert.ok(!docsFor(["master"]).includes("medical") && docsFor(["master"], true).includes("medical") && docsFor(["master"], true).includes("legalised"), "state programmes ask for more");
  assert.ok(docsFor(["postdoc"]).includes("publications"));
  assert.ok(docsFor(["licence"]).includes("baccalaureate"));
  assert.deepEqual(docsFor([]), ["passport", "cv", "motivation", "transcripts", "language", "translations"]);
  assert.deepEqual(docsFor(["master", "doctorat"]).slice(0, 3), ["passport", "cv", "motivation"]);
});
