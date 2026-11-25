// Live scholarship calls read from public feeds: parse, keep the real scholarships, extract what the text says.
// Pure functions on text. Heuristics are deliberately simple: a fact that is not clearly stated stays unknown.
// Several publishers forbid republishing their articles: an item's body is read here, in memory, to classify it and
// to find its level, country and deadline. It is never part of a NewCall, so it is never stored or shown.
import { REMOTE_CODE, countryOf } from "../geo";
import { normalizeDate } from "../sources/classify";
import { decodeEntities, htmlToText } from "../sources/html";
import { link, tag } from "../sources/rss";
import type { Feed } from "./feeds";
import { daysBetween } from "./deadline";
import { fieldHits, levelsIn } from "./fields";
import { norm } from "./model";
import type { Funding, Program, StudyField, StudyLevel } from "./types";

export interface FeedItem {
  title: string;
  url: string;
  /** Plain text of the item body. Used for extraction only: see the note at the top of this file. */
  text: string;
  categories: string[];
  /** YYYY-MM-DD */
  published: string | null;
  /** A deadline the feed gives as its own field (JSON feeds), any date format. */
  deadline?: string | null;
}

// ---------- parsing ----------

const allTags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>|<${name}\\b([^>]*)\\/>`, "gi"))]
    .map((m) => decodeEntities((m[2] ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim() || /\bterm\s*=\s*["']([^"']+)["']/i.exec(m[1] ?? m[3] ?? "")?.[1] || "")
    .filter(Boolean);

function parseXml(xml: string): FeedItem[] {
  const kind = /<feed\b/i.test(xml) && !/<rss\b/i.test(xml) ? "entry" : "item";
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(new RegExp(`<${kind}\\b[^>]*>([\\s\\S]*?)<\\/${kind}>`, "gi"))) {
    const it = m[1];
    const title = tag(it, "title")?.replace(/\s+/g, " ").trim();
    const url = link(it);
    if (!title || !url) continue;
    const body = tag(it, "content:encoded") ?? tag(it, "content") ?? tag(it, "description") ?? tag(it, "summary") ?? "";
    out.push({
      title: htmlToText(title),
      url: decodeEntities(url),
      text: htmlToText(body),
      categories: allTags(it, "category"),
      published: normalizeDate(tag(it, "pubDate") ?? tag(it, "published") ?? tag(it, "updated") ?? tag(it, "dc:date")),
    });
  }
  return out;
}

type Json = Record<string, unknown>;
const str = (...vals: unknown[]) => vals.find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? "";
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** JSON Feed 1.x, or a plain list of records under a usual key (items, data, results, entries, records, hits.hits). */
function parseJson(text: string): FeedItem[] {
  const root: unknown = JSON.parse(text);
  const r = isObj(root) ? root : {};
  const hits = isObj(r.hits) ? r.hits.hits : r.hits;
  const rows = [root, r.items, r.data, r.results, r.entries, r.records, hits].find(Array.isArray) as unknown[] | undefined;
  const out: FeedItem[] = [];
  for (const row of rows ?? []) {
    if (!isObj(row)) continue;
    // Some APIs wrap the record ("metadata", "attributes").
    const o: Json = { ...row, ...(isObj(row.metadata) ? row.metadata : {}), ...(isObj(row.attributes) ? row.attributes : {}) };
    const links = isObj(row.links) ? row.links : {};
    const title = str(o.title, o.name, o.position, o.headline);
    // An API link ("/api/jobs/123") becomes the page a person can open ("/jobs/123").
    const url = str(o.url, o.external_url, o.link, o.permalink, o.href, links.html, links.self, links.json).replace(/^(https?:\/\/[^/]+)\/api\/(\w+\/\d+)$/, "$1/$2");
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const tags = [o.tags, o.categories, o.keywords, o.ranks, o.regions].filter(Array.isArray).flat() as unknown[];
    const hosts = (Array.isArray(o.institutions) ? o.institutions : []).map((x: unknown) => (isObj(x) ? str(x.value, x.name) : "")).filter(Boolean);
    out.push({
      title: htmlToText(title),
      url,
      text: (hosts.length ? "at " + hosts.join(", ") + "\n" : "") + htmlToText(str(o.content_html, o.content_text, o.description, o.summary, o.body, o.excerpt)),
      categories: tags.map((x) => (isObj(x) ? str(x.name, x.title, x.term) : String(x ?? ""))).filter(Boolean),
      published: normalizeDate(str(o.date_published, o.published, o.published_at, o.pubDate, o.date, o.created, o.created_at) || null),
      deadline: str(o.deadline, o.deadline_date, o.closing_date, o.application_deadline, o.end_date) || null,
    });
  }
  return out;
}

/** Items of a feed body. Throws on JSON that does not parse; XML that holds no items gives an empty list. */
export function parseFeed(body: string, format: Feed["format"]): FeedItem[] {
  return format === "json" ? parseJson(body) : parseXml(body);
}

// ---------- is it a scholarship? ----------

export type ItemKind = "scholarship" | "job" | "event" | "competition" | "news" | "other";

const YES = /\b(scholarships?|bourses?|fellowships?|studentships?|bursar(y|ies)|stipend(s|ium|ien)?|grants?|scholars program(me)?s?|allocations? (de recherche|doctorales?)|contrats? doctora(l|ux)|financements? de these|funded (phd|masters?|doctoral)|tuition waivers?|doctoral networks?|fully[- ]funded|entierement financee?s?)\b/;
const JOB = /\b(recrut\w+|recruit\w+|hiring|vacanc(y|ies)|jobs?|emplois?|postes?|positions?|associate|lecturer|professor\w*|maitre de conferences|engineer|ingenieur|developer|technicien\w*|manager|officer|assistante?|consultant\w*|internships?|stagiaires?|commercia(l|ux)|vendeu\w+|charge\(?e?\)? de|tenders?|appels? d'offres|procurement)\b/;
const EVENT = /\b(conferences?|congress|congres|colloques?|symposium|workshops?|ateliers?|webinars?|webinaires?|seminars?|seminaires?|summit|forum|sessions? d'information|information sessions?|info sessions?|open days?|portes ouvertes|call for papers|appel a (communications?|contributions?|articles))\b/;
const CONTEST = /\b(competitions?|contests?|concours|hackathons?|challenges?|prizes?|prix|awards?|olympiad\w*)\b/;
const NEWS = /\b(winners?|laureats?|announced|results?|resultats?|recap\w*|newsletter|interview|tips|how to|guide|rankings?|classement|fermeture|closed|receives?)\b|^(top|best|latest)\b|^new (?!zealand|york|south wales|brunswick)|^\d{1,3}\+?\s/;
const CALL = /\b(appels? a candidatures?|call for applications?|applications?\b.{0,40}\bopen|candidatures? ouvertes?|apply now|program(me)? application)\b/;

/**
 * What a feed is, beyond its format. positions: every item is a funded research position, so a job word in the
 * title does not disqualify it. funder: the funder's own feed, where "Appel à candidature" is a call even when the
 * item has no description.
 */
const FEED_HINTS: Record<string, { kind?: "positions" | "funder"; host?: string }> = {
  "inspire-phd": { kind: "positions" },
  "inspire-postdoc": { kind: "positions" },
  "daad-tunisie": { kind: "funder", host: "DE" },
  // One university's own list: the host is known even when a title does not say it.
  "cambridge-studentships": { host: "GB" },
};

/**
 * What a feed item is, from its title first. A scholarship word in the title wins over a job or prize word
 * ("Prize Fellowship"), but a list of scholarships ("Top 20 scholarships") is news and an event that only talks
 * about scholarships ("Webinar: how to apply for a grant") is an event.
 */
export function classifyItem(item: Pick<FeedItem, "title" | "text" | "categories">, feedId = ""): ItemKind {
  const title = norm(item.title);
  const hint = FEED_HINTS[feedId]?.kind;
  if (NEWS.test(title) || item.categories.some((c) => /^list of\b/i.test(c))) return "news";
  const yes = YES.exec(title);
  const event = EVENT.exec(title);
  if (event && (!yes || event.index < yes.index)) return "event";
  if (yes || hint === "positions") return "scholarship";
  if (JOB.test(title)) return "job";
  if (CONTEST.test(title)) return "competition";
  if (item.categories.some((c) => YES.test(norm(c)))) return "scholarship";
  if (CALL.test(title) && (hint === "funder" || YES.test(norm(item.text.slice(0, 600))))) return "scholarship";
  return "other";
}

// ---------- facts from the text ----------

type Texts = Pick<FeedItem, "title" | "text" | "categories">;
/** Tags that describe the call itself. Aggregators also tag who may apply ("scholarships for Tunisians", "Africa"). */
const ownTags = (item: Texts) => item.categories.filter((c) => !/\b(for|pour)\b|africa|asia|europe|america\b|oceania/i.test(c));
/** The few tags worth keeping: short labels, not slugs ("x-y-2027 apply"), sentences or the title again. */
const cleanTags = (item: Texts) => {
  const title = norm(item.title);
  const tags = ownTags(item).map((c) => c.replace(/`/g, "").replace(/\s+/g, " ").trim());
  return [...new Set(tags)].filter((c) => c.length >= 3 && c.length <= 32 && !/\w-\w+-\w|[.!?]$|^uncategori[sz]ed$/i.test(c) && !title.includes(norm(c))).slice(0, 6);
};

/** The title says it best; then the feed's tags; then the first lines of the body. */
export function extractLevels(item: Texts): StudyLevel[] {
  for (const text of [item.title, item.categories.join("\n"), item.text.slice(0, 600)]) {
    const found = levelsIn(text);
    if (found.length) return found;
  }
  return [];
}

/** Up to three fields from the title, else from the tags. Bodies name every faculty, and four fields or more means "any". */
export function extractFields(item: Texts): StudyField[] {
  for (const text of [item.title, ownTags(item).join("\n")]) {
    const hits = Object.entries(fieldHits(text)) as [StudyField, number][];
    if (hits.length) return hits.length > 3 ? [] : hits.sort((a, b) => b[1] - a[1]).map(([f]) => f);
  }
  return [];
}

// Host countries scholarships name that Khedma's job-market list does not know yet.
// ponytail: drop this table when geo.ts learns these countries.
const MORE_HOSTS: [string, RegExp][] = [
  ["CN", /\b(china|chine|chinese (government|academy|universit\w+)|beijing|shanghai)\b/],
  ["TH", /\b(thailand|thailande|thai (government|universit\w+))\b/],
  ["HK", /\bhong kong\b/],
  ["TW", /\btaiwan\b/],
  ["RU", /\b(russia|russie|moscow|moscou)\b/],
  ["ZA", /\b(south africa|afrique du sud|cape town)\b/],
  ["ID", /\b(indonesia|indonesie)\b/],
  ["VN", /\bviet ?nam\b/],
  ["PK", /\bpakistan\b/],
  ["KZ", /\bkazakhstan\b/],
  ["CY", /\b(cyprus|chypre)\b/],
  ["MT", /\b(malta|malte)\b/],
  ["MU", /\b(mauritius|ile maurice)\b/],
  ["JO", /\b(jordan|jordanie)\b/],
  ["LB", /\b(lebanon|liban)\b/],
];
const hostOf = (text: string): string | null => {
  const code = countryOf(text);
  if (code && code !== REMOTE_CODE) return code;
  const t = norm(text);
  return MORE_HOSTS.find(([, re]) => re.test(t))?.[0] ?? null;
};

const PLACE = /(?:^|[\s(])(?:in|at|en|au|aux|à|dans)\s*:?\s+([^,.;:()\n|]{2,70})/gi;
function placesIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(PLACE)) {
    // "in Germany for Tunisian students": the applicants' country is not the host.
    const code = hostOf(m[1].split(/\s+(?:for|from|pour|by|with)\s+/i)[0]);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Host countries: places after "in / at / en / au" in the title, else the one country among the tags, else the first lines. */
export function extractCountries(item: Texts): string[] {
  const fromTitle = placesIn(item.title);
  if (fromTitle.length) return fromTitle.slice(0, 3);
  const fromTags = [...new Set(ownTags(item).map((c) => hostOf(c)).filter((c): c is string => !!c))];
  if (fromTags.length === 1) return fromTags;
  return placesIn(item.text.slice(0, 300)).slice(0, 1);
}

export function extractFunding(item: Pick<FeedItem, "title" | "text">): Funding | null {
  const t = norm(`${item.title}\n${item.text.slice(0, 1200)}`);
  if (/\b(fully[- ]funded|full(y)? (scholarships?|funding|tuition and)|bourses? (complete|integrale)s?|entierement financee?s?|prise en charge (totale|complete))\b/.test(t)) return "full";
  if (/\b(partial(ly)?[- ]?(funded|funding|scholarships?)?|bourses? partielles?|partiellement financee?s?)\b/.test(t)) return "partial";
  if (/\b(tuition (fee )?(waivers?|reductions?|discounts?)|exoneration des frais|frais de scolarite (offerts|pris en charge))\b/.test(t)) return "tuition";
  if (/\b(travel grants?|mobility grants?|bourses? de (mobilite|voyage)|aides? a la mobilite)\b/.test(t)) return "mobility";
  if (/\b(monthly (stipend|allowance)|living allowance|allocation mensuelle|stipend of)\b/.test(t)) return "stipend";
  return null;
}

const MONTH = "jan(?:uary|vier|v)?|feb(?:ruary)?|fev(?:rier|r)?|mar(?:ch|s)?|apr(?:il)?|avr(?:il)?|may|mai|june?|juin|july?|juil(?:let)?|aug(?:ust)?|aout|sep(?:t(?:ember|embre)?)?|oct(?:ober|obre)?|nov(?:ember|embre)?|dec(?:ember|embre)?";
const CUE = /\b(deadlines?|closing dates?|closes?( on)?|apply (by|before)|applications? (are )?(due|close[sd]?)|due date|dates? limites?|date de cloture|cloture|avant le|jusqu'au|au plus tard|until|bewerbungsschluss)\b/g;

/** A date written in `s` (already norm()ed), read as day-month-year; a date without a year is the next one after `base`. */
function dateIn(s: string, base: string): string | null {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(s);
  if (iso) return normalizeDate(iso[1]);
  const dmy = /\b(\d{1,2}[/.]\d{1,2}[/.]\d{4})\b/.exec(s);
  if (dmy) return normalizeDate(dmy[1]);
  // "November 12th, 2026" -> "12 november 2026"
  const text = s.replace(new RegExp(`\\b(${MONTH})\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})\\b`), "$2 $1 $3").replace(/\b(\d{1,2})(?:st|nd|rd|th|er)\b/g, "$1");
  const full = new RegExp(`\\b(\\d{1,2}) (${MONTH})\\.?,? (\\d{4})\\b`).exec(text);
  if (full) return normalizeDate(`${full[1]} ${full[2]} ${full[3]}`);
  const short = new RegExp(`\\b(\\d{1,2}) (${MONTH})\\b|\\b(${MONTH}) (\\d{1,2})\\b`).exec(text);
  if (!short) return null;
  const [day, month] = short[1] ? [short[1], short[2]] : [short[4], short[3]];
  const year = Number(base.slice(0, 4));
  const guess = normalizeDate(`${day} ${month} ${year}`);
  return guess && guess < base ? normalizeDate(`${day} ${month} ${year + 1}`) : guess;
}

/**
 * The application deadline: the feed's own field, else the first date written right after a deadline word, else a
 * tag that is a month ("feb 2027": the last day of that month).
 */
export function extractDeadline(item: Pick<FeedItem, "title" | "text" | "published" | "deadline"> & { categories?: string[] }, today: string): string | null {
  const base = item.published ?? today;
  const ok = (d: string | null) => (d && Math.abs(daysBetween(base, d)) <= 730 ? d : null);
  if (item.deadline) return ok(normalizeDate(item.deadline) ?? dateIn(norm(item.deadline), base));
  const t = norm(`${item.title}\n${item.text}`).replace(/\s+/g, " ");
  for (const m of t.matchAll(CUE)) {
    const found = ok(dateIn(t.slice(m.index + m[0].length, m.index + m[0].length + 60), base));
    if (found) return found;
  }
  for (const c of item.categories ?? []) {
    const m = new RegExp("^(" + MONTH + ")\\.? (\\d{4})$").exec(norm(c).trim());
    const first = m && normalizeDate("1 " + m[1] + " " + m[2]);
    if (first) return ok(first.slice(0, 8) + new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate());
  }
  return null;
}

const TN_OK = /\b(tunisi\w+|africa|africans?|african (students|countries|scholars|nationals|women|researchers|youth|professionals|changemakers)|afrique|africaine?s?|arab\w*|mena|maghreb\w*|global south|developing countr\w+|pays en (voie de )?developpement|international (students|applicants|scholars)|etudiants (internationaux|etrangers)|all nationalities|any nationality|toutes (les )?nationalites|francophon\w+|worldwide)\b/;
const NATION = "south africa|nigeria|kenya|ghana|uganda|tanzania|rwanda|ethiopia|zimbabwe|zambia|malawi|cameroo?n|senegal|cote d'ivoire|benin|togo|burkina faso|mali|niger|gabon|congo|egypt|morocco|maroc|algeria|algerie|india|pakistan|bangladesh|nepal|indonesia|philippines|china";
const PEOPLE = "south africans?|nigerians?|kenyans?|ghanaians?|ugandans?|tanzanians?|rwandans?|ethiopians?|zimbabweans?|zambians?|malawians?|cameroonians?|camerounais|senegalese|senegalais|ivoiriens?|ivorians?|beninois|togolais|burkinabe|maliens?|nigeriens?|gabonais|congolais|egyptians?|moroccans?|marocains?|algerians?|algeriens?|indians?|pakistanis?|bangladeshis?|nepalese|indonesians?|filipinos?|chinese|americans?|canadians?";
const OTHERS = new RegExp(
  "\\b(" + PEOPLE + ") (students?|nationals?|citizens?|women|youth|people|scholars?|researchers?|graduates?|applicants?)\\b" +
    "|\\b(south africans|nigerians|kenyans|ghanaians|ugandans|tanzanians|rwandans|ethiopians|zimbabweans|zambians|malawians|cameroonians|egyptians|moroccans|algerians|indians|pakistanis|bangladeshis|indonesians|filipinos|americans|canadians)\\b" +
    "|\\b(students?|youth|citizens?|residents?|etudiants?) (in|from|of|du|de|au|en) (" + NATION + ")\\b|\\((" + NATION + ")\\)|\\b(us|uk|eu) (citizens|nationals|students)\\b|\\bhome (fees?|students)\\b" +
    // French-language aggregators write for their own country: its name or people in the title is the audience.
    "|\\b(camerounais|senegalais|ivoiriens?|beninois|togolais|gabonais|congolais|burkinabe|maliens?|nigeriens?|senegal|dakar|cameroun|cameroon|yaounde|douala|cote d'ivoire|abidjan|benin|togo|burkina faso|gabon)\\b",
);

/**
 * Can a Tunisian apply, as far as the feed says? true when the title or an audience tag names Tunisians, Africans,
 * Arab, developing or all countries; false when it names only another nationality ("for young South Africans",
 * "(Sénégal)"); null when it says nothing.
 */
export function extractTunisia(item: Pick<FeedItem, "title" | "categories">): boolean | null {
  // "scholarships for tunisians", "scholarships for any developing country": one tag per audience (Scholars4Dev).
  const audience = item.categories.map(norm).filter((c) => /^(scholarships?|bourses?) (for|pour)\b/.test(c));
  // A real nationality list is long; one or two such tags ("scholarships for women") say nothing about countries.
  if (audience.length >= 5) return audience.some((c) => TN_OK.test(c));
  const title = norm(item.title);
  // "South Africans" are not "Africans" at large.
  if (TN_OK.test(title.replace(/south africa\w*/g, " "))) return true;
  return OTHERS.test(title) ? false : null;
}

/** One key per page: https, no "www.", no tracking parameters, no fragment, no trailing slash. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_\w+|fbclid|gclid|mc_[ce]id|ref|source)$/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const q = u.searchParams.toString();
    return `https://${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${q ? `?${q}` : ""}`;
  } catch {
    return raw.trim();
  }
}

// Words that many programmes share: kinds of award, levels, and the places that follow "in".
const GENERIC = new Set(
  ("scholarship scholarships programme programmes program programs bourse bourses fellowship fellowships grant grants award awards international student students " +
    "master masters doctoral phd graduate research study studies government university universite foundation joint european worldwide " +
    "france germany italy austria canada japan tunisia tunisie africa the for and of de des du la le les en pour et").split(" "),
);
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
const KIND = /scholarship|fellowship|grant|award|bourse/g;

/**
 * The curated programme a call belongs to, only when it clearly names it: every distinctive word of the programme's
 * name (what stands before its parentheses) is in the title ("DAAD EPOS scholarships 2027" -> "daad-epos").
 * One short word is not proof. Two programmes that fit equally well ("Eiffel master", "Eiffel doctorat") are told
 * apart by the level the title names, or not matched at all.
 */
export function matchProgram(title: string, programs: (Pick<Program, "id" | "name"> & { levels?: StudyLevel[] })[]): string | null {
  const words = new Set(tokens(title));
  let best: typeof programs = [];
  let size = 0;
  for (const p of programs) {
    const core = p.name.replace(/\([^)]*\)/g, " ");
    const need = tokens(core);
    if (!need.length || (need.length === 1 && need[0].length < 6) || !need.every((w) => words.has(w))) continue;
    // A lone name ("Humboldt") also needs the kind of award to agree: a "Humboldt Residency" is not the "Humboldt Research Fellowship".
    const kinds = norm(core).match(KIND) ?? [];
    if (need.length === 1 && kinds.length && !kinds.some((k) => title.toLowerCase().includes(k))) continue;
    if (need.length > size) [best, size] = [[p], need.length];
    else if (need.length === size) best.push(p);
  }
  if (best.length > 1) {
    const levels = levelsIn(title);
    best = best.filter((p) => p.levels?.some((l) => levels.includes(l)));
  }
  return best.length === 1 ? best[0].id : null;
}

/** A scholarship call ready to store. */
export interface NewCall {
  urlKey: string;
  url: string;
  feed: string;
  title: string;
  /** The feed's own tags about the call (level, country, theme), at most eight. */
  tags: string[];
  levels: StudyLevel[];
  fields: StudyField[];
  countries: string[];
  funding: Funding | null;
  deadline: string | null;
  /** Whether a Tunisian can apply, when the feed says. */
  tunisia: boolean | null;
  programId: string | null;
  published: string | null;
}

/** Feed items -> scholarship calls: non-scholarships dropped, facts extracted, one call per canonical URL. */
export function toCalls(items: FeedItem[], feed: Pick<Feed, "id">, programs: Pick<Program, "id" | "name">[], today: string): NewCall[] {
  const seen = new Set<string>();
  const out: NewCall[] = [];
  for (const it of items) {
    if (classifyItem(it, feed.id) !== "scholarship") continue;
    const urlKey = canonicalUrl(it.url);
    if (seen.has(urlKey)) continue;
    seen.add(urlKey);
    out.push({
      urlKey,
      url: it.url,
      feed: feed.id,
      title: it.title.slice(0, 300),
      tags: cleanTags(it),
      levels: extractLevels(it),
      fields: extractFields(it),
      countries: ((found) => (found.length ? found : FEED_HINTS[feed.id]?.host ? [FEED_HINTS[feed.id].host!] : []))(extractCountries(it)),
      funding: extractFunding(it),
      deadline: extractDeadline(it, today),
      tunisia: extractTunisia(it),
      programId: matchProgram(it.title, programs),
      published: it.published,
    });
  }
  return out;
}
