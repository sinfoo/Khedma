import { test } from "node:test";
import assert from "node:assert/strict";
import { internshipMonths, stipendCheck } from "./abroad";

const job = (location: string, description: string, type: "stage" | "emploi" = "stage") => ({ location, description, type });

test("internship length is read in French, English and German", () => {
  assert.equal(internshipMonths("Stage de 6 mois à Paris"), 6);
  assert.equal(internshipMonths("A 4-month internship"), 4);
  assert.equal(internshipMonths("Praktikum für 3 Monate"), 3);
  assert.equal(internshipMonths("Rejoignez-nous"), null);
});

test("stipend floor: France after 2 months, Germany after 3, nothing for short internships or other countries", () => {
  const fr = stipendCheck(job("Paris, France", "Stage de 6 mois, gratification 500 € / mois."));
  assert.equal(fr?.country, "FR");
  assert.equal(fr?.floorMonthly, 683);
  assert.equal(fr?.offeredMonthly, 500);
  assert.ok(fr?.below);
  assert.ok(!stipendCheck(job("Lyon", "Stage de 6 mois, 4,50 €/h."))?.below);
  assert.equal(stipendCheck(job("Paris", "Stage de 2 mois, 300 € par mois.")), null);
  const de = stipendCheck(job("Berlin, Germany", "6 Monate Praktikum, 1.500 € pro Monat"));
  assert.equal(de?.country, "DE");
  assert.ok(de?.below);
  assert.equal(stipendCheck(job("Tunis", "Stage de 6 mois, 500 DT")), null);
  assert.equal(stipendCheck(job("Paris", "CDI 3000 €", "emploi")), null);
  assert.equal(stipendCheck(job("Paris", "Stage de 6 mois"))?.offeredMonthly, null);
});
