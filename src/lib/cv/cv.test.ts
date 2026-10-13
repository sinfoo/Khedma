import { test } from "node:test";
import assert from "node:assert/strict";
import { headingKey, parseCv, sectionizeToMarkdown, toPlainText } from "./sectionize";
import { cvHealth } from "./health";
import { profileStrength, type StrengthInput } from "./completeness";
import { normalizeExtra } from "./model";
import { markdownToDocx, docxToText } from "./docx";
import { crc32, unzipEntry } from "./zip";

const RAW = `Amira Ben Salah
amira@etudiant-enit.utm.tn | +216 22 123 456 | github.com/amirabs
FORMATION
ENIT – Cycle ingénieur, Génie informatique 2023 - 2026
Expériences professionnelles :
Stage d'été – Vermeg, Tunis 07/2024 - 08/2024
• Développé une API REST en Spring Boot utilisée par 3 équipes
• Réduit le temps de build de 40% avec Docker et GitHub Actions
PROJETS
Plateforme de covoiturage (React, Node.js)
• Conçu le schéma de base de données pour 500 utilisateurs
Compétences techniques
Langages: Python, Java, TypeScript
Langues
Arabe (natif), Français (C1), Anglais (B2)
Vie associative
IEEE ENIT Student Branch 2023 - 2024
- Organisé un hackathon de 120 participants`;

test("headingKey recognises FR/EN headings with accents, case and colons", () => {
  assert.equal(headingKey("FORMATION"), "education");
  assert.equal(headingKey("Education"), "education");
  assert.equal(headingKey("Expériences professionnelles :"), "experience");
  assert.equal(headingKey("## Projects"), "projects");
  assert.equal(headingKey("Compétences techniques"), "skills");
  assert.equal(headingKey("Vie associative"), "activities");
  assert.equal(headingKey("Centres d'intérêt"), "interests");
  assert.equal(headingKey("Développé une API REST en Spring Boot"), null);
});

test("sectionizer builds a Markdown CV with name, contact, sections, entries and bullets", () => {
  const md = sectionizeToMarkdown(RAW);
  assert.match(md, /^# Amira Ben Salah$/m);
  assert.match(md, /amira@etudiant-enit\.utm\.tn · \+216 22 123 456 · github\.com\/amirabs/);
  for (const h of ["Formation", "Expérience", "Projets", "Compétences", "Langues", "Vie associative"]) {
    assert.match(md, new RegExp(`^## ${h}$`, "m"), h);
  }
  assert.match(md, /^### Stage d'été – Vermeg, Tunis 07\/2024 - 08\/2024$/m);
  assert.match(md, /^- Développé une API REST/m);
  assert.match(md, /^- \*\*Langages :\*\* Python, Java, TypeScript$/m);
  const doc = parseCv(md);
  assert.equal(doc.name, "Amira Ben Salah");
  assert.deepEqual(
    doc.sections.map((s) => s.key),
    ["education", "experience", "projects", "skills", "languages", "activities"],
  );
});

test("sectionizer keeps existing Markdown and joins wrapped bullets", () => {
  const md = "# A\n\n## Skills\n\n- Python\n\n## Education\n\nENIT";
  assert.equal(sectionizeToMarkdown(md), md + "\n");
  const wrapped = sectionizeToMarkdown("X Y\nEXPERIENCE\nJob 2024\n- Built a thing that\nspans two lines");
  assert.match(wrapped, /^- Built a thing that spans two lines$/m);
  assert.equal(sectionizeToMarkdown("   "), "");
});

test("toPlainText strips Markdown for ATS", () => {
  const txt = toPlainText("# Name\n\n## Skills\n\n- **Python** and *Go*\n[site](https://x.dev)");
  assert.match(txt, /^SKILLS$/m);
  assert.match(txt, /^- Python and Go$/m);
  assert.match(txt, /site \(https:\/\/x\.dev\)/);
  assert.doesNotMatch(txt, /[#*]/);
});

const base: StrengthInput = {
  name: "",
  email: "",
  headline: "",
  skills: [],
  skill_levels: {},
  langs: [],
  links: { github: "", linkedin: "", portfolio: "" },
  target_roles: [],
  target_locations: [],
  target_types: [],
  cvText: "",
};

test("profile strength is 0 when empty and 100 when complete", () => {
  const empty = profileStrength(base);
  assert.equal(empty.score, 0);
  assert.equal(empty.items.reduce((a, i) => a + i.weight, 0), 100);
  const skills = ["Python", "Java", "React", "Docker", "SQL", "Git", "Linux", "TypeScript"];
  const cv = sectionizeToMarkdown(RAW) + "\n" + "Détail du projet avec plusieurs mots. ".repeat(25);
  const full = profileStrength({
    name: "Amira",
    email: "amira@enit.tn",
    headline: "Élève ingénieure en génie informatique",
    skills,
    skill_levels: Object.fromEntries(skills.map((s) => [s, "intermediate" as const])),
    langs: [{ name: "Arabe", level: "native" }, { name: "Anglais", level: "B2" }],
    links: { github: "https://github.com/a", linkedin: "https://linkedin.com/in/a", portfolio: "" },
    target_roles: ["Développeur Full-Stack"],
    target_locations: ["Tunis"],
    target_types: ["stage"],
    cvText: cv,
  });
  assert.deepEqual(full.items.filter((i) => !i.done).map((i) => i.id), []);
  assert.equal(full.score, 100);
});

test("profile strength flags missing measurable project and over-long CV", () => {
  const noMetric = profileStrength({ ...base, cvText: "# A\n\n## Projects\n\n### App\n- Built an app with React" });
  assert.equal(noMetric.items.find((i) => i.id === "measurable")!.done, false);
  const long = profileStrength({ ...base, cvText: "word ".repeat(1000) });
  assert.equal(long.items.find((i) => i.id === "cv")!.done, true);
  assert.equal(long.items.find((i) => i.id === "cvLength")!.done, false);
});

test("health check: empty CV", () => {
  const r = cvHealth("");
  assert.equal(r.score, 0);
  assert.equal(r.findings[0].id, "empty");
});

test("health check: good CV passes the main rules", () => {
  const r = cvHealth(sectionizeToMarkdown(RAW));
  const ids = r.findings.map((f) => f.id);
  for (const id of ["noEducation", "noExperience", "noSkills", "noEmail", "noPhone", "fewActionVerbs", "fewNumbers", "firstPerson", "dateOrder"] as const) {
    assert.ok(!ids.includes(id), `unexpected ${id}`);
  }
  assert.ok(ids.includes("tooShort"));
  assert.ok(r.stats.quantified >= 3);
});

test("health check rules fire on a weak CV", () => {
  const weak = `# Sami
## Expérience
### Stage 2024 - 2023
- J'ai participé au développement de mon application web pour mon équipe avec beaucoup de motivation et je pense que c'était une très bonne expérience pour moi car j'ai appris énormément de choses intéressantes
- Participation aux réunions
- Responsable de la documentation du projet
### Job 09/2022 - Sept 2023
- Aide sur le support des utilisateurs internes`;
  const r = cvHealth(weak);
  const byId = Object.fromEntries(r.findings.map((f) => [f.id, f]));
  assert.equal(byId.noEducation?.severity, "high");
  assert.equal(byId.noEmail?.severity, "high");
  assert.ok(byId.noSkills);
  assert.ok(byId.fewActionVerbs);
  assert.ok(byId.fewNumbers);
  assert.equal(byId.longBullets?.n, 1);
  assert.ok((byId.firstPerson?.n ?? 0) >= 2);
  assert.equal(byId.dateOrder?.severity, "high");
  assert.ok(byId.dateFormats);
  assert.ok(r.score < 40);
  assert.ok(r.findings[0].severity === "high");
});

test("normalizeExtra clamps untrusted input", () => {
  const x = normalizeExtra({
    school: "ENIT",
    links: { github: "github.com/me", linkedin: "javascript:alert(1)" },
    langs: [{ name: "Anglais", level: "B2" }, { name: "anglais", level: "C1" }, { name: "X", level: "Z9" }],
    skill_levels: { Python: "advanced", Java: "guru" },
    availability: { from: "2026-07-01", to: "nope" },
    onboarding: { step: 42, done: "yes" },
  });
  assert.equal(x.links.github, "https://github.com/me");
  assert.equal(x.links.linkedin, "");
  assert.deepEqual(x.langs, [{ name: "Anglais", level: "B2" }]);
  assert.deepEqual(x.skill_levels, { Python: "advanced" });
  assert.deepEqual(x.availability, { from: "2026-07-01", to: "" });
  assert.deepEqual(x.onboarding, { step: 5, done: false });
  assert.equal(normalizeExtra(undefined).school, "ENIT");
});

test("markdownToDocx produces a valid zip whose document.xml holds the text", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const bytes = markdownToDocx("# Amira\n\n## Expérience\n\n- **Développé** une API & un *outil* <rapide>\nTexte libre", { accent: "#17703f" });
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/styles.xml", "word/_rels/document.xml.rels"]) {
    assert.ok(unzipEntry(bytes, part), part);
  }
  const xml = new TextDecoder().decode(unzipEntry(bytes, "word/document.xml")!);
  assert.match(xml, /<w:pStyle w:val="Title"\/>/);
  assert.match(xml, /<w:b\/><\/w:rPr><w:t xml:space="preserve">Développé<\/w:t>/);
  assert.match(xml, /une API &amp; un /);
  assert.match(xml, /&lt;rapide&gt;/);
  assert.match(new TextDecoder().decode(unzipEntry(bytes, "word/styles.xml")!), /17703f/);
  const text = docxToText(xml);
  assert.match(text, /^Amira$/m);
  assert.match(text, /• Développé une API & un outil <rapide>/);
  assert.match(text, /^Texte libre$/m);
});
