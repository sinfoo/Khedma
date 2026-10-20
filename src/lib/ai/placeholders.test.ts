import { test } from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders, hardBreaks } from "./placeholders";

const facts = { date: "20 octobre 2026", recipient: null, availability: null };

test("known placeholders are filled, unknown ones take their sentence or line", () => {
  const md = [
    "**Safwen Bibeni**",
    "",
    "[Date]",
    "",
    "Responsive Web Systems",
    "À l'attention de [Nom du recruteur]",
    "Sousse",
    "",
    "[Madame, Monsieur],",
    "",
    "Je serais heureux de vous rencontrer. Je suis disponible du [date de début] au [date de fin].",
    "Voir [mon portfolio](https://example.com).",
  ].join("\n");
  const r = fillPlaceholders(md, facts);
  assert.deepEqual(r.dropped, ["Je suis disponible du [date de début] au [date de fin]."]);
  assert.equal(
    r.md,
    [
      "**Safwen Bibeni**",
      "",
      "20 octobre 2026",
      "",
      "Responsive Web Systems",
      "Sousse",
      "",
      "Madame, Monsieur,",
      "",
      "Je serais heureux de vous rencontrer.",
      "Voir [mon portfolio](https://example.com).",
      "",
    ].join("\n"),
  );
});

test("single newlines become hard breaks, lists and headings stay markdown", () => {
  assert.equal(hardBreaks("Name\nphone\n\n## Exp\n- a\n- b\nACME\nDev"), "Name\\\nphone\n\n## Exp\n- a\n- b\\\nACME\\\nDev");
});
