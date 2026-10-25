import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADLINE_MAX, linkedinDrafts } from "./linkedin";

const extra = { school: "ENIT", level: "1re année", specialty: "Génie informatique", city: "Tunis", availability: { from: "2027-02-01", to: "" }, places: { countries: ["FR", "REMOTE"], cities: [], remote: "yes" as const } };
const profile = { skills: ["Python", "React", "SQL", "Docker", "Git"], target_roles: ["data"], target_types: ["pfe" as const], headline: "" };

test("LinkedIn drafts only use profile facts and fit the headline limit", () => {
  const fr = linkedinDrafts(profile, extra, "fr");
  assert.match(fr.headline, /^Élève ingénieur \(1re année · Génie informatique\) à ENIT \| Recherche un stage de fin d'études \(PFE\) \(data\) dès février 2027 \| Python · React · SQL · Docker$/);
  assert.match(fr.about, /à ENIT, basé\(e\) à Tunis\./);
  assert.match(fr.about, /Pays visés : France\./);
  assert.ok(!fr.about.includes("Télétravail"));
  const en = linkedinDrafts({ ...profile, skills: Array(40).fill("VeryLongSkillName") }, extra, "en");
  assert.ok(en.headline.length <= HEADLINE_MAX);
});
