import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, facetCounts, filtersToQuery, parseFilters, type OfferRow } from "./offers-filter";

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv");
const row = (id: number, x: Partial<OfferRow>): OfferRow => ({ id, title: `T${id}`, company: "C", location: "", remote: false, type: "stage", source: "manual", url: "", tags: [], deadline: null, posted_at: null, created_at: `${day(90)} 10:00:00`, archived: false, starred: false, score: null, verdict: null, engine: null, appId: null, status: null, dup: null, evergreen: [], ...x });
const rows = [
  row(1, { title: "Stage développeur web", location: "Tunis", posted_at: day(0) }),
  row(2, { title: "Senior Sales Manager", location: "Paris, France", type: "emploi", posted_at: day(2) }),
  row(3, { title: "PFE data", location: "Dubai", type: "pfe", posted_at: day(10) }),
  row(4, { title: "Ingénieur réseaux sénior", location: "Sfax", type: "emploi", created_at: `${day(5)} 08:00:00` }),
  row(5, { title: "Backend intern", location: "", remote: true, posted_at: day(40) }),
];
const ids = (q: string) => applyFilters(rows, parseFilters(new URLSearchParams(q))).map((r) => r.id).sort();

test("new filters: parse clamps input and round-trips through the URL", () => {
  const f = parseFilters(new URLSearchParams("posted=7&not=Senior,%20sales%20,senior&region=gulf,mars&country=tn"));
  assert.equal(f.posted, 7);
  assert.deepEqual(f.not, ["senior", "sales"]);
  assert.deepEqual(f.regions, ["gulf"]);
  assert.equal(filtersToQuery(f), "not=senior%2Csales&country=TN&region=gulf&posted=7");
  assert.equal(parseFilters(new URLSearchParams("posted=2")).posted, 0, "only the offered windows");
  assert.deepEqual(parseFilters(new URLSearchParams(filtersToQuery(f))), f);
});

test("posted window: board date first, else the day the offer was first seen", () => {
  assert.deepEqual(ids("posted=1"), [1]);
  assert.deepEqual(ids("posted=3"), [1, 2]);
  assert.deepEqual(ids("posted=7"), [1, 2, 4]);
  assert.deepEqual(ids("posted=30"), [1, 2, 3, 4]);
  assert.deepEqual(applyFilters(rows, parseFilters(new URLSearchParams("sort=newest"))).map((r) => r.id), [1, 2, 4, 3, 5]);
});

test("exclude words: accents folded, any word hides the offer, word: is a whole word", () => {
  assert.deepEqual(ids("not=senior"), [1, 3, 5]);
  assert.deepEqual(ids("not=sales,pfe"), [1, 4, 5]);
  assert.deepEqual(ids("not=word:data"), [1, 2, 4, 5]);
  assert.deepEqual(ids("not=word:dat"), [1, 2, 3, 4, 5]);
});

test("regions: union with country pills, combined with the other filters", () => {
  assert.deepEqual(ids("region=maghreb"), [1, 4]);
  assert.deepEqual(ids("region=gulf&country=FR"), [2, 3]);
  assert.deepEqual(ids("region=maghreb,europe&not=senior&posted=7"), [1]);
});

test("skip verdicts: hidden by default, listed and counted when the verdict is picked by name", () => {
  const skips = [row(1, { verdict: "skip", score: 1.5 }), row(2, { verdict: "apply", score: 4 }), row(3, { verdict: "skip", score: 1, deadline: "2020-01-01" })];
  const run = (q: string) => applyFilters(skips, parseFilters(new URLSearchParams(q))).map((r) => r.id);
  assert.deepEqual(run(""), [2]);
  assert.deepEqual(run("verdict=skip"), [1], "the expired one stays hidden");
  assert.deepEqual(run("verdict=skip&all=1"), [1, 3]);
  assert.equal(facetCounts(skips, parseFilters(new URLSearchParams(""))).verdict.skip, 1, "the pill announces what picking it lists");
});

test("facet counts leave their own group out and respect the others", () => {
  const c = facetCounts(rows, parseFilters(new URLSearchParams("type=pfe")));
  assert.deepEqual(c.type, { stage: 2, emploi: 2, pfe: 1 }, "picking PFE keeps the other type counts");
  assert.deepEqual(c.region, { gulf: 1 }, "other groups count inside the PFE selection");
  assert.deepEqual(c.posted, { "30": 1 });
  const d = facetCounts(rows, parseFilters(new URLSearchParams("region=maghreb&not=senior")));
  assert.deepEqual(d.country, { TN: 1, AE: 1, REMOTE: 1 });
  assert.deepEqual(d.region, { maghreb: 1, gulf: 1 });
  assert.deepEqual(d.type, { stage: 1 });
  assert.equal(d.flag.remote, undefined, "the remote offer is outside the picked region");
});
