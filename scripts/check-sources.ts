// Live health check of every scan provider: `npm run check:sources [kind…]`. Uses the network, so it stays out of
// `npm test`. Keyed boards read their keys from .env.local through providerKey and say "no key" without one;
// keys are never printed and only go to the provider's own API.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Representative handle and keyword per provider: the catalog placeholder, or a real board with open offers (checked 2026-10-31). */
const CASES: Record<string, [handle: string, keyword?: string]> = {
  keejob: ["", "développeur"],
  tanitjobs: ["705/informatique-jobs", "développeur"],
  emploitunisie: ["", "développeur"],
  farojob: ["informatique", "développeur"],
  linkedin: ["Tunisia", "stage"],
  arbeitsagentur: ["Berlin", "Praktikum Informatik"],
  eures: ["fr,de"],
  iamexpat: ["nl,de"],
  jobsch: ["Zurich"],
  jobup: ["Geneve"],
  jobbank: ["Montreal"],
  karriere: ["wien"],
  jooble: ["tunisia"],
  adzuna: ["fr"],
  greenhouse: ["vercel"],
  lever: ["spotify"],
  ashby: ["supabase"],
  workable: ["huggingface"],
  smartrecruiters: ["BoschGroup"],
  recruitee: ["bunq"],
  personio: ["tado"],
  pinpoint: ["lendable"],
  workday: ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"],
  teamtailor: ["career.teamtailor.com"],
  bamboohr: ["hubstaff"],
  breezy: ["breezy"],
  gem: ["soeffects"],
  rippling: ["rippling"],
  flatchr: ["flatchr"],
  jobscore: ["atlanticbt"],
  join: ["justhiringde"],
  softgarden: ["bundesdruckerei"],
  successfactors: ["jobsearch.alstom.com"],
  icims: ["360care"],
  workablejobs: ["ma,eg", "engineer"],
  mycareersfuture: ["", "intern"],
  jobsly: ["", "engineer"],
  drjobpro: ["eg,sa", "software engineer"],
  emploitic: ["", "développeur"],
  devbg: ["", "python"],
  rss: ["https://weworkremotely.com/categories/remote-programming-jobs.rss"],
  careers: ["https://vercel.com/careers"],
};
const DEFAULT_KEYWORD = "developer";
const TIMEOUT_MS = 60_000;

async function main() {
  const env = path.join(process.cwd(), ".env.local");
  if (existsSync(env)) process.loadEnvFile(env);
  // Keys come from .env.local only: point the kv lookup at a throwaway database, never the real one.
  process.env.KHEDMA_DB = path.join(os.tmpdir(), "khedma-check-sources.db");
  const { scanSource, CATALOG, PROVIDER_KINDS } = await import("../src/lib/sources");
  const { mapLimit, scanSignal } = await import("../src/lib/sources/http");
  const { providerKey } = await import("../src/lib/provider-keys");
  const { DEFAULT_SETTINGS } = await import("../src/lib/types");
  const profile = { id: 1 as const, name: "", email: "", headline: "", cv_md: "", skills: [], target_roles: [], target_locations: [], target_types: [], languages: [], settings: DEFAULT_SETTINGS };

  const only = process.argv.slice(2);
  const kinds = PROVIDER_KINDS.filter((k) => !only.length || only.includes(k));
  const rows = await mapLimit([...kinds], 3, async (kind) => {
    const needs = CATALOG.find((c) => c.kind === kind)?.needsEnv ?? [];
    if (needs.some((n) => !providerKey(n))) return { kind, listed: 0, kept: 0, desc: 0, error: "no key", ms: 0 };
    const [handle, keyword = DEFAULT_KEYWORD] = CASES[kind] ?? [""];
    const t0 = Date.now();
    const stop = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const r = await scanSignal.run(stop, () => scanSource({ kind, handle }, profile, { keywords: [keyword], keepAll: true, maxDetails: 3 }));
      const desc = r.jobs.slice(0, 3).filter((j) => j.description.trim().length > 80).length;
      return { kind, listed: r.total, kept: r.jobs.length, desc, error: stop.aborted ? "timeout" : (r.error ?? ""), ms: Date.now() - t0 };
    } catch (e) {
      return { kind, listed: 0, kept: 0, desc: 0, error: (e as Error).message, ms: Date.now() - t0 };
    }
  });

  // Errors name the failing host only: keyed URLs carry the key in the query string.
  const clean = (s: string) => s.replace(/https?:\/\/([^/\s?#]+)\S*/g, "$1").slice(0, 90);
  console.log(["kind".padEnd(16), "listed".padStart(6), "kept".padStart(5), "desc".padStart(4), "ms".padStart(6), " error"].join(" "));
  for (const r of rows) console.log([r.kind.padEnd(16), String(r.listed).padStart(6), String(r.kept).padStart(5), `${r.desc}/3`.padStart(4), String(r.ms).padStart(6), ` ${clean(r.error)}`].join(" "));
  const bad = rows.filter((r) => !r.kept && r.error !== "no key");
  console.log(`\n${rows.length - bad.length}/${rows.length} ok or keyless; failing: ${bad.map((r) => r.kind).join(", ") || "none"}`);
  // Leave nothing behind: fetches still in flight past the timeout would keep the process alive.
  process.exit(0);
}

main();
