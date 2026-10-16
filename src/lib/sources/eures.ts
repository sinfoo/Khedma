// EURES, the European Commission's job mobility portal: every public employment service in the EU/EEA + Switzerland.
// Its search page POSTs to this public endpoint (observed 2026-10-16; body fields read from the page's own bundle).
// One request covers several countries: the handle is a comma list of ISO codes ("fr,de").
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { countryByCode } from "../geo";
import { EURES_COUNTRIES } from "./catalog";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { htmlToText } from "./html";
import { getJson } from "./http";

const SEARCH = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search";

interface EuresJob {
  id?: string;
  title?: string;
  description?: string; // HTML
  creationDate?: number; // epoch ms
  locationMap?: Record<string, string[]>; // { "DE": ["DEA52"] } (NUTS codes)
  positionScheduleCodes?: string[];
  positionOfferingCode?: string; // directhire | temporary | internship | apprenticeship …
  employer?: { name?: string | null };
}
export interface EuresPayload { numberRecords?: number; jvs?: EuresJob[] }

export function euresBody(keyword: string, countries: string[], perPage = 50): string {
  return JSON.stringify({
    resultsPerPage: perPage, page: 1, sortSearch: "BEST_MATCH",
    keywords: [{ keyword, specificSearchCode: "EVERYWHERE" }],
    publicationPeriod: null, occupationUris: [], skillUris: [], requiredExperienceCodes: [], positionScheduleCodes: [], sectorCodes: [],
    educationAndQualificationLevelCodes: [], positionOfferingCodes: [], locationCodes: countries.map((c) => c.toLowerCase()),
    euresFlagCodes: [], otherBenefitsCodes: [], requiredLanguages: [], minNumberPost: null, sessionId: "khedma",
  });
}

export const euresPostingUrl = (id: string) => `https://europa.eu/eures/portal/jv-se/jv-details/${encodeURIComponent(id)}?lang=en`;

export function mapEures(json: EuresPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.jvs ?? []) {
    if (!j.title || !j.id) continue;
    const title = j.title.trim();
    const description = htmlToText(j.description ?? "");
    const codes = Object.keys(j.locationMap ?? {});
    const location = codes.map((c) => countryByCode(c)?.en ?? c).join(" · ") || "Europe";
    out.push({
      title,
      company: j.employer?.name?.trim() || "EURES",
      location,
      remote: guessRemote(`${title} ${description.slice(0, 400)}`),
      url: euresPostingUrl(j.id),
      source: "eures" as SourceKind,
      type: guessType(`${title} ${j.positionOfferingCode ?? ""} ${(j.positionScheduleCodes ?? []).join(" ")}`, description),
      description,
      tags: extractTags(title, description),
      posted_at: j.creationDate ? normalizeDate(j.creationDate) : null,
      deadline: null,
    });
  }
  return out;
}

export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const countries = handle.split(",").map((c) => c.trim().toUpperCase()).filter((c) => EURES_COUNTRIES.has(c));
  if (!countries.length) return { jobs: [], error: "EURES: choose at least one EU country (e.g. fr,de)" };
  const terms = keywords.length ? keywords.slice(0, 3) : ["internship"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<EuresPayload>(SEARCH, { body: euresBody(kw, countries) });
    if (data) jobs.push(...mapEures(data));
    else error = e;
  }
  // The engine matches words anywhere in the text; keep offers whose title carries a keyword word.
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}
