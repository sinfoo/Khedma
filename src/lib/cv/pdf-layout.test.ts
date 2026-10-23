import { test } from "node:test";
import assert from "node:assert/strict";
import { iconLinks, pageText, type PdfItem } from "./pdf-layout";

const W = 595;
const H = 842;
/** An item on a line counted from the top (PDF y grows upward). */
const at = (str: string, x: number, lineFromTop: number, width = str.length * 5, fontSize = 10): PdfItem => ({ str, x, y: H - 60 - lineFromTop * 14, width, height: fontSize, fontSize });

test("a two-column CV reads the sidebar, then the main column, under the full-width header", () => {
  const items = [
    at("Safwen Bibeni — Développeur web et mobile, Tunis", 40, 0, 480),
    ...["CONTACT", "+216 98 123 456", "COMPÉTENCES", "React", "Node.js", "LANGUES", "Anglais C1"].map((s, i) => at(s, 40, 2 + i * 4, 120)),
    ...["EXPÉRIENCE", "Wisecool.tn, développeur", "Refonte de l'académie en ligne", "Tamjar.com, développeur", "Application Flutter", "PROJETS", "AHG Studio"].map((s, i) => at(s, 260, 2 + i * 4, 260)),
  ];
  const text = pageText(items, W, H).split("\n");
  assert.equal(text[0], "Safwen Bibeni — Développeur web et mobile, Tunis");
  assert.deepEqual(text.slice(1, 8), ["CONTACT", "+216 98 123 456", "COMPÉTENCES", "React", "Node.js", "LANGUES", "Anglais C1"]);
  assert.deepEqual(text.slice(8), ["EXPÉRIENCE", "Wisecool.tn, développeur", "Refonte de l'académie en ligne", "Tamjar.com, développeur", "Application Flutter", "PROJETS", "AHG Studio"]);
});

test("a single column with right-aligned dates stays in line order", () => {
  const items: PdfItem[] = [];
  for (let i = 0; i < 6; i++) {
    items.push(at(`Entreprise ${i}, développeur`, 40, i * 3, 200));
    items.push(at(`2024 - 2025`, 495, i * 3, 60));
    items.push(at(`Une ligne de description assez longue pour traverser la page entière`, 40, i * 3 + 1, 500));
  }
  const text = pageText(items, W, H).split("\n");
  assert.equal(text[0], "Entreprise 0, développeur 2024 - 2025");
  assert.equal(text[1], "Une ligne de description assez longue pour traverser la page entière");
});

test("split word fragments are glued back", () => {
  const items = [at("Dévelop", 40, 0, 35), at("peur", 75, 0, 20), at("Full", 100, 0, 18), at("Stack", 121, 0, 25)];
  assert.equal(pageText(items, W, H), "Développeur Full Stack");
});

test("profile links behind icons are recovered once", () => {
  assert.deepEqual(iconLinks("Contact: safwen@x.tn github.com/sinfoo", ["https://www.linkedin.com/in/safwen/", "https://github.com/sinfoo", "mailto:a@b.c", "https://linkedin.com/in/safwen"]), ["linkedin.com/in/safwen"]);
});
