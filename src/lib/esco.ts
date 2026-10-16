// ESCO (European Skills, Competences, Qualifications and Occupations): the EU's official, multilingual
// occupation and skill classification. Public API, no key: https://ec.europa.eu/esco/api. Server only.
import { kvGet, kvSet } from "./db";
import { fold } from "./sources/classify";
import { getJson } from "./sources/http";

const API = "https://ec.europa.eu/esco/api";
const TTL_MS = 30 * 86_400_000; // ESCO releases a few times a year.

export interface EscoRole {
  role: string;
  occupation: string;
  uri: string;
  essential: string[];
  optional: string[];
}

interface SearchPayload { _embedded?: { results?: { title?: string; uri?: string }[] } }
interface OccupationPayload { title?: string; _links?: { hasEssentialSkill?: { title?: string }[]; hasOptionalSkill?: { title?: string }[] } }

/** "développeur web/développeuse web" -> "développeur web" (ESCO lists both genders in French). */
const firstForm = (s: string) => s.split("/")[0].trim();
const titles = (xs?: { title?: string }[]) => [...new Set((xs ?? []).map((x) => firstForm(x.title ?? "")).filter(Boolean))];

export const escoPortalUrl = (uri: string, lang: string) => `https://esco.ec.europa.eu/${lang}/classification/occupation?uri=${encodeURIComponent(uri)}`;

/** Best ESCO occupation for a target role, with its essential and optional skills. Cached in kv. */
export async function escoRole(role: string, lang: "fr" | "en"): Promise<EscoRole | null> {
  const key = `esco:${lang}:${fold(role)}`;
  const cached = kvGet<{ at: number; value: EscoRole | null } | null>(key, null);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const q = new URLSearchParams({ text: role, type: "occupation", language: lang, limit: "1" });
  const { data: found, error } = await getJson<SearchPayload>(`${API}/search?${q}`);
  if (error) return cached?.value ?? null; // offline: keep the last known answer, do not cache the failure
  const hit = found?._embedded?.results?.[0];
  let value: EscoRole | null = null;
  if (hit?.uri) {
    const { data: occ } = await getJson<OccupationPayload>(`${API}/resource/occupation?${new URLSearchParams({ uri: hit.uri, language: lang })}`);
    if (occ) {
      value = {
        role,
        occupation: firstForm(occ.title ?? hit.title ?? role),
        uri: hit.uri,
        essential: titles(occ._links?.hasEssentialSkill),
        optional: titles(occ._links?.hasOptionalSkill),
      };
    }
  }
  kvSet(key, { at: Date.now(), value });
  return value;
}

const STOP = new Set(["avec", "pour", "dans", "des", "les", "une", "sur", "and", "the", "with", "for", "from", "using", "utiliser", "logiciel", "software"]);
/** Meaningful word stems of a phrase: folded, 4+ letters, cut to 6 characters so "programmation"/"programming" meet. */
export const stems = (s: string) => fold(s).split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 6));

/**
 * Approximate: an ESCO skill counts as "shown in your CV" when most of its meaningful stems appear in the CV.
 * Labels are phrased as actions ("déboguer un logiciel"), so this is a hint for the student, not a verdict.
 */
export function escoCoverage(skills: string[], cvText: string): { skill: string; shown: boolean }[] {
  const cv = new Set(stems(cvText));
  return skills.map((skill) => {
    const s = stems(skill);
    const hits = s.filter((w) => cv.has(w)).length;
    return { skill, shown: s.length > 0 && hits / s.length >= 0.6 };
  });
}
