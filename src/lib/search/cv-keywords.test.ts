import { test } from "node:test";
import assert from "node:assert/strict";
import { cvKeywords } from "./cv-keywords";

const DESIGNER = `# BIBANI BELHASSEN

**UX UI Designer**

## Experience

### UX UI Designer - mssolutions-group.com
**Nov 2024 - Present**
- Design user interfaces for web and mobile products
- Created wireframes, user flows and visual designs in Figma

### Graphic / Motion Designer - havasworldwide.tn
- Worked on motion and graphic design for production campaigns

## Skills
- Figma, Adobe XD, Photoshop, After Effects`;

const DEV = `# Safwen Bibeni
Élève ingénieur en informatique, ENIT

## Expérience
**Tamjar.com** : Designer UI/UX et développeur web/mobile (stage, puis temps partiel)
- Développement du tableau de bord marchand en React
- Notions de DevOps

**Wisecool.tn** : Développeur web et mobile (stage)
- Application Android Flutter`;

test("a designer's CV gives design roles and design tools, not developer queries", () => {
  const r = cvKeywords(DESIGNER, "", ["Figma", "Adobe XD", "Photoshop", "C"]);
  assert.deepEqual(r.roles.slice(0, 3), ["UI/UX Designer", "Graphic Designer", "Motion Designer"]);
  assert.deepEqual(r.keywords, ["ui/ux designer", "graphic designer", "motion designer", "figma", "adobe xd", "photoshop"]);
});

test("roles come from the entry lines, a passing mention is not a target, skills fill the rest", () => {
  const r = cvKeywords(DEV, "", ["React", "Flutter", "Node.js"]);
  assert.ok(r.roles.includes("Développeur Web"));
  assert.ok(r.roles.includes("Développeur Mobile"));
  assert.ok(r.roles.includes("UI/UX Designer"));
  assert.ok(!r.roles.includes("Ingénieur DevOps"), "one bullet mention is not a role");
  assert.ok(r.keywords.length <= 6);
  assert.ok(r.keywords.includes("react"));
});

test("an empty CV gives the skills only, and never one-letter queries", () => {
  assert.deepEqual(cvKeywords("", "", ["C", "Python", "SQL"]), { keywords: ["python", "sql"], roles: [] });
});
