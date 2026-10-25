// Public registers of employers allowed to sponsor work visas: the UK register of licensed sponsors (workers) and
// the Dutch IND register of recognised sponsors (work). Being listed does not mean an employer sponsors interns:
// the UI shows it as a hint. Downloaded at most once a week and kept in kv. Server only.
import { kvGet, kvSet } from "./db";
import { getJson, getText } from "./sources/http";

export type SponsorCountry = "GB" | "NL";
const WEEK = 7 * 86_400_000;
const UK_PAGE = "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";
const NL_PAGE = "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

/** "Acme Holding B.V.", "ACME LIMITED", "Acme Ltd t/a Acme Labs" -> "acme". Same rule on both sides of the lookup. */
export function sponsorKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bt\/a\b.*$/, "")
    .replace(/["'’.,()&]/g, " ")
    .replace(/\b(b ?v|n ?v|ltd|limited|plc|llp|llc|inc|gmbh|sarl|sas|uk|nederland|netherlands|holding|holdings|group|international|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Organisation names from the UK register CSV (first column; quoted fields may hold commas). */
export function parseUkRegister(csv: string): string[] {
  const out: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const m = /^\s*"((?:[^"]|"")*)"|^([^,]*)/.exec(line);
    const name = (m?.[1]?.replace(/""/g, '"') ?? m?.[2] ?? "").trim();
    if (name) out.push(name);
  }
  return out;
}

/** Organisation names from the IND register page (one `<th scope="row">` per sponsor). */
export function parseNlRegister(html: string): string[] {
  return [...html.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/""/g, '"').trim()).filter(Boolean);
}

async function download(country: SponsorCountry): Promise<string[] | null> {
  if (country === "GB") {
    // The CSV gets a new URL every day; the publication's content API names the current one.
    const { data } = await getJson<{ details?: { attachments?: { url?: string }[] } }>(UK_PAGE);
    const url = data?.details?.attachments?.map((a) => a.url ?? "").find((u) => u.endsWith(".csv"));
    if (!url) return null;
    const { text } = await getText(url, "text/csv", { timeoutMs: 60_000 });
    return text ? parseUkRegister(text) : null;
  }
  const { text } = await getText(NL_PAGE, "text/html", { timeoutMs: 60_000 });
  return text ? parseNlRegister(text) : null;
}

const memo = new Map<SponsorCountry, { at: number; keys: Set<string> }>();

/** The register as normalised names, refreshed weekly; a failed download keeps the last copy. Null when none is known. */
export async function sponsorRegister(country: SponsorCountry): Promise<Set<string> | null> {
  const hit = memo.get(country);
  if (hit && Date.now() - hit.at < WEEK) return hit.keys;
  const stored = kvGet<{ at: number; keys: string[] } | null>(`sponsors:${country}`, null);
  if (stored && Date.now() - stored.at < WEEK) {
    const keys = new Set(stored.keys);
    memo.set(country, { at: stored.at, keys });
    return keys;
  }
  const names = await download(country);
  if (!names?.length) return stored ? new Set(stored.keys) : null;
  const keys = [...new Set(names.map(sponsorKey).filter(Boolean))];
  kvSet(`sponsors:${country}`, { at: Date.now(), keys });
  const set = new Set(keys);
  memo.set(country, { at: Date.now(), keys: set });
  return set;
}

/** Is this employer on the country's sponsor register? Null when the register cannot be read. */
export async function isListedSponsor(company: string, country: SponsorCountry): Promise<boolean | null> {
  const key = sponsorKey(company);
  if (!key) return false;
  const reg = await sponsorRegister(country);
  return reg ? reg.has(key) : null;
}
