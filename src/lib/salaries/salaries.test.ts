import { test } from "node:test";
import assert from "node:assert/strict";
import { band, extractSalaryMentions, grossFromNet, irpp, netFromGross } from "./index";

test("irpp applies the progressive 2025 brackets", () => {
  assert.equal(irpp(4000), 0);
  assert.equal(irpp(10000), 750); // 5000 × 15%
  assert.equal(irpp(20000), 750 + 2500);
  assert.equal(irpp(25000), 750 + 2500 + 1500);
});

test("netFromGross: CNSS, capped professional expenses, IRPP", () => {
  const r = netFromGross(2000);
  // annual 24000, CNSS 2203.2, pro expenses min(2179.68, 2000) = 2000, taxable 19796.8
  assert.equal(r.cnss, 183.6);
  assert.equal(r.proExpenses, 166.67);
  const tax = 750 + (19796.8 - 10000) * 0.25;
  assert.equal(r.irpp, Math.round((tax / 12) * 100) / 100);
  assert.equal(r.netMonthly, Math.round(((24000 - 2203.2 - tax) / 12) * 100) / 100);
  assert.ok(r.netMonthly < 2000 && r.netMonthly > 1500);
  assert.equal(netFromGross(0).netMonthly, 0);
});

test("grossFromNet inverts netFromGross", () => {
  for (const g of [500, 1600, 3200, 9000]) {
    const net = netFromGross(g).netMonthly;
    assert.ok(Math.abs(grossFromNet(net) - g) < 0.05, `gross ${g}`);
  }
});

test("band scales by city tier and rounds to 50", () => {
  assert.deepEqual(band("software", "junior", "tunis"), [1600, 2800]);
  assert.deepEqual(band("software", "junior", "other"), [1300, 2250]);
});

test("extractSalaryMentions finds DT, EUR, ranges and k", () => {
  const m = extractSalaryMentions(
    "Stage rémunéré 600 DT/mois. Junior: 1 800 - 2 400 TND brut par mois. Remote 30-40k € par an, or €2000 monthly. Bonus 2.5k EUR. Durée 6 mois, 2026.",
  );
  assert.deepEqual(
    m.map((x) => [x.min, x.max, x.currency, x.period]),
    [
      [600, 600, "TND", "month"],
      [1800, 2400, "TND", "month"],
      [30000, 40000, "EUR", "year"],
      [2000, 2000, "EUR", "month"],
      [2500, 2500, "EUR", null],
    ],
  );
  assert.deepEqual(extractSalaryMentions("Call 2026 or visit room 12."), []);
});
