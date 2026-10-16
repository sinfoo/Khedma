import { test } from "node:test";
import assert from "node:assert/strict";
import { escoCoverage, stems } from "./esco";

test("esco: stems fold accents and meet across FR/EN spellings", () => {
  assert.deepEqual(stems("Programmation web"), ["progra"]);
  assert.ok(stems("programming").includes("progra"));
});

test("esco: coverage marks a skill shown when most of its stems are in the CV", () => {
  const cv = "Projets : application web en React, débogage, documentation technique rédigée pour l'équipe.";
  const cov = escoCoverage(["fournir une documentation technique", "programmation web", "gérer un budget"], cv);
  assert.deepEqual(cov.map((c) => c.shown), [true, false, false]);
  assert.deepEqual(escoCoverage(["à la"], cv), [{ skill: "à la", shown: false }]);
});
