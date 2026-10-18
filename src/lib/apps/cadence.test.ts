import { test } from "node:test";
import assert from "node:assert/strict";
import { byUrgency, checkFollowup, companyLatency, computeCadence, type CadenceInput } from "./cadence";

const now = new Date("2026-10-13T12:00:00");
const base: CadenceInput = { status: "applied", applied_at: "2026-10-01T09:00:00Z", stageEnteredAt: "2026-10-01 09:00:00", followups: [] };

test("applied: first follow-up due after 7 days, then +7, then cold", () => {
  const fresh = computeCadence({ ...base, applied_at: "2026-10-10T09:00:00Z" }, now);
  assert.equal(fresh.urgency, "waiting");
  assert.equal(fresh.angle, "first");
  assert.equal(fresh.nextDue, "2026-10-17");

  const due = computeCadence(base, now);
  assert.equal(due.urgency, "overdue");
  assert.equal(due.followupCount, 0);
  assert.equal(due.nextDue, "2026-10-08");

  const one = computeCadence({ ...base, followups: ["2026-10-08 10:00:00"] }, now);
  assert.equal(one.angle, "second");
  assert.equal(one.urgency, "waiting");
  assert.equal(one.nextDue, "2026-10-15");
  assert.equal(one.followupCount, 1);

  const cold = computeCadence({ ...base, followups: ["2026-10-08 10:00:00", "2026-10-12 10:00:00"] }, now);
  assert.equal(cold.urgency, "cold");
  assert.equal(cold.nextDue, null);
  assert.equal(cold.angle, "none");
});

test("follow-ups before the stage started do not count", () => {
  const c = computeCadence({ ...base, applied_at: "2026-10-12T09:00:00Z", stageEnteredAt: "2026-10-12 09:00:00", followups: ["2026-09-01 10:00:00"] }, now);
  assert.equal(c.followupCount, 0);
  assert.equal(c.angle, "first");
});

test("responded: urgent within 24h, overdue after 3 days, subsequent every 3 days", () => {
  const urgent = computeCadence({ ...base, status: "responded", stageEnteredAt: "2026-10-13 08:00:00" }, now);
  assert.equal(urgent.urgency, "urgent");
  assert.equal(urgent.angle, "reply");
  const overdue = computeCadence({ ...base, status: "responded", stageEnteredAt: "2026-10-09 08:00:00" }, now);
  assert.equal(overdue.urgency, "overdue");
  const after = computeCadence({ ...base, status: "responded", stageEnteredAt: "2026-10-09 08:00:00", followups: ["2026-10-12 08:00:00"] }, now);
  assert.equal(after.urgency, "waiting");
  assert.equal(after.nextDue, "2026-10-15");
});

test("interview: thank-you due the day after, rejection-latency flag at 30 days", () => {
  const ty = computeCadence({ ...base, status: "interview", stageEnteredAt: "2026-10-05 08:00:00", lastInterviewAt: "2026-10-12T09:00" }, now);
  assert.equal(ty.angle, "thankyou");
  assert.equal(ty.urgency, "overdue");
  assert.equal(ty.silentDays, null);
  const sent = computeCadence({ ...base, status: "interview", stageEnteredAt: "2026-10-05 08:00:00", lastInterviewAt: "2026-10-12T09:00", followups: ["2026-10-13 09:00:00"] }, now);
  assert.equal(sent.angle, "reply");
  assert.equal(sent.urgency, "waiting");
  const silent = computeCadence({ ...base, status: "interview", stageEnteredAt: "2026-08-01 08:00:00", lastInterviewAt: "2026-09-01T10:00", followups: ["2026-09-02 09:00:00"] }, now);
  assert.equal(silent.silentDays, 42);
});

test("non-actionable stages and missing dates give none", () => {
  assert.equal(computeCadence({ ...base, status: "evaluated" }, now).urgency, "none");
  assert.equal(computeCadence({ ...base, applied_at: null, stageEnteredAt: null }, now).urgency, "none");
});

test("byUrgency orders urgent > overdue > waiting > cold", () => {
  const mk = (status: CadenceInput["status"], entered: string, f: string[] = []) => ({ cadence: computeCadence({ ...base, status, applied_at: entered, stageEnteredAt: entered, followups: f }, now) });
  const xs = [mk("applied", "2026-10-12"), mk("applied", "2026-09-01", ["2026-09-10", "2026-09-20"]), mk("responded", "2026-10-13"), mk("applied", "2026-09-20")];
  assert.deepEqual(xs.sort(byUrgency).map((x) => x.cadence.urgency), ["urgent", "overdue", "waiting", "cold"]);
});

test("companyLatency: median days to first response per company", () => {
  const m = companyLatency([
    { company: "Doctolib", applied_at: "2026-09-01", firstResponseAt: "2026-09-08 10:00:00" },
    { company: "doctolib ", applied_at: "2026-09-10", firstResponseAt: "2026-09-13 10:00:00" },
    { company: "Acme", applied_at: "2026-09-10", firstResponseAt: null },
  ]);
  assert.equal(m.get("doctolib"), 5);
  assert.equal(m.has("acme"), false);
});

test("checkFollowup flags banned openers and long drafts", () => {
  assert.deepEqual(checkFollowup("Just checking in on my application."), ["banned_opener"]);
  assert.deepEqual(checkFollowup("Petit rappel concernant ma candidature."), ["banned_opener"]);
  assert.deepEqual(checkFollowup(Array(151).fill("mot").join(" ")), ["too_long"]);
  assert.deepEqual(checkFollowup("Bonjour, suite à ma candidature du 1er octobre, je souhaitais partager un projet."), []);
});

test("interview: no thank-you is due before a future interview", () => {
  const c = computeCadence({ ...base, status: "interview", stageEnteredAt: "2026-10-10 09:00:00", lastInterviewAt: "2026-10-15T10:00:00" }, now);
  assert.equal(c.urgency, "waiting");
  assert.equal(c.angle, "thankyou");
  assert.ok(c.nextDue && c.nextDue > "2026-10-15", String(c.nextDue));
});
