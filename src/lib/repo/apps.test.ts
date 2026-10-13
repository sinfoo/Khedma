import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, buildIcs, computeChecklist, foldLine, icsEscape, pipelineStats, stageEffects } from "./apps";
import { clampChars, parseMessage, prioritizeLines, structureCvText } from "../ai/apps";
import { diffLines } from "../../components/pipeline/diff";

const NOW = new Date(2026, 9, 13, 9, 30); // Tue 13 Oct 2026, local

test("stageEffects: applied sets applied_at, follow-up at +7 days and next action", () => {
  const fx = stageEffects("evaluated", "applied", { appliedAt: null, nextActionAt: null, hasOpenFollowup: false }, NOW);
  assert.equal(fx.appliedAt, NOW.toISOString());
  assert.equal(fx.followupDue, "2026-10-20");
  assert.equal(fx.nextActionAt, "2026-10-20");
  assert.equal(fx.askInterview, false);
});

test("stageEffects: keeps existing applied_at / next action, no duplicate follow-up", () => {
  const fx = stageEffects("responded", "applied", { appliedAt: "2026-10-01T08:00:00.000Z", nextActionAt: "2026-10-15", hasOpenFollowup: true }, NOW);
  assert.equal(fx.appliedAt, "2026-10-01T08:00:00.000Z");
  assert.equal(fx.followupDue, null);
  assert.equal(fx.nextActionAt, "2026-10-15");
});

test("stageEffects: interview asks to schedule, rejected asks for a reason, same stage is a no-op", () => {
  const base = { appliedAt: null, nextActionAt: null, hasOpenFollowup: false };
  assert.equal(stageEffects("applied", "interview", base, NOW).askInterview, true);
  assert.equal(stageEffects("applied", "rejected", base, NOW).askReason, true);
  const same = stageEffects("applied", "applied", base, NOW);
  assert.equal(same.followupDue, null);
  assert.equal(same.appliedAt, null);
});

test("addDays crosses month boundaries", () => {
  assert.equal(addDays("2026-10-28", 7), "2026-11-04");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("computeChecklist merges detected facts and manual ticks", () => {
  const r = computeChecklist(
    { profile_cv: true, evaluated: true, cv_tailored: false, letter: false, applied: false, followup: false, interview_prep: false },
    ["letter", "bogus"],
  );
  assert.equal(r.total, 7);
  assert.equal(r.done, 3);
  assert.equal(r.pct, 43);
  assert.deepEqual(r.items.find((i) => i.key === "letter"), { key: "letter", auto: false, done: true });
  assert.equal(r.items.find((i) => i.key === "profile_cv")?.auto, true);
});

test("pipelineStats: active, response rate, interviews this week", () => {
  const s = pipelineStats(
    [
      { status: "evaluated", applied_at: null },
      { status: "applied", applied_at: "2026-10-01" },
      { status: "interview", applied_at: "2026-09-20" },
      { status: "rejected", applied_at: "2026-09-10" },
      { status: "discarded", applied_at: null },
      { status: "hired", applied_at: "2026-08-01" },
    ],
    [{ starts_at: "2026-10-12T10:00" }, { starts_at: "2026-10-18T09:00" }, { starts_at: "2026-10-19T09:00" }],
    NOW,
  );
  assert.equal(s.active, 3);
  assert.equal(s.applied, 4);
  assert.equal(s.responseRate, 75);
  assert.equal(s.interviewsThisWeek, 2);
});

test("icsEscape escapes RFC 5545 specials", () => {
  assert.equal(icsEscape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("foldLine folds at 75 octets without splitting UTF-8 characters", () => {
  const line = "DESCRIPTION:" + "é".repeat(80);
  const folded = foldLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.ok(parts.slice(1).every((p) => p.startsWith(" ")));
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(""), line);
});

test("buildIcs: CRLF, floating and all-day times, UID per item, escaping", () => {
  const ics = buildIcs(
    [
      { uid: "interview-1", summary: "Technical, Acme; R&D", start: "2026-10-20T14:00", durationMin: 90, location: "Tunis, Lac 2", alarmMin: 60 },
      { uid: "deadline-2", summary: "Deadline", start: "2026-10-31" },
      { uid: "bad", summary: "skip me", start: "not a date" },
    ],
    "Khedma",
    new Date(Date.UTC(2026, 9, 13, 8, 0, 0)),
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "only CRLF line endings");
  assert.match(ics, /UID:interview-1@khedma\.local\r\n/);
  assert.match(ics, /DTSTAMP:20261013T080000Z\r\n/);
  assert.match(ics, /DTSTART:20261020T140000\r\nDTEND:20261020T153000\r\n/);
  assert.match(ics, /SUMMARY:Technical\\, Acme\\; R&D\r\n/);
  assert.match(ics, /LOCATION:Tunis\\, Lac 2\r\n/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
});

test("structureCvText turns extracted text into Markdown sections without adding facts", () => {
  const md = structureCvText(
    "Amira Ben Salah\namira@example.com · +216 20 000 000\n\nEXPÉRIENCE\nStage chez Acme, Tunis\n• Développement d'une API en Node.js\n• Tests avec\nJest et Docker\n\nCompétences\nPython, Docker, Git",
  );
  assert.match(md, /^# Amira Ben Salah/);
  assert.match(md, /^## Expérience$/m);
  assert.match(md, /^## Compétences$/m);
  assert.match(md, /^- Développement d'une API en Node\.js$/m);
  for (const w of ["Acme", "Python", "Docker", "Git", "Jest"]) assert.ok(md.includes(w));
  assert.ok(!/Résumé|Summary/.test(md));
});

test("prioritizeLines moves relevant bullets first in bullet-only sections", () => {
  const md = "# X\n\n## Skills\n- Excel\n- Docker and Kubernetes\n- Python\n";
  const out = prioritizeLines(md, ["Docker", "Kubernetes", "Python"]);
  assert.match(out, /## Skills\n- Docker and Kubernetes\n- Python\n- Excel/);
});

test("parseMessage and clampChars", () => {
  assert.deepEqual(parseMessage("SUBJECT: Hello\n---\nBody here"), { subject: "Hello", body: "Body here" });
  assert.deepEqual(parseMessage("Objet : Relance\n\nBonjour"), { subject: "Relance", body: "Bonjour" });
  const s = clampChars("word ".repeat(100), 300);
  assert.ok(s.length <= 300 && s.endsWith("…"));
});

test("diffLines marks added and removed lines", () => {
  const ops = diffLines("a\nb\nc", "a\nB\nc\nd");
  assert.deepEqual(ops.map((o) => o.type), ["same", "same", "same", "add"]);
  const ops2 = diffLines("a\nx\nc", "a\nc\ny");
  assert.deepEqual(ops2.filter((o) => o.type !== "same").map((o) => `${o.type}:${o.text}`), ["del:x", "add:y"]);
});
