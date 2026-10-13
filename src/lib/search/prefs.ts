// Work preferences for the search (levels, freshness, blacklists). Pure model: client-safe.
// Stored in kv "search:prefs" by store.ts, not in the profile.

export const LEVELS = ["intern", "entry", "mid"] as const;
export type Level = (typeof LEVELS)[number];
export const HOURS_OLD = [24, 72, 168, 720, 0] as const;
export type HoursOld = (typeof HOURS_OLD)[number];

export interface SearchPrefs {
  levels: Level[];
  /** Drop offers posted more than N hours ago (0 = any age). Offers without a date always pass. */
  hoursOld: HoursOld;
  titleBlacklist: string[];
  companyBlacklist: string[];
  locationReject: string[];
  includeSenior: boolean;
  /** Flag offers at companies you already applied to. */
  applyOnceAtCompany: boolean;
}

export const DEFAULT_PREFS: SearchPrefs = {
  levels: ["intern", "entry"],
  hoursOld: 720,
  titleBlacklist: [],
  companyBlacklist: [],
  locationReject: [],
  includeSenior: false,
  applyOnceAtCompany: true,
};

const list = (v: unknown, max = 30) =>
  [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]+/)).map((s) => String(s ?? "").trim().slice(0, 60)).filter(Boolean))].slice(0, max);

/** Clamp untrusted input (kv JSON or client patch) into valid preferences. */
export function normalizePrefs(raw: unknown): SearchPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const levels = (Array.isArray(r.levels) ? r.levels : DEFAULT_PREFS.levels).filter((l): l is Level => (LEVELS as readonly string[]).includes(l as string));
  const hours = Number(r.hoursOld);
  return {
    levels: levels.length ? [...new Set(levels)] : DEFAULT_PREFS.levels,
    hoursOld: (HOURS_OLD as readonly number[]).includes(hours) ? (hours as HoursOld) : DEFAULT_PREFS.hoursOld,
    titleBlacklist: list(r.titleBlacklist),
    companyBlacklist: list(r.companyBlacklist),
    locationReject: list(r.locationReject),
    includeSenior: r.includeSenior === true,
    applyOnceAtCompany: r.applyOnceAtCompany !== false,
  };
}
