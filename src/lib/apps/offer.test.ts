import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_OFFER, hasOffer, normalizeOffer, offerMonthlyTnd } from "./offer";
import { scoreDims } from "./compare";

test("offer records keep only valid values", () => {
  const o = normalizeOffer({ pay: "1200", currency: "XXX", period: "week", months: 6, respondBy: "2026-11-05", start: "tomorrow", remoteDays: 9, hireAfter: "yes", perks: " Ticket resto " });
  assert.deepEqual(o, { ...EMPTY_OFFER, pay: 1200, months: 6, respondBy: "2026-11-05", remoteDays: 7, perks: "Ticket resto" });
  assert.equal(hasOffer(normalizeOffer({})), false);
  assert.equal(offerMonthlyTnd({ ...EMPTY_OFFER, pay: 24000, currency: "EUR", period: "year" }), 6800);
});

test("the comparison uses the offer received over the posting", () => {
  const base = { job: { title: "Stage", description: "Gratification 300 DT par mois", location: "Tunis", remote: false, type: "stage" as const, deadline: null }, evaluation: null, status: "offer" as const, applied_at: null, companyRating: 0, personalRating: 0, targetLocations: [], targetTypes: [], today: "2026-10-23" };
  assert.equal(scoreDims(base).salary, 300);
  const withOffer = scoreDims({ ...base, offer: { ...EMPTY_OFFER, pay: 1600, respondBy: "2026-10-25", remoteDays: 3 } });
  assert.equal(withOffer.salary, 1600);
  assert.equal(withOffer.scores.salary, 5);
  assert.equal(withOffer.daysLeft, 2, "days left to answer the offer");
  assert.equal(withOffer.scores.location, 5, "3 remote days a week");
});
