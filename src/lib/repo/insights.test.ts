import { test } from "node:test";
import assert from "node:assert/strict";
import { funnelStats, monthGrid, parseMonth, reachedStage, responseStats, scoreHistogram, shiftMonth, toDay, weekStart, weeklyAverages, weeklyCounts, dayKey, type AppHistory } from "./insights";

const now = new Date(2026, 9, 14, 12); // Wednesday 14 Oct 2026, local

test("weekStart is the local Monday", () => {
  assert.equal(dayKey(weekStart(now)), "2026-10-12");
  assert.equal(dayKey(weekStart(new Date(2026, 9, 18, 23))), "2026-10-12"); // Sunday
  assert.equal(dayKey(weekStart(new Date(2026, 9, 19))), "2026-10-19");
});

test("weeklyCounts buckets oldest → newest and drops out-of-range dates", () => {
  const c = weeklyCounts(["2026-10-12", "2026-10-14T09:00", "2026-10-05", "2026-09-28", "2025-01-01", null, "garbage", "2026-10-20"], 4, now);
  assert.deepEqual(c, [0, 1, 1, 2]);
  assert.deepEqual(weeklyAverages([{ at: "2026-10-13", value: 4 }, { at: "2026-10-13", value: 3 }, { at: "2026-10-06", value: 5 }], 3, now), [0, 5, 3.5]);
});

test("toDay keeps zone-less local dates and converts SQLite UTC stamps", () => {
  assert.equal(toDay("2026-10-20T14:00"), "2026-10-20");
  assert.equal(toDay("2026-10-20"), "2026-10-20");
  const d = new Date(Date.UTC(2026, 9, 20, 10));
  assert.equal(toDay("2026-10-20 10:00:00"), dayKey(d));
  assert.equal(toDay(null), null);
});

const app = (status: AppHistory["status"], statuses: [string, string][], applied_at: string | null = null): AppHistory => ({
  status,
  applied_at,
  events: statuses.map(([s, at]) => ({ status: s, at })),
});

test("funnel uses the furthest stage ever reached, even for rejections", () => {
  const apps = [
    app("evaluated", [["evaluated", "2026-10-01 08:00:00"]]),
    app("applied", [["applied", "2026-10-02 08:00:00"]], "2026-10-02T08:00:00Z"),
    app("rejected", [["applied", "2026-10-01 08:00:00"], ["interview", "2026-10-05 08:00:00"], ["rejected", "2026-10-09 08:00:00"]], "2026-10-01T08:00:00Z"),
    app("offer", [], "2026-09-20T08:00:00Z"),
  ];
  assert.equal(reachedStage(apps[2]), 3);
  const f = funnelStats(apps);
  assert.deepEqual(f.map((s) => s.count), [4, 3, 2, 2, 1, 0]);
  assert.deepEqual(f.map((s) => s.conv), [null, 75, 67, 100, 50, 0]);
});

test("responseStats: rate and median days to first answer", () => {
  const apps = [
    app("applied", [["applied", "2026-10-01 08:00:00"]], "2026-10-01T08:00:00Z"),
    app("rejected", [["applied", "2026-10-01 08:00:00"], ["rejected", "2026-10-03 08:00:00"]], "2026-10-01T08:00:00Z"),
    app("interview", [["applied", "2026-10-01 08:00:00"], ["responded", "2026-10-07 08:00:00"], ["interview", "2026-10-09 08:00:00"]], "2026-10-01T08:00:00Z"),
    app("evaluated", []),
  ];
  const r = responseStats(apps);
  assert.equal(r.applied, 3);
  assert.equal(r.responded, 2);
  assert.equal(r.rate, 67);
  assert.equal(r.medianDays, 4); // median of 2 and 6
  assert.deepEqual(responseStats([]), { applied: 0, responded: 0, rate: null, medianDays: null });
});

test("scoreHistogram uses half-point bins", () => {
  assert.deepEqual(scoreHistogram([1, 1.4, 2.5, 4.9, 5]), [2, 0, 0, 1, 0, 0, 0, 2]);
});

test("monthGrid: 42 Monday-first days covering the month", () => {
  const g = monthGrid("2026-10");
  assert.equal(g.length, 42);
  assert.equal(g[0].key, "2026-09-28");
  assert.equal(g[3].key, "2026-10-01");
  assert.equal(g[3].inMonth, true);
  assert.equal(g.filter((d) => d.inMonth).length, 31);
  assert.equal(g[41].key, "2026-11-08");
  assert.equal(monthGrid("2026-02").filter((d) => d.inMonth).length, 28);
});

test("parseMonth / shiftMonth", () => {
  assert.equal(parseMonth("2026-12", now), "2026-12");
  assert.equal(parseMonth("2026-13", now), "2026-10");
  assert.equal(parseMonth("../x", now), "2026-10");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
