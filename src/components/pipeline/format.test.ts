import { test } from "node:test";
import assert from "node:assert/strict";
import { daysAgo, daysSince } from "./format";

test("days since counts calendar days, not 24 h blocks", () => {
  const morning = new Date(2026, 10, 25, 9, 0).getTime();
  assert.equal(daysSince(new Date(2026, 10, 24, 23, 0).toISOString(), morning), 1, "sent last night is one day ago");
  assert.equal(daysSince(new Date(2026, 10, 25, 0, 30).toISOString(), morning), 0, "sent after midnight is today");
  assert.equal(daysSince("2026-11-18", morning), 7);
  assert.equal(daysSince("2026-12-01", morning), 0, "never negative");
  assert.equal(daysSince(null, morning), 0);
  assert.equal(daysAgo(new Date(2026, 10, 24, 23, 0).toISOString(), "en", morning), "yesterday");
  assert.equal(daysAgo("2026-11-18", "fr", morning), "il y a 7 jours");
});
