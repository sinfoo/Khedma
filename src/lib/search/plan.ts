// Which boards a search queries. Driven by the chosen countries, not by the saved sources list:
// every catalog board of a chosen country runs, worldwide boards run once, LinkedIn once per country,
// and the user's saved sources (tracked companies included) join when they fit. Pure: client-safe.
import { countryByCode, REMOTE_CODE } from "../geo";
import { CATALOG, EURES_COUNTRIES, isProviderKind, type CatalogEntry, type ProviderKind } from "../sources/catalog";

export type Remote = "yes" | "only" | "no";

export interface PlanSource {
  id: number;
  kind: string;
  label: string;
  handle?: string;
  keywords?: string[];
  keep_all?: boolean;
  company?: boolean;
  enabled?: boolean;
}

export interface PlanRun {
  /** `${kind}:${handle}` — stable id for progress events. */
  key: string;
  kind: ProviderKind;
  handle: string;
  label: string;
  /** ISO country of the board, or "INT". */
  country: string;
  keywords: string[];
  sourceId?: number;
  company?: boolean;
  keepAll?: boolean;
}

export interface PlanSkipped {
  label: string;
  reason: "country" | "remote" | "env";
}

export interface SearchPlan {
  runs: PlanRun[];
  skipped: PlanSkipped[];
}

/** Worldwide boards that only list remote work. */
export const REMOTE_BOARDS: ReadonlySet<string> = new Set(["remoteok", "jobicy", "himalayas", "remotive", "aijobs", "findwork", "weworkremotely"]);
/** Company career boards: country-less, they always run when the user has them. */
export const COMPANY_KINDS: ReadonlySet<string> = new Set(["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "recruitee", "personio", "pinpoint", "workday", "teamtailor", "bamboohr", "breezy", "gem", "rippling", "flatchr", "jobscore", "join", "softgarden", "successfactors", "icims", "rss", "careers"]);
// LinkedIn's guest search is rate-limited: one request per keyword per country.
const MAX_LINKEDIN = 4;

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** A catalog board that can run with no handle: open listing, "all offers" category, or city-less country search. */
function autoRunnable(e: CatalogEntry): boolean {
  if (e.linkOnly || e.needsEnv?.length || e.kind === "linkedin" || COMPANY_KINDS.has(e.kind)) return false;
  if (e.handle.type === "none") return true;
  if (e.handle.type === "select") return e.handle.options.some((o) => o.value === "");
  return e.handle.type === "slug" && e.country !== "INT";
}

export function planSearch(input: {
  keywords: string[];
  countries: string[];
  cities?: string[];
  remote?: Remote;
  enabledSources?: PlanSource[];
  catalog?: CatalogEntry[];
  /** Kinds whose API key env var is not set: saved sources of these kinds are skipped. */
  missingEnv?: string[];
  /** Used when neither the search nor the saved source has keywords. */
  defaultKeywords?: string[];
}): SearchPlan {
  const catalog = input.catalog ?? CATALOG;
  const keywords = uniq(input.keywords);
  const chosen = uniq(input.countries).filter((c) => c !== REMOTE_CODE);
  const remoteChip = input.countries.includes(REMOTE_CODE);
  const remote: Remote = input.remote ?? "yes";
  const wantRemote = remote !== "no" || remoteChip;
  // Nothing chosen at all = home market; "remote only" = no country boards.
  const targets = chosen.length ? chosen : remoteChip || remote === "only" ? [] : ["TN"];
  const kw = (own?: string[]) => (keywords.length ? keywords : own?.length ? uniq(own) : (input.defaultKeywords ?? []));
  const rank = (country: string, company?: boolean) => (company ? 60 : country === "INT" ? 50 : Math.max(0, targets.indexOf(country)));

  const runs = new Map<string, PlanRun>();
  const skipped: PlanSkipped[] = [];
  const add = (r: PlanRun) => runs.set(r.key, r);

  const saved = (input.enabledSources ?? []).filter((s) => s.enabled !== false && isProviderKind(s.kind));
  // A saved board of a kind replaces the catalog's default run of that kind (category, city and keywords chosen by the user).
  // Paused boards count too: switching Keejob off must not bring the default Keejob run back.
  const savedKinds = new Set((input.enabledSources ?? []).filter((s) => isProviderKind(s.kind) && !s.company).map((s) => s.kind));

  for (const e of catalog) {
    if (!autoRunnable(e) || savedKinds.has(e.kind)) continue;
    if (e.country === "INT") {
      if (REMOTE_BOARDS.has(e.kind) && !wantRemote) continue;
      add({ key: `${e.kind}:`, kind: e.kind as ProviderKind, handle: "", label: e.name, country: "INT", keywords: kw() });
    } else if (targets.includes(e.country)) {
      add({ key: `${e.kind}:`, kind: e.kind as ProviderKind, handle: "", label: e.name, country: e.country, keywords: kw() });
    }
  }

  for (const s of saved) {
    const e = catalog.find((c) => c.kind === s.kind);
    if (!e) continue;
    if (input.missingEnv?.includes(s.kind)) {
      skipped.push({ label: s.label, reason: "env" });
      continue;
    }
    const handle = s.handle ?? "";
    const base = { kind: s.kind as ProviderKind, handle, label: s.label, keywords: kw(s.keywords), sourceId: s.id, keepAll: s.keep_all };
    if (s.kind === "linkedin") {
      // A location-less LinkedIn source is covered by the per-country runs below.
      if (handle) add({ ...base, key: `linkedin:${handle}`, country: "INT" });
      continue;
    }
    if (s.company || COMPANY_KINDS.has(s.kind)) {
      add({ ...base, key: `${s.kind}:${handle}`, country: "INT", company: true });
    } else if (e.country === "INT") {
      if (REMOTE_BOARDS.has(s.kind) && !wantRemote) skipped.push({ label: s.label, reason: "remote" });
      else add({ ...base, key: `${s.kind}:${handle}`, country: "INT" });
    } else if (targets.includes(e.country)) {
      add({ ...base, key: `${s.kind}:${handle}`, country: e.country });
    } else skipped.push({ label: s.label, reason: "country" });
  }

  for (const code of targets.slice(0, MAX_LINKEDIN)) {
    const c = countryByCode(code);
    const location = code === "TN" && input.cities?.length ? `${input.cities[0]}, Tunisia` : (c?.search ?? code);
    add({ key: `linkedin:${location}`, kind: "linkedin", handle: location, label: `LinkedIn · ${c?.fr ?? code}`, country: code, keywords: kw() });
  }

  // EURES covers every chosen EU/EEA country in one request.
  const eu = targets.filter((c) => EURES_COUNTRIES.has(c));
  if (eu.length && !runs.has(`eures:${eu.join(",").toLowerCase()}`)) {
    add({ key: `eures:${eu.join(",").toLowerCase()}`, kind: "eures", handle: eu.join(",").toLowerCase(), label: `EURES · ${eu.join(", ")}`, country: eu[0], keywords: kw() });
  }

  return {
    runs: [...runs.values()].sort((a, b) => rank(a.country, a.company) - rank(b.country, b.company)),
    skipped,
  };
}

/** Explicit "scan these sources" (Sources page): every given source runs, whatever the countries. */
export function planSources(sources: PlanSource[], keywords: string[], defaultKeywords: string[] = []): SearchPlan {
  const kw = uniq(keywords);
  const runs: PlanRun[] = [];
  for (const s of sources) {
    if (!isProviderKind(s.kind)) continue;
    const e = CATALOG.find((c) => c.kind === s.kind);
    const handle = s.handle ?? "";
    runs.push({
      key: `${s.kind}:${handle}`,
      kind: s.kind,
      handle,
      label: s.label,
      country: e?.country ?? "INT",
      keywords: kw.length ? kw : s.keywords?.length ? uniq(s.keywords) : defaultKeywords,
      sourceId: s.id,
      company: s.company || COMPANY_KINDS.has(s.kind),
      keepAll: s.keep_all,
    });
  }
  return { runs, skipped: [] };
}
