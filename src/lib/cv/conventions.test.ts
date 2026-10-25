import { test } from "node:test";
import assert from "node:assert/strict";
import { cvConventionIssues } from "./conventions";

const fr = "Expérience et compétences pour les projets des équipes avec une formation en informatique. ".repeat(10);
const en = "Experience and skills with the projects for the education of the team. ".repeat(10);

test("CV conventions per country", () => {
  assert.deepEqual(cvConventionIssues(`Né le 3 mars 2005, célibataire\n${en}`, "US"), ["birth_date", "marital_status"]);
  assert.deepEqual(cvConventionIssues(`Né le 3 mars 2005\n${fr}`, "FR"), [], "France accepts it");
  assert.deepEqual(cvConventionIssues(en, "FR"), ["language"]);
  assert.deepEqual(cvConventionIssues(fr, "GB"), ["language"]);
  assert.deepEqual(cvConventionIssues(fr, "TN"), []);
  assert.ok(cvConventionIssues("word ".repeat(700), "US").includes("too_long"));
  assert.ok(!cvConventionIssues("word ".repeat(700), "DE").includes("too_long"));
});
