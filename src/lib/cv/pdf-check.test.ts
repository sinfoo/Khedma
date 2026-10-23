import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPdfText } from "./pdf-check";

const expect = { name: "Safwen Bibeni", email: "safwen.bibeni@gmail.com", phone: "+216 21 179 509", maxPages: 2 };
const page = "Safwen Bibeni\n+216 21 179 509 · safwen.bibeni@gmail.com\nEXPÉRIENCE\nWisecool.tn, développeur web et mobile";

test("a clean PDF has no issues", () => {
  assert.deepEqual(checkPdfText([page], expect), []);
});

test("blank pages, unreadable glyphs, placeholders, missing contact and length are reported", () => {
  const issues = checkPdfText(["SAFWEN BIBENI � Disponible du [date de début]", "   ", "x".repeat(30)], expect);
  assert.deepEqual(issues, [
    { kind: "empty-page", page: 2 },
    { kind: "garbled", count: 2 },
    { kind: "placeholder", text: "[date de début]" },
    { kind: "missing", what: "email" },
    { kind: "missing", what: "phone" },
    { kind: "too-long", pages: 3, max: 2 },
  ]);
});
