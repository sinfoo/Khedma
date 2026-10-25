import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, findDates, findDuplicates, jaccard, normalizeCompany, parseFilters, filtersToQuery, parsePastedOffer, titleTokens, toCsv, type OfferRow } from "./offers";

test("duplicates: same company (noise stripped) + similar title, newer one is flagged for merge", () => {
  const jobs = [
    { id: 1, company: "Vermeg SA", title: "Stage PFE – Développeur Java Spring", created_at: "2026-10-01" },
    { id: 2, company: "VERMEG Tunisie", title: "Stage PFE Développeur Java/Spring (H/F)", created_at: "2026-10-05" },
    { id: 3, company: "Vermeg", title: "Data Analyst Intern", created_at: "2026-10-06" },
    { id: 4, company: "Sofrecom", title: "Stage PFE – Développeur Java Spring", created_at: "2026-10-07" },
  ];
  const d = findDuplicates(jobs);
  assert.equal(normalizeCompany("VERMEG Tunisie"), "vermeg");
  assert.deepEqual(d.get(2), { id: 1, title: jobs[0].title, newer: true });
  assert.equal(d.get(1)?.id, 2);
  assert.equal(d.get(1)?.newer, false);
  assert.equal(d.has(3), false, "different title");
  assert.equal(d.has(4), false, "different company");
  assert.ok(jaccard(titleTokens("a b c"), titleTokens("a b d")) < 0.7);
});

test("paste parser: labelled fields, French date deadline, type and remote", () => {
  const p = parsePastedOffer(
    `Stage PFE : Ingénieur DevOps
Entreprise : Telnet Holding
Lieu : Ariana, Tunisie
Nous recherchons un stagiaire PFE pour automatiser nos pipelines CI/CD avec Docker et Kubernetes.
Télétravail partiel possible.
Date limite de candidature : 15 novembre 2026`,
    new Date("2026-10-13"),
  );
  assert.equal(p.title, "Stage PFE : Ingénieur DevOps");
  assert.equal(p.company, "Telnet Holding");
  assert.equal(p.location, "Ariana, Tunisie");
  assert.equal(p.deadline, "2026-11-15");
  assert.equal(p.type, "pfe");
  assert.equal(p.remote, true);
  assert.ok(p.tags.includes("Docker"));
});

test("paste parser: 'Title at Company' first line, city detection, numeric date", () => {
  const p = parsePastedOffer(
    `Summer Internship – Embedded Software at Chifco
We build IoT devices in our Sousse office. You will write firmware in C for STM32.
Apply before 30/06/2027.`,
    new Date("2026-10-13"),
  );
  assert.equal(p.title, "Summer Internship – Embedded Software");
  assert.equal(p.company, "Chifco");
  assert.equal(p.location, "Sousse");
  assert.equal(p.deadline, "2027-06-30");
  assert.equal(p.type, "stage");
  assert.deepEqual(findDates("Deadline: November 15, 2026 or 2026-12-01"), ["2026-12-01", "2026-11-15"]);
  assert.deepEqual(findDates("31/02/2026"), [], "invalid dates are dropped");
});

test("csv: quoting, doubled quotes, newlines, formula neutralised", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(4.5), "4.5");
  assert.equal(toCsv([["a", "b"], [1, "x;y"]]), 'a,b\r\n1,"x;y"\r\n');
});

test("filters: parse clamps input and round-trips to a canonical query", () => {
  const f = parseFilters(new URLSearchParams("type=pfe,bogus&verdict=apply,none&min=9&sort=evil&remote=1&tracked=maybe"));
  assert.deepEqual(f.types, ["pfe"]);
  assert.deepEqual(f.verdicts, ["apply", "none"]);
  assert.equal(f.min, 5);
  assert.equal(f.sort, "score");
  assert.equal(f.tracked, "");
  assert.equal(filtersToQuery(f), "type=pfe&verdict=apply%2Cnone&min=5&remote=1");
});

test("filters: expired and skip offers hidden unless tracked, starred or 'all'; estimates rank below real scores", async () => {
  const { applyFilters } = await import("../offers-filter");
  const row = (id: number, x: Partial<OfferRow>): OfferRow => ({ id, title: `T${id}`, company: "C", location: "", remote: false, type: "stage", source: "manual", url: "", tags: [], deadline: null, created_at: "2026-10-01", archived: false, starred: false, score: null, verdict: null, engine: null, appId: null, status: null, dup: null, evergreen: [], ...x });
  const rows = [
    row(1, { score: 4.2, engine: "heuristic", verdict: "apply_now" }),
    row(2, { score: 4.0, engine: "claude", verdict: "apply" }),
    row(3, { deadline: "2020-01-01", score: 4.9, engine: "claude" }),
    row(4, { verdict: "skip", score: 1.5, engine: "claude" }),
    row(5, { verdict: "skip", score: 1.5, engine: "claude", appId: 9 }),
  ];
  const f = parseFilters(new URLSearchParams(""));
  assert.deepEqual(applyFilters(rows, f).map((r) => r.id), [2, 1, 5]);
  assert.deepEqual(applyFilters(rows, { ...f, all: true }).map((r) => r.id), [2, 1, 5, 4, 3], "expired last even with a high score");
});
