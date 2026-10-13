// Provider catalog shown on the Sources page. Pure data: safe to import from client components.

export const PROVIDER_KINDS = ["keejob", "tanitjobs", "emploitunisie", "farojob", "linkedin", "greenhouse", "lever", "ashby", "rss"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export const isProviderKind = (k: unknown): k is ProviderKind => (PROVIDER_KINDS as readonly unknown[]).includes(k);

export interface CatalogEntry {
  kind: ProviderKind;
  name: string;
  country: "TN" | "INT";
  /** How offers are read: public JSON API, RSS/Atom feed, Markdown index or listing HTML. */
  method: "api" | "rss" | "index" | "html";
  site: string;
  /** What the "handle" field means for this provider. */
  handle: { type: "none" } | { type: "slug"; placeholder: string } | { type: "url"; placeholder: string } | { type: "select"; options: { value: string; label: string }[] };
  /** Provider uses keywords to search (otherwise they only filter locally). */
  keywords: boolean;
}

export const CATALOG: CatalogEntry[] = [
  {
    kind: "linkedin",
    name: "LinkedIn (recherche publique)",
    country: "INT",
    method: "html",
    site: "https://www.linkedin.com/jobs",
    handle: { type: "slug", placeholder: "Tunisia" },
    keywords: true,
  },
  { kind: "keejob", name: "Keejob", country: "TN", method: "index", site: "https://www.keejob.com", handle: { type: "none" }, keywords: true },
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
  { kind: "emploitunisie", name: "Emploitunisie", country: "TN", method: "html", site: "https://www.emploitunisie.com", handle: { type: "none" }, keywords: true },
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
  { kind: "greenhouse", name: "Greenhouse", country: "INT", method: "api", site: "https://boards.greenhouse.io", handle: { type: "slug", placeholder: "vercel" }, keywords: false },
  { kind: "lever", name: "Lever", country: "INT", method: "api", site: "https://jobs.lever.co", handle: { type: "slug", placeholder: "qonto" }, keywords: false },
  { kind: "ashby", name: "Ashby", country: "INT", method: "api", site: "https://jobs.ashbyhq.com", handle: { type: "slug", placeholder: "supabase" }, keywords: false },
  { kind: "rss", name: "RSS / Atom", country: "INT", method: "rss", site: "", handle: { type: "url", placeholder: "https://…/jobs.rss" }, keywords: false },
];
