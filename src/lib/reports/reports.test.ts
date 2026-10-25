import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, bucketByWeek, buildDigest, inWeek, toLocalDay, weekStart, type DigestInput } from "./digest";
import { escapeHtml, reportHtml, reportMarkdown, type ReportData } from "./html";

test("weekStart: Monday of the week, local time, stable across the week", () => {
  assert.equal(weekStart("2026-10-13"), "2026-10-12"); // Tuesday → Monday
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // Monday
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
  assert.equal(weekStart("2027-01-01"), "2026-12-28"); // crosses the year
  assert.equal(addDays("2026-10-12", 7), "2026-10-19");
  assert.equal(toLocalDay("2026-10-13"), "2026-10-13");
  assert.equal(toLocalDay("2026-10-13T10:00"), "2026-10-13");
  assert.equal(toLocalDay(null), null);
  assert.ok(inWeek("2026-10-18", "2026-10-12") && !inWeek("2026-10-19", "2026-10-12") && !inWeek(null, "2026-10-12"));
});

test("bucketByWeek groups by Monday and drops undated items", () => {
  const items = [{ d: "2026-10-13" }, { d: "2026-10-18T23:30" }, { d: "2026-10-19" }, { d: null }];
  const b = bucketByWeek(items, (x) => x.d);
  assert.deepEqual([...b.keys()].sort(), ["2026-10-12", "2026-10-19"]);
  assert.equal(b.get("2026-10-12")!.length, 2);
  assert.equal(b.get("2026-10-19")!.length, 1);
});

const job = (id: number, extra: Partial<DigestInput["jobs"][number]> = {}) => ({ id, title: `Job ${id}`, company: `Co ${id}`, created_at: "2026-10-13T09:00", deadline: null, archived: false, ...extra });
const app = (id: number, jobId: number, extra: Partial<DigestInput["apps"][number]> = {}): DigestInput["apps"][number] => ({
  id, status: "evaluated", applied_at: null, created_at: "2026-10-13T09:00", job: { ...job(jobId), ...(extra.job ?? {}) }, score: null, verdict: null, lesson: "", outcome: null, outcome_at: null, ...extra,
});

test("buildDigest: counts the week, next-week deadlines, top 3 unapplied, lessons and a focus list", () => {
  const input: DigestInput = {
    weekStart: "2026-10-12",
    jobs: [job(1), job(2, { created_at: "2026-10-05" }), job(3, { deadline: "2026-10-21" }), job(4, { deadline: "2026-10-22", archived: true }), job(5), job(6, { created_at: "2026-10-20" })],
    evaluations: [
      { job_id: 1, created_at: "2026-10-13T10:00", global: 4.2 },
      { job_id: 2, created_at: "2026-10-14T10:00", global: 3.1 },
      { job_id: 3, created_at: "2026-10-14T11:00", global: 4.8 },
      { job_id: 5, created_at: "2026-10-01", global: 4.9 },
      { job_id: 2, created_at: "2026-10-15T10:00", global: 3.5 }, // re-evaluated: latest wins
    ],
    apps: [
      app(10, 1, { status: "applied", applied_at: "2026-10-14T12:00" }),
      app(11, 2, { status: "rejected", lesson: "Postuler plus tôt", outcome: "rejected", outcome_at: "2026-10-16T08:00" }),
      app(12, 5, { status: "applied", applied_at: "2026-10-01" }),
    ],
    statusEvents: [
      { application_id: 10, payload: "applied", created_at: "2026-10-14T12:00" },
      { application_id: 10, payload: "responded", created_at: "2026-10-16T12:00" },
      { application_id: 12, payload: "interview", created_at: "2026-10-03" },
    ],
    interviews: [{ application_id: 10, starts_at: "2026-10-17T14:00", kind: "technical" }, { application_id: 12, starts_at: "2026-10-05T10:00", kind: "hr" }],
  };
  const d = buildDigest(input, "2026-10-13");
  assert.equal(d.weekEnd, "2026-10-18");
  assert.equal(d.newOffers, 4); // 1, 3, 4, 5 (2 is older, 6 is next week)
  assert.equal(d.evaluated, 3); // distinct jobs 1, 2, 3
  assert.equal(d.applied, 1);
  assert.equal(d.responses, 1);
  assert.equal(d.interviews.length, 1);
  assert.equal(d.interviews[0].company, "Co 1");
  assert.deepEqual(d.deadlinesNext.map((x) => x.job_id), [3]); // 4 is archived
  assert.deepEqual(d.top.map((x) => x.job_id), [3]); // 1 and 5 already applied, 2 rejected
  assert.equal(d.lessons.length, 1);
  assert.equal(d.lessons[0].lesson, "Postuler plus tôt");
  assert.equal(d.focus[0].key, "deadlines");
  assert.ok(d.focus.some((f) => f.key === "applyTop" && f.vars.score === "4.8"));
  assert.ok(d.focus.some((f) => f.key === "followUp" && f.vars.n === 1)); // app 12 waiting since Oct 1
  assert.ok(d.focus.length <= 4);
});

test("buildDigest on an empty search suggests finding offers", () => {
  const d = buildDigest({ weekStart: "2026-10-12", jobs: [], evaluations: [], apps: [], statusEvents: [], interviews: [] }, "2026-10-13");
  assert.equal(d.newOffers + d.applied + d.top.length, 0);
  assert.deepEqual(d.focus.map((f) => f.key), ["findOffers"]);
});

const report = (): ReportData => ({
  title: "Rapport <jury>",
  subtitle: "Semaine du 12 oct.",
  generated: "Généré le 13 oct.",
  owner: "Amine & Co",
  kpis: [{ label: "Candidatures", value: 2, hint: "Scores \"indicatifs\"" }],
  funnel: [{ label: "Évaluées", count: 2 }, { label: "Postulé", count: 1 }],
  rows: [{ id: 1, title: "<script>alert(1)</script>", company: "A & B", type: "PFE", status: "applied", statusLabel: "Postulé", score: 4.25, verdict: "Postuler", created_at: "2026-10-01", applied_at: "14 oct.", deadline: null, channel: "site", outcome: "", lesson: "it's | fine" }],
  interviews: [],
  lessons: [{ title: "T", company: "C", outcome: "Refus", lesson: "x < y" }],
  focus: ["Postulez à <Job 3>"],
  labels: { kpis: "KPI", funnel: "Funnel", applications: "Apps", interviews: "Interviews", lessons: "Lessons", focus: "Focus", none: "—", footer: "Khedma", col: { offer: "Offre", company: "Entreprise", type: "Type", status: "Statut", score: "Score", verdict: "Verdict", applied: "Postulé", deadline: "Limite", outcome: "Résultat", lesson: "Leçon", when: "Quand", kind: "Type" } },
});

test("reportHtml escapes every user-provided string and stays self-contained", () => {
  const html = reportHtml(report());
  assert.ok(!html.includes("<script>alert"), "script tag must be escaped");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("Rapport &lt;jury&gt;") && html.includes("A &amp; B") && html.includes("Amine &amp; Co"));
  assert.ok(html.includes("Scores &quot;indicatifs&quot;") && html.includes("it&#39;s | fine") && html.includes("x &lt; y") && html.includes("Postulez à &lt;Job 3&gt;"));
  assert.ok(html.startsWith("<!doctype html>") && html.includes("<style>") && !/<link|<script/i.test(html));
  assert.ok(html.includes('width:50%')); // funnel bar: 1 of max 2
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("reportMarkdown escapes pipes in table cells and lists sections", () => {
  const md = reportMarkdown(report());
  assert.ok(md.includes("it's \\| fine"));
  assert.ok(md.includes("# Rapport <jury>") && md.includes("## Apps") && md.includes("| Offre | Entreprise |"));
  assert.ok(md.includes("_—_")); // empty interviews
});

test("buildDigest: a deadline priority needs a tracked or well-scored offer; SQLite UTC times map to the local day", () => {
  const input: DigestInput = {
    weekStart: "2026-10-12",
    jobs: [job(1, { deadline: "2026-10-20" }), job(2, { deadline: "2026-10-21" }), job(3, { deadline: "2026-10-22" })],
    evaluations: [{ job_id: 2, created_at: "2026-10-13T10:00", global: 2.1 }, { job_id: 3, created_at: "2026-10-13T10:00", global: 4.4 }],
    apps: [app(10, 1)],
    statusEvents: [],
    interviews: [],
  };
  // Job 1 is tracked, job 3 scored well; job 2 (untracked, weak) is not a priority.
  assert.deepEqual(buildDigest(input, "2026-10-13").deadlinesNext.map((x) => x.job_id), [1, 3]);
  const local = new Date(Date.UTC(2026, 9, 13, 23, 30));
  const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  assert.equal(toLocalDay("2026-10-13 23:30:00"), day);
});
