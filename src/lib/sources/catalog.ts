// Provider catalog shown on the Sources page. Pure data: safe to import from client components.
import { countryByCode, countryOf, REMOTE_CODE } from "../geo";

export const PROVIDER_KINDS = [
  "keejob", "tanitjobs", "emploitunisie", "farojob", "linkedin",
  "arbeitnow", "englishjobs_de", "jobsch", "jobup", "jobroom", "englishjobs_ch", "englishjobs_fr", "jobbank", "daijob", "wantedly",
  "remoteok", "jobicy", "himalayas", "remotive", "aijobs", "adzuna", "jooble", "reed", "findwork", "arbeitsagentur", "weworkremotely", "eures", "thehub", "hackernews",
  "greenhouse", "lever", "ashby", "workable", "smartrecruiters", "recruitee", "personio", "pinpoint", "workday", "teamtailor", "bamboohr", "breezy", "gem", "rippling", "flatchr", "jobscore", "join", "softgarden", "successfactors", "icims", "rss", "careers",
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export const isProviderKind = (k: unknown): k is ProviderKind => (PROVIDER_KINDS as readonly unknown[]).includes(k);

/** Sites Khedma cannot read (login, JavaScript or bot walls): shown as ready-made search links only. */
export const LINK_KINDS = [
  "indeed", "google", "stepstone", "xing", "glassdoor", "ziprecruiter", "wellfound",
  "francetravail", "hellowork", "apec", "wttj", "bayt", "landingjobs", "eluta", "workopolis", "gaijinpot", "careercross", "mynavi", "rikunabi",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** Khedma countries covered by EURES (EU/EEA public employment services + Switzerland). */
export const EURES_COUNTRIES: ReadonlySet<string> = new Set(["FR", "DE", "BE", "CH", "NL", "IT", "ES", "LU", "SE", "IE", "PT"]);

/** ISO country code of the board, or "INT" for worldwide boards. */
export type CatalogCountry = "TN" | "DE" | "CH" | "US" | "FR" | "CA" | "JP" | "GB" | "INT";

export interface CatalogEntry {
  kind: ProviderKind | LinkKind;
  name: string;
  country: CatalogCountry;
  /** How offers are read: public JSON API, RSS/Atom feed, Markdown index, listing HTML, or not at all (link). */
  method: "api" | "rss" | "index" | "html" | "link";
  site: string;
  /** What the "handle" field means for this provider. */
  handle: { type: "none" } | { type: "slug"; placeholder: string } | { type: "url"; placeholder: string } | { type: "select"; options: { value: string; label: string }[] };
  /** Provider uses keywords to search (otherwise they only filter locally). */
  keywords: boolean;
  /** Cannot be scanned; only opened in the browser through `searchUrl`. */
  linkOnly?: true;
  /** Free API key(s) read from .env.local; the catalog shows a hint instead of "Add" while one is missing. */
  needsEnv?: string[];
  /** The site's own search page for these keywords and a free-text location (country name or city). `code` is the ISO country. */
  searchUrl?: (keywords: string, location: string, code: string) => string;
}

const enc = encodeURIComponent;
const slug = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const INDEED_HOSTS: Record<string, string> = { TN: "tn", DE: "de", CH: "ch", US: "www", FR: "fr", CA: "ca", JP: "jp", GB: "uk", BE: "be", NL: "nl", IT: "it", ES: "es", MA: "ma", AE: "ae", SA: "sa", QA: "qa", PT: "pt", IE: "ie", SE: "se", LU: "lu", AU: "au", SG: "sg", KR: "kr", DZ: "dz" };
const none = { type: "none" } as const;
const link = (kind: LinkKind, name: string, country: CatalogCountry, site: string, searchUrl: CatalogEntry["searchUrl"]): CatalogEntry => ({
  kind, name, country, method: "link", site, handle: none, keywords: true, linkOnly: true, searchUrl,
});

export const CATALOG: CatalogEntry[] = [
  {
    kind: "linkedin",
    name: "LinkedIn (recherche publique)",
    country: "INT",
    method: "html",
    site: "https://www.linkedin.com/jobs",
    handle: { type: "slug", placeholder: "Tunisia" },
    keywords: true,
    searchUrl: (q, loc) => `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(loc)}`,
  },
  { kind: "keejob", name: "Keejob", country: "TN", method: "index", site: "https://www.keejob.com", handle: none, keywords: true },
  {
    kind: "tanitjobs",
    name: "Tanitjobs",
    country: "TN",
    method: "html",
    site: "https://www.tanitjobs.com",
    handle: {
      type: "select",
      options: [
        { value: "", label: "Toutes les offres" },
        { value: "705/informatique-jobs", label: "Informatique" },
        { value: "381/technologie-de-l-information-jobs", label: "Technologie de l'information" },
        { value: "707/ingenierie-jobs", label: "Ingénierie" },
        { value: "969/electronique-jobs", label: "Électronique" },
        { value: "710/télécommunications-jobs", label: "Télécommunications" },
        { value: "968/mécanique-jobs", label: "Mécanique" },
        { value: "378/industrie-jobs", label: "Industrie" },
      ],
    },
    keywords: true,
  },
  { kind: "emploitunisie", name: "Emploitunisie", country: "TN", method: "html", site: "https://www.emploitunisie.com", handle: none, keywords: true },
  {
    kind: "farojob",
    name: "Farojob",
    country: "TN",
    method: "html",
    site: "https://www.farojob.net",
    handle: {
      type: "select",
      options: [
        { value: "", label: "Toutes les offres" },
        { value: "informatique", label: "Informatique" },
        { value: "telecommunication", label: "Télécommunication" },
        { value: "production", label: "Production" },
        { value: "maintenance-industrielle", label: "Maintenance industrielle" },
        { value: "statistiques", label: "Statistiques" },
      ],
    },
    keywords: true,
  },
  // Germany
  { kind: "arbeitnow", name: "Arbeitnow", country: "DE", method: "api", site: "https://www.arbeitnow.com", handle: none, keywords: true },
  { kind: "englishjobs_de", name: "EnglishJobs.de", country: "DE", method: "html", site: "https://www.englishjobs.de", handle: none, keywords: true },
  { kind: "arbeitsagentur", name: "Bundesagentur für Arbeit", country: "DE", method: "api", site: "https://www.arbeitsagentur.de/jobsuche", handle: { type: "slug", placeholder: "Berlin" }, keywords: true },
  link("stepstone", "StepStone", "DE", "https://www.stepstone.de", (q, loc) => `https://www.stepstone.de/jobs/${slug(q) || "praktikum"}/in-${slug(loc) || "deutschland"}`),
  link("xing", "XING Jobs", "DE", "https://www.xing.com/jobs", (q, loc) => `https://www.xing.com/jobs/search?keywords=${enc(q)}&location=${enc(loc)}`),
  // Switzerland
  { kind: "jobsch", name: "jobs.ch", country: "CH", method: "html", site: "https://www.jobs.ch", handle: { type: "slug", placeholder: "Zurich" }, keywords: true },
  { kind: "jobup", name: "jobup.ch", country: "CH", method: "html", site: "https://www.jobup.ch", handle: { type: "slug", placeholder: "Geneve" }, keywords: true },
  { kind: "jobroom", name: "Job-Room (arbeit.swiss)", country: "CH", method: "api", site: "https://www.job-room.ch", handle: none, keywords: true },
  { kind: "englishjobs_ch", name: "EnglishJobSearch.ch", country: "CH", method: "html", site: "https://www.englishjobsearch.ch", handle: none, keywords: true },
  // France
  { kind: "englishjobs_fr", name: "EnglishJobs.fr", country: "FR", method: "html", site: "https://www.englishjobs.fr", handle: none, keywords: true },
  link("francetravail", "France Travail", "FR", "https://candidat.francetravail.fr", (q) => `https://candidat.francetravail.fr/offres/recherche?motsCles=${enc(q)}&offresPartenaires=true&tri=1`),
  link("hellowork", "HelloWork", "FR", "https://www.hellowork.com", (q, loc) => `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${enc(q)}&l=${enc(loc)}`),
  link("apec", "APEC", "FR", "https://www.apec.fr", (q, loc) => `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${enc(q)}&lieux=${enc(loc)}`),
  // Canada
  { kind: "jobbank", name: "Job Bank (Guichet-Emplois)", country: "CA", method: "html", site: "https://www.jobbank.gc.ca", handle: { type: "slug", placeholder: "Montreal" }, keywords: true },
  link("eluta", "Eluta", "CA", "https://www.eluta.ca", (q, loc) => `https://www.eluta.ca/search?q=${enc(q)}&l=${enc(loc)}`),
  link("workopolis", "Workopolis", "CA", "https://www.workopolis.com", (q, loc) => `https://www.workopolis.com/jobsearch/find-jobs?ak=${enc(q)}&l=${enc(loc)}`),
  // USA
  link("ziprecruiter", "ZipRecruiter", "US", "https://www.ziprecruiter.com", (q, loc) => `https://www.ziprecruiter.com/jobs-search?search=${enc(q)}&location=${enc(loc)}`),
  link("wellfound", "Wellfound", "US", "https://wellfound.com", (q, loc) => `https://wellfound.com/role/l/${slug(q) || "software-engineer"}/${slug(loc) || "united-states"}`),
  link("glassdoor", "Glassdoor", "US", "https://www.glassdoor.com", (q, loc) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${enc(q)}&locKeyword=${enc(loc)}`),
  // Japan
  { kind: "daijob", name: "Daijob", country: "JP", method: "html", site: "https://www.daijob.com", handle: none, keywords: true },
  { kind: "wantedly", name: "Wantedly", country: "JP", method: "api", site: "https://www.wantedly.com", handle: none, keywords: true },
  link("gaijinpot", "GaijinPot Jobs", "JP", "https://jobs.gaijinpot.com", (q) => `https://jobs.gaijinpot.com/index/index/search?keywords=${enc(q)}`),
  link("careercross", "CareerCross", "JP", "https://www.careercross.com", (q) => `https://www.careercross.com/en/job-search/result?keyword=${enc(q)}`),
  link("mynavi", "Mynavi (マイナビ転職)", "JP", "https://tenshoku.mynavi.jp", (q) => `https://tenshoku.mynavi.jp/list/kw${enc(q)}/`),
  link("rikunabi", "Rikunabi NEXT", "JP", "https://next.rikunabi.com", (q) => `https://next.rikunabi.com/rnc/docs/cp_s01880.jsp?kw=${enc(q)}`),
  // United Kingdom
  { kind: "reed", name: "Reed", country: "GB", method: "api", site: "https://www.reed.co.uk", handle: none, keywords: true, needsEnv: ["REED_KEY"] },
  // Worldwide / remote (free JSON APIs)
  { kind: "remoteok", name: "Remote OK", country: "INT", method: "api", site: "https://remoteok.com", handle: none, keywords: true },
  {
    kind: "jobicy",
    name: "Jobicy",
    country: "INT",
    method: "api",
    site: "https://jobicy.com",
    handle: { type: "select", options: [{ value: "", label: "Anywhere" }, { value: "europe", label: "Europe" }, { value: "emea", label: "EMEA" }, { value: "uk", label: "United Kingdom" }, { value: "canada", label: "Canada" }, { value: "usa", label: "United States" }] },
    keywords: true,
  },
  { kind: "himalayas", name: "Himalayas", country: "INT", method: "api", site: "https://himalayas.app", handle: none, keywords: true },
  { kind: "remotive", name: "Remotive", country: "INT", method: "api", site: "https://remotive.com", handle: none, keywords: true },
  { kind: "eures", name: "EURES (European Commission)", country: "INT", method: "api", site: "https://europa.eu/eures", handle: { type: "slug", placeholder: "fr,de" }, keywords: true },
  { kind: "weworkremotely", name: "We Work Remotely", country: "INT", method: "rss", site: "https://weworkremotely.com", handle: none, keywords: false },
  { kind: "aijobs", name: "Artificial Intelligence Jobs", country: "INT", method: "api", site: "https://artificialintelligencejobs.co", handle: none, keywords: true },
  {
    kind: "adzuna",
    name: "Adzuna",
    country: "INT",
    method: "api",
    site: "https://www.adzuna.com",
    handle: {
      type: "select",
      options: [
        { value: "fr", label: "France" }, { value: "de", label: "Germany" }, { value: "ch", label: "Switzerland" }, { value: "be", label: "Belgium" }, { value: "nl", label: "Netherlands" },
        { value: "it", label: "Italy" }, { value: "es", label: "Spain" }, { value: "at", label: "Austria" }, { value: "pl", label: "Poland" }, { value: "gb", label: "United Kingdom" },
        { value: "ca", label: "Canada" }, { value: "us", label: "United States" },
      ],
    },
    keywords: true,
    needsEnv: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  },
  { kind: "jooble", name: "Jooble", country: "INT", method: "api", site: "https://jooble.org", handle: { type: "slug", placeholder: "tunisia" }, keywords: true, needsEnv: ["JOOBLE_KEY"] },
  { kind: "findwork", name: "Findwork", country: "INT", method: "api", site: "https://findwork.dev", handle: none, keywords: true, needsEnv: ["FINDWORK_KEY"] },
  link("indeed", "Indeed", "INT", "https://www.indeed.com", (q, loc, code) => `https://${INDEED_HOSTS[code] ?? "www"}.indeed.com/jobs?q=${enc(q)}&l=${enc(loc)}`),
  link("google", "Google Jobs", "INT", "https://www.google.com", (q, loc) => `https://www.google.com/search?q=${enc(`${q} ${loc}`.trim())}&ibp=htl;jobs`),
  { kind: "greenhouse", name: "Greenhouse", country: "INT", method: "api", site: "https://boards.greenhouse.io", handle: { type: "slug", placeholder: "vercel" }, keywords: false },
  { kind: "lever", name: "Lever", country: "INT", method: "api", site: "https://jobs.lever.co", handle: { type: "slug", placeholder: "qonto" }, keywords: false },
  { kind: "ashby", name: "Ashby", country: "INT", method: "api", site: "https://jobs.ashbyhq.com", handle: { type: "slug", placeholder: "supabase" }, keywords: false },
  { kind: "workable", name: "Workable", country: "INT", method: "api", site: "https://apply.workable.com", handle: { type: "slug", placeholder: "instadeep" }, keywords: false },
  { kind: "smartrecruiters", name: "SmartRecruiters", country: "INT", method: "api", site: "https://jobs.smartrecruiters.com", handle: { type: "slug", placeholder: "soprasteria" }, keywords: false },
  { kind: "recruitee", name: "Recruitee", country: "INT", method: "api", site: "https://recruitee.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "personio", name: "Personio", country: "INT", method: "api", site: "https://www.personio.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "pinpoint", name: "Pinpoint", country: "INT", method: "api", site: "https://www.pinpointhq.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "workday", name: "Workday", country: "INT", method: "api", site: "https://www.workday.com", handle: { type: "url", placeholder: "https://acme.wd5.myworkdayjobs.com/External" }, keywords: false },
  { kind: "teamtailor", name: "Teamtailor", country: "INT", method: "html", site: "https://www.teamtailor.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "bamboohr", name: "BambooHR", country: "INT", method: "api", site: "https://www.bamboohr.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "breezy", name: "Breezy HR", country: "INT", method: "api", site: "https://breezy.hr", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "gem", name: "Gem", country: "INT", method: "api", site: "https://www.gem.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "rippling", name: "Rippling", country: "INT", method: "api", site: "https://www.rippling.com/recruiting", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "flatchr", name: "Flatchr", country: "FR", method: "api", site: "https://flatchr.io", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "jobscore", name: "JobScore", country: "INT", method: "api", site: "https://www.jobscore.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "join", name: "JOIN", country: "DE", method: "api", site: "https://join.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "softgarden", name: "softgarden", country: "DE", method: "html", site: "https://softgarden.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "successfactors", name: "SAP SuccessFactors", country: "INT", method: "html", site: "https://www.sap.com/products/hcm.html", handle: { type: "slug", placeholder: "jobs.acme.com" }, keywords: false },
  { kind: "icims", name: "iCIMS", country: "INT", method: "html", site: "https://www.icims.com", handle: { type: "slug", placeholder: "acme" }, keywords: false },
  { kind: "thehub", name: "The Hub", country: "INT", method: "html", site: "https://thehub.io", handle: none, keywords: true },
  { kind: "hackernews", name: "Hacker News – Who is hiring?", country: "INT", method: "api", site: "https://news.ycombinator.com", handle: none, keywords: false },
  link("wttj", "Welcome to the Jungle", "FR", "https://www.welcometothejungle.com", (q, loc) => `https://www.welcometothejungle.com/fr/jobs?query=${enc(q)}&aroundQuery=${enc(loc)}`),
  link("bayt", "Bayt", "INT", "https://www.bayt.com", (q) => `https://www.bayt.com/en/international/jobs/${slug(q) || "internship"}-jobs/`),
  link("landingjobs", "Landing.jobs", "INT", "https://landing.jobs", (q) => `https://landing.jobs/jobs?search=${enc(q)}`),
  { kind: "rss", name: "RSS / Atom", country: "INT", method: "rss", site: "", handle: { type: "url", placeholder: "https://…/jobs.rss" }, keywords: false },
  { kind: "careers", name: "Page carrières", country: "INT", method: "html", site: "", handle: { type: "url", placeholder: "https://…/careers" }, keywords: false },
];

/** Country codes from either ISO codes or free-text places ("DE,FR", "Allemagne, Tunis"). Remote is not a country. */
export function placeCodes(location: string): string[] {
  const out = new Set<string>();
  for (const part of location.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p || p === REMOTE_CODE) continue;
    const code = countryByCode(p.toUpperCase()) ? p.toUpperCase() : countryOf(p);
    if (code && code !== REMOTE_CODE) out.add(code);
  }
  return [...out];
}

/** Ready-made search links on the sites Khedma cannot read, for the chosen countries (worldwide sites once per country). */
export function platformLinks(keywords: string[], countries: string[]): { name: string; url: string; flag: string }[] {
  const q = keywords.slice(0, 3).join(" ");
  const codes = countries.filter((c) => c !== REMOTE_CODE);
  const targets = codes.length ? codes : ["TN"];
  const out: { name: string; url: string; flag: string }[] = [];
  for (const e of CATALOG) {
    if (!e.searchUrl) continue;
    const mine = e.country === "INT" ? targets : targets.includes(e.country) ? [e.country] : [];
    for (const code of mine) {
      const c = countryByCode(code);
      const flag = c?.flag ?? "🌐";
      out.push({ name: e.name, url: e.searchUrl(q, c?.search ?? code, code), flag });
    }
  }
  return out;
}
