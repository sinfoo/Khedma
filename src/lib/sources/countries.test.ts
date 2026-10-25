import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { countryOf } from "../geo";
import { planSearch } from "../search/plan";
import { CATALOG, COUNTRY_FEEDS, EURES_COUNTRIES, type CatalogEntry } from "./catalog";
import { parseRss } from "./rss";

const fx = (name: string) => readFileSync(path.join(process.cwd(), "src/lib/sources/fixtures", name), "utf8");

test("geo: Nordic, Central European and Turkish places resolve to their country", () => {
  const cases: [string, string][] = [
    ["Oslo", "NO"], ["Kgs. Lyngby", "DK"], ["København S", "DK"], ["Espoo, Finland", "FI"], ["Reykjavík", "IS"],
    ["Wien", "AT"], ["Österreich", "AT"], ["Praha 5", "CZ"], ["Brno, Czech Republic", "CZ"], ["Kraków", "PL"], ["Wrocław", "PL"],
    ["İstanbul", "TR"], ["Ankara, Türkiye", "TR"], ["Göteborg", "SE"], ["Lisboa", "PT"],
  ];
  for (const [place, code] of cases) assert.equal(countryOf(place), code, place);
  assert.notEqual(countryOf("Long Island"), "IS", "no bare 'island' alias for Iceland");
});

test("eures: the new EU/EEA countries are searchable", () => {
  for (const c of ["NO", "DK", "FI", "IS", "AT", "CZ", "PL"]) assert.ok(EURES_COUNTRIES.has(c), c);
  const p = planSearch({ keywords: ["software"], countries: ["AT", "PL"], remote: "no" });
  assert.equal(p.runs.find((r) => r.kind === "eures")!.handle, "at,pl");
});

test("rss: 'Role // Company' titles give the employer, not a location", () => {
  const jobs = parseRss(fx("berlinstartupjobs.rss"), "https://berlinstartupjobs.com/?s=intern&feed=rss2");
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].company, "Over99");
  assert.ok(jobs[0].title.endsWith("Executive Assistant Intern — Winter 2026"), jobs[0].title);
  assert.equal(jobs[0].location, "");
  assert.equal(jobs[0].type, "stage");
});

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({ kind: "jobroom", name: "X", country: "NL", method: "html", site: "https://x", handle: { type: "none" }, keywords: true, ...over });

test("plan: a multi-country board runs once with the chosen countries it covers", () => {
  const catalog = [entry({ kind: "jobroom", name: "Expat", handle: { type: "slug", placeholder: "nl,de" }, countries: ["NL", "DE", "CH"] })];
  const p = planSearch({ keywords: ["x"], countries: ["DE", "FR", "CH"], remote: "no", catalog });
  const r = p.runs.filter((x) => x.kind === "jobroom");
  assert.deepEqual(r.map((x) => [x.handle, x.country]), [["de,ch", "DE"]]);
  assert.equal(planSearch({ keywords: ["x"], countries: ["FR"], remote: "no", catalog }).runs.filter((x) => x.kind === "jobroom").length, 0);
});

test("plan: keyed country boards run only once their key is set", () => {
  const catalog = [entry({ kind: "reed", country: "GB", needsEnv: ["REED_KEY"] })];
  const run = (missingEnv?: string[]) => planSearch({ keywords: ["x"], countries: ["GB"], remote: "no", catalog, missingEnv }).runs.some((r) => r.kind === "reed");
  assert.equal(run(), false, "unknown key state: never run");
  assert.equal(run(["reed"]), false);
  assert.equal(run([]), true);
});

test("plan: a saved country feed runs only for its country", () => {
  const feed = COUNTRY_FEEDS.find((f) => f.country === "DK")!;
  const saved = [{ id: 9, kind: "rss", label: feed.label, handle: feed.handle }, { id: 10, kind: "rss", label: "Blog", handle: "https://acme.example/jobs.rss" }];
  const dk = planSearch({ keywords: ["x"], countries: ["DK"], remote: "no", enabledSources: saved });
  assert.ok(dk.runs.some((r) => r.handle === feed.handle));
  const tn = planSearch({ keywords: ["x"], countries: ["TN"], remote: "no", enabledSources: saved });
  assert.ok(!tn.runs.some((r) => r.handle === feed.handle));
  assert.deepEqual(tn.skipped, [{ label: feed.label, reason: "country" }]);
  assert.ok(tn.runs.some((r) => r.handle === "https://acme.example/jobs.rss"), "other feeds still always run");
});

test("catalog: every new country has at least one readable board", () => {
  for (const c of ["SE", "NO", "PL", "AT", "CZ", "PT", "ES", "NL"]) {
    assert.ok(CATALOG.some((e) => !e.linkOnly && (e.country === c || e.countries?.includes(c as CatalogEntry["country"]))), c);
  }
});
