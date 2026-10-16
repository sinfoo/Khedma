// Bundesagentur für Arbeit (Germany's federal job board): official public JSON API, the one its own search page calls.
// List: jobsuche-service/pc/v6/jobs (observed in the site's network traffic, 2026-10-16).
// Detail: pc/v4/jobdetails/{base64(referenznummer)} (v6 detail answers 403). Both take the published public key.
import type { NewJob } from "../db";
import type { SourceKind } from "../types";
import { extractTags, guessRemote, guessType, matchesKeywords, normalizeDate } from "./classify";
import { getJson } from "./http";

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const HEADERS = { "X-API-Key": "jobboerse-jobsuche" };

interface BaJob {
  stellenangebotsTitel?: string;
  stellenangebotsart?: string; // ARBEIT | PRAKTIKUM_TRAINEE | AUSBILDUNG | SELBSTAENDIGKEIT
  firma?: string;
  referenznummer?: string;
  hauptberuf?: string;
  arbeitszeitVollzeit?: boolean;
  vertragsdauer?: string;
  verguetungsangabe?: string; // JAHRESGEHALT | MONATSGEHALT | STUNDENLOHN | KEINE_ANGABEN
  gehaltsspanneVon?: number;
  gehaltsspanneBis?: number;
  stellenlokationen?: { adresse?: { ort?: string; region?: string } }[];
  veroeffentlichungszeitraum?: { von?: string };
  datumErsteVeroeffentlichung?: string;
}
export interface BaPayload { ergebnisliste?: BaJob[]; maxErgebnisse?: number }

export const baSearchUrl = (was: string, wo = "") =>
  `${BASE}/pc/v6/jobs?${new URLSearchParams({ was, size: "50", page: "1", ...(wo && { wo, umkreis: "50" }) })}`;
export const baPostingUrl = (ref: string) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`;
const baDetailUrl = (ref: string) => `${BASE}/pc/v4/jobdetails/${Buffer.from(ref).toString("base64")}`;

const PERIOD: Record<string, string> = { JAHRESGEHALT: "year", MONATSGEHALT: "month", STUNDENLOHN: "hour" };
const fmtEuro = (n: number) => `${Math.round(n).toLocaleString("en-US")} €`;

/** "Salary: 45,000 € – 55,000 € / year" when the employer published a range. */
export function baSalary(j: BaJob): string {
  const per = PERIOD[j.verguetungsangabe ?? ""];
  if (!per || (!j.gehaltsspanneVon && !j.gehaltsspanneBis)) return "";
  const range = [j.gehaltsspanneVon, j.gehaltsspanneBis].filter((x): x is number => !!x).map(fmtEuro).join(" – ");
  return `Salary: ${range} / ${per}`;
}

export function mapBa(json: BaPayload): NewJob[] {
  const out: NewJob[] = [];
  for (const j of json.ergebnisliste ?? []) {
    if (!j.stellenangebotsTitel || !j.referenznummer) continue;
    const title = j.stellenangebotsTitel.trim();
    const ort = j.stellenlokationen?.[0]?.adresse?.ort?.trim();
    const kind = j.stellenangebotsart === "PRAKTIKUM_TRAINEE" ? "internship" : j.stellenangebotsart === "AUSBILDUNG" ? "apprenticeship" : "";
    const description = [
      baSalary(j),
      j.hauptberuf && `Occupation: ${j.hauptberuf}`,
      j.arbeitszeitVollzeit === false ? "Part-time" : "",
      j.vertragsdauer === "BEFRISTET" ? "Fixed-term contract" : j.vertragsdauer === "UNBEFRISTET" ? "Permanent contract" : "",
    ].filter(Boolean).join("\n");
    out.push({
      title,
      company: j.firma?.trim() || "Bundesagentur für Arbeit",
      location: ort ? `${ort}, Germany` : "Germany",
      remote: guessRemote(title),
      url: baPostingUrl(j.referenznummer),
      source: "arbeitsagentur" as SourceKind,
      type: guessType(`${title} ${kind}`, description),
      description,
      tags: extractTags(title, j.hauptberuf ?? ""),
      posted_at: normalizeDate(j.veroeffentlichungszeitraum?.von ?? j.datumErsteVeroeffentlichung),
      deadline: null,
    });
  }
  return out;
}

/** Handle = optional city (searched within 50 km); empty = all of Germany. */
export async function scan(handle: string, keywords: string[] = []): Promise<{ jobs: NewJob[]; error?: string }> {
  const terms = keywords.length ? keywords.slice(0, 3) : ["Praktikum Informatik"];
  const jobs: NewJob[] = [];
  let error: string | undefined;
  for (const kw of terms) {
    const { data, error: e } = await getJson<BaPayload>(baSearchUrl(kw, handle.trim()), { headers: HEADERS });
    if (data) jobs.push(...mapBa(data));
    else error = e;
  }
  const words = keywords.flatMap((k) => k.split(/\s+/)).filter((w) => w.length >= 4);
  return { jobs: jobs.filter((j) => matchesKeywords(j.title, words)), error: jobs.length ? undefined : error };
}

export async function detail(job: NewJob): Promise<Partial<NewJob> | null> {
  const ref = decodeURIComponent(job.url.split("/jobdetail/")[1] ?? "");
  if (!ref) return null;
  const { data } = await getJson<{ stellenangebotsBeschreibung?: string }>(baDetailUrl(ref), { headers: HEADERS });
  const body = data?.stellenangebotsBeschreibung?.replace(/\*\*/g, "").trim();
  return body ? { description: [job.description, body].filter(Boolean).join("\n\n") } : null;
}
