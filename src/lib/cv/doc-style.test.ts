import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DOC_STYLE, fitSteps, normalizeDocStyle } from "./doc-style";

test("doc style keeps only known values", () => {
  assert.deepEqual(normalizeDocStyle({ template: "nope", accent: "red", size: 30, fit: "yes" }), { ...DEFAULT_DOC_STYLE, fit: false });
  assert.equal(normalizeDocStyle({ size: 9.74 }).size, 9.5);
});

test("fit shrinks density, then margins, then size down to 9pt", () => {
  const steps = fitSteps({ ...DEFAULT_DOC_STYLE, size: 10 });
  assert.deepEqual(steps, [{ "--doc-lh": "1.35", "--doc-gap": "4pt" }, { "--doc-mx": "12mm", "--doc-my": "10mm" }, { "--doc-fs": "9.5pt" }, { "--doc-fs": "9pt" }]);
  assert.deepEqual(fitSteps({ ...DEFAULT_DOC_STYLE, density: "compact", margins: "narrow", size: 9 }), []);
});
