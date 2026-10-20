import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type Job, type Profile } from "../types";
import { capInferred, classifyCompanyType, compReliability, computeLegitimacy, heuristicEvaluateV2, heuristicRequirements, shapeRequirements, sortRequirements } from "./eval-v2";
import { applyGates, eligibilityGates } from "./gates";
import { triageScore, TRIAGE_MARGINAL, TRIAGE_PASS } from "./triage";

const DESC = `Stage PFE développeur embarqué (6 mois) chez notre PME tunisienne.

Profil recherché :
- Maîtrise du C et de STM32 exigée.
- Connaissance de FreeRTOS et du bus CAN requise.
- Python apprécié, Docker serait un plus.
- Niveau d'anglais professionnel requis.
- Esprit d'équipe et rigueur.

Gratification : 600 DT brut mensuel. Démarrage en février.
Nous utilisons Git au quotidien ; Git, encore Git.`;

const job: Job = {
  id: 1, title: "Stage PFE développeur embarqué STM32", company: "Byrsa Electronics", location: "Tunis", remote: false,
  url: "https://byrsa-electronics.tn/jobs/42", source: "manual", type: "pfe", description: DESC, tags: [],
  posted_at: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), deadline: null, created_at: "2026-10-01", archived: false, starred: false,
};
const profile: Profile = {
  id: 1, name: "Amine", email: "a@example.com", headline: "élève ingénieur en électronique à l'ENIT",
  cv_md: "# Amine\n\n## Projets\n- **Robot suiveur de ligne** — firmware C sur STM32 avec FreeRTOS, 3 mois\n\n## Compétences\n- C, Python, STM32, FreeRTOS, Git\n- Anglais : B2",
  skills: ["C", "Python", "STM32"], target_roles: ["développeur embarqué"], target_locations: ["Tunis"], target_types: ["pfe", "stage"], languages: ["fr", "en"], settings: DEFAULT_SETTINGS,
};

test("requirements: two-pass rules, importance from the posting, match from the CV, ≤12 sorted", () => {
  const rows = heuristicRequirements(job, profile);
  assert.ok(rows.length > 0 && rows.length <= 12);
  const by = (needle: string) => rows.find((r) => r.text.toLowerCase().includes(needle.toLowerCase()));
  const c = by("Maîtrise du C");
  assert.ok(c, "stated C/STM32 row");
  assert.equal(c.importance, "critical"); // STM32 is in the title
  assert.equal(c.evidence, "stated");
  assert.equal(c.met, "yes");
  assert.ok(c.proof.includes("STM32"), "proof quotes the CV");
  const docker = by("Docker");
  assert.ok(docker && docker.importance === "preferred" && docker.met === "partial"); // Python yes, Docker no
  const rtos = by("FreeRTOS");
  assert.ok(rtos && rtos.importance === "high" && rtos.evidence === "stated" && rtos.met === "partial"); // "requise"
  assert.equal(rows.filter((r) => /Git/.test(r.text)).length, 1); // second mention of the same skill is not a new row
  assert.equal(by("rigueur")!.importance, "low_signal"); // soft-skill boilerplate
  assert.ok(rows.every((r) => !(r.evidence === "inferred" && (r.importance === "critical" || r.importance === "high"))));
  // sorted: importance desc, unmet first
  const rank = { critical: 0, high: 1, meaningful: 2, preferred: 3, low_signal: 4 };
  for (let i = 1; i < rows.length; i++) assert.ok(rank[rows[i - 1].importance] <= rank[rows[i].importance]);
});

test("inferred cap and shapeRequirements drop fake proofs and cap at 12", () => {
  assert.equal(capInferred("critical", "inferred"), "meaningful");
  assert.equal(capInferred("critical", "stated"), "critical");
  const raw = Array.from({ length: 20 }, (_, i) => ({ text: `req ${i}`, importance: i === 0 ? "critical" : i % 2 ? "high" : "bogus", evidence: i % 3 ? "inferred" : "stated", met: "yes", proof: i === 0 ? "firmware C sur STM32" : "invented line" }));
  const rows = shapeRequirements(raw, profile.cv_md);
  assert.equal(rows.length, 12);
  assert.equal(rows.find((r) => r.text === "req 0")!.proof, "firmware C sur STM32");
  assert.ok(rows.filter((r) => r.text !== "req 0").every((r) => r.proof === "" && r.met === "partial")); // yes without proof → partial
  assert.ok(rows.every((r) => !(r.evidence === "inferred" && r.importance === "high")));
  const sorted = sortRequirements([
    { text: "b", importance: "high", evidence: "stated", met: "yes", proof: "x" },
    { text: "a", importance: "high", evidence: "stated", met: "no", proof: "" },
    { text: "c", importance: "critical", evidence: "stated", met: "yes", proof: "x" },
  ]);
  assert.deepEqual(sorted.map((r) => r.text), ["c", "a", "b"]);
});

test("legitimacy: penalties and tiers", () => {
  const good = computeLegitimacy(job);
  assert.equal(good.tier, "high");
  assert.ok(good.signals.some((s) => s.key === "fresh"));
  const bad = computeLegitimacy({ ...job, url: "https://bit.ly/x", description: "Short. Contact jobs@gmail.com. Frais de dossier 50 DT.", posted_at: "2025-01-01" });
  const keys = bad.signals.map((s) => s.key);
  for (const k of ["suspicious_domain", "short_description", "webmail_contact", "fees", "age_old"]) assert.ok(keys.includes(k), k);
  assert.equal(bad.tier, "suspicious");
  assert.equal(computeLegitimacy({ ...job, url: "manual://x/y/1", posted_at: null }).signals.find((s) => s.key === "missing_apply_url")?.delta, -40);
  assert.equal(computeLegitimacy({ ...job, url: "not a url" }).signals[0].key, "invalid_url");
  assert.ok(computeLegitimacy({ ...job, url: "https://randomsite.example.com/j/1" }).signals.some((s) => s.key === "company_domain_mismatch"));
  assert.ok(!computeLegitimacy({ ...job, url: "https://boards.greenhouse.io/x/jobs/1" }).signals.some((s) => s.key === "company_domain_mismatch"));
  assert.ok(computeLegitimacy({ ...job, description: DESC + " Salaire 1000 à 2500 DT." }).signals.some((s) => s.key === "wide_pay_range"));
  assert.equal(computeLegitimacy({ ...job, posted_at: null }).tier, "caution"); // no date alone is never suspicious
});

test("company type and comp reliability", () => {
  assert.equal(classifyCompanyType(job), "local_smb");
  assert.equal(classifyCompanyType({ ...job, description: "ESN leader du offshore cherche…" }), "agency");
  assert.equal(classifyCompanyType({ ...job, description: "Cabinet de recrutement pour le compte de notre client" }), "staffing");
  assert.equal(classifyCompanyType({ ...job, description: "nothing specific" }), "unknown");
  assert.equal(compReliability(job), "high"); // "600 DT brut mensuel"
  assert.equal(compReliability({ ...job, description: "Rémunération jusqu'à 1500 DT selon résultats" }), "low");
  assert.equal(compReliability({ ...job, description: "Entre 800 et 1000 DT" }), "medium");
  assert.equal(compReliability({ ...job, description: "No figure" }), "unknown");
});

test("heuristicEvaluateV2 has the full shape and level plan / cv changes are grounded", () => {
  const ev = heuristicEvaluateV2(job, profile);
  assert.ok(ev.global >= 1 && ev.requirements!.length && ev.legitimacy && ev.company_type && ev.comp_reliability && ev.level_plan && ev.cv_changes!.length <= 5 && ev.archetype);
  const senior = heuristicEvaluateV2({ ...job, description: DESC + " 5 ans d'expérience exigés." }, profile);
  assert.match(senior.level_plan!, /5 an/);
});

test("eligibility gates fire only on explicit text and veto triage", () => {
  assert.deepEqual(eligibilityGates(job, profile, [{ name: "Anglais", level: "B2" }]), []);
  const g = eligibilityGates({ ...job, description: DESC + "\nMust be authorized to work in the US without sponsorship." }, profile, []);
  assert.equal(g[0]?.key, "work_auth");
  assert.match(g[0].quote, /without sponsorship/);
  const de = eligibilityGates({ ...job, description: "Allemand courant requis." }, profile, []);
  assert.equal(de[0]?.key, "language_missing");
  const lvl = eligibilityGates({ ...job, description: "Anglais courant requis (C1)." }, profile, [{ name: "Anglais", level: "B2" }]);
  assert.equal(lvl[0]?.key, "language_level");
  assert.equal(lvl[0].level, "flag");
  assert.deepEqual(eligibilityGates({ ...job, description: "Nationalité tunisienne requise. Anglais souhaité." }, profile, []), []);
  const t = triageScore(job, profile, { gates: g });
  assert.equal(t.verdict, "fail");
  assert.match(t.reason, /without sponsorship/);
});

test("triage: thresholds and reasons", () => {
  const pass = triageScore(job, profile);
  assert.ok(pass.score >= TRIAGE_PASS, `score ${pass.score} ${pass.reason}`);
  assert.equal(pass.verdict, "pass");
  const far = triageScore({ ...job, title: "Senior Sales Manager", location: "Lagos", type: "emploi", description: "Vente B2B, 5 ans d'expérience, non rémunéré pendant la période d'essai. Urgent." }, { ...profile, target_types: ["pfe"] });
  assert.equal(far.verdict, "fail");
  assert.ok(far.score < TRIAGE_MARGINAL && far.reason.length > 0);
  assert.equal(far.skipped, false);
});

test("a failed eligibility gate vetoes the verdict and quotes the posting", () => {
  const gates = [{ key: "citizenship" as const, level: "fail" as const, quote: "Must be a French citizen." }];
  const ev = applyGates({ verdict: "apply_now" as const, flags: ["urgent"] }, gates, false);
  assert.equal(ev.verdict, "skip");
  assert.deepEqual(ev.flags, ["eligibility gate: “Must be a French citizen.”", "urgent"]);
  const flagOnly = applyGates({ verdict: "apply" as const, flags: [] }, [{ ...gates[0], level: "flag" as const }], false);
  assert.equal(flagOnly.verdict, "apply");
});
