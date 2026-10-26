// More course catalogs: official APIs, RSS/JSON feeds and sitemaps that robots.txt allows (checked 2026-10-26).
// Sitemap-only catalogs give a URL and sometimes a title: the title is rebuilt from the URL's slug when missing.
// Server only.
import { getJson, getText, sleep } from "../sources/http";
import { htmlToText } from "../sources/html";
import { extractSkills } from "../ai/heuristic";
import { classifyFields, parseDuration, type CertKind, type CourseLevel, type FieldKey, type NewCourse, type PriceKind } from "./model";

type Result = { courses: NewCourse[]; error?: string };
const short = (s: string) => htmlToText(s ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
const SMALL = new Set(["a", "an", "and", "of", "the", "to", "for", "in", "on", "with", "et", "de", "du", "des", "la", "le", "les"]);
const ACRONYMS = new Set(["ai", "ml", "ui", "ux", "api", "aws", "css", "html", "sql", "ios", "it", "3d", "vr", "ar", "iot", "llm", "llms", "gpu", "seo", "crm", "hr", "cv", "ccna", "rag", "nlp"]);

/** "intro-to-machine-learning" -> "Intro to Machine Learning". */
export function deslug(slug: string): string {
  return decodeURIComponent(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const make = (c: { source: string; title: string; url: string; provider: string; description?: string; fields?: FieldKey[]; level?: CourseLevel | null; duration_min?: number | null; languages?: string[]; price: PriceKind; cert: CertKind; image?: string | null; updated_at?: string | null; expires_at?: string | null }): NewCourse => {
  const description = c.description ?? "";
  return {
    source: c.source,
    title: c.title.trim().slice(0, 200),
    url: c.url,
    provider: c.provider,
    description,
    fields: c.fields?.length ? c.fields : classifyFields(c.title, description),
    skills: extractSkills(`${c.title}\n${description}`).slice(0, 8),
    level: c.level ?? null,
    duration_min: c.duration_min ?? null,
    languages: c.languages ?? ["en"],
    price: c.price,
    cert: c.cert,
    image: c.image ?? null,
    updated_at: c.updated_at ?? null,
    expires_at: c.expires_at ?? null,
  };
};

// ---------- sitemaps ----------
export interface SitemapEntry { loc: string; lastmod?: string; caption?: string }
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const b = m[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(b)?.[1];
    if (!loc) continue;
    const caption = /<image:caption>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/image:caption>/.exec(b)?.[1] ?? /<image:title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/image:title>/.exec(b)?.[1];
    out.push({ loc: decode(loc), lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(b)?.[1]?.slice(0, 10), caption: caption ? decode(caption) : undefined });
  }
  return out;
}
async function sitemap(url: string): Promise<{ entries: SitemapEntry[]; error?: string }> {
  const { text, error } = await getText(url, "application/xml, text/xml;q=0.9, */*;q=0.5", { timeoutMs: 90_000 });
  return text ? { entries: parseSitemap(text) } : { entries: [], error };
}
const lastSegment = (u: string) => new URL(u).pathname.replace(/\/$/, "").split("/").pop() ?? "";

/** A catalog read from sitemaps: which URLs are courses, and how to describe them. */
async function fromSitemaps(urls: string[], keep: RegExp, toCourse: (e: SitemapEntry) => NewCourse | null): Promise<Result> {
  const seen = new Set<string>();
  const out: NewCourse[] = [];
  let error: string | undefined;
  for (const u of urls) {
    const r = await sitemap(u);
    if (r.error) error = r.error;
    for (const e of r.entries) {
      const key = e.loc.split("?")[0].replace(/\/$/, "");
      if (!keep.test(e.loc) || seen.has(key)) continue;
      seen.add(key);
      const c = toCourse(e);
      if (c) out.push(c);
    }
    await sleep(800);
  }
  return { courses: out, error: out.length ? undefined : error };
}

// edX: /learn/{subject}/{org}-{course}. Mostly free to audit with a paid certificate.
export const edxCourse = (e: SitemapEntry): NewCourse | null => {
  const m = /edx\.org\/learn\/([^/]+)\/([^/?#]+)$/.exec(e.loc);
  if (!m) return null;
  return make({ source: "edx", title: deslug(m[2]), url: e.loc, provider: "edX", description: deslug(m[1]), fields: classifyFields(`${deslug(m[1])} ${deslug(m[2])}`), price: "freemium", cert: "paid", updated_at: e.lastmod });
};
const fetchEdx = () => fromSitemaps(["https://www.edx.org/sitemap.xml"], /edx\.org\/learn\/[^/]+\/[^/?#]+$/, edxCourse);

// Alison: free courses, paid certificate; the sitemap carries the real title.
const fetchAlison = () =>
  fromSitemaps(["https://alison.com/sitemaps/sitemap-courses-en.xml"], /alison\.com\/course\//, (e) =>
    make({ source: "alison", title: e.caption || deslug(lastSegment(e.loc)), url: e.loc, provider: "Alison", price: "freemium", cert: "paid", updated_at: e.lastmod }),
  );

// Codecademy: free and Pro courses and career paths.
const fetchCodecademy = () =>
  fromSitemaps(["https://www.codecademy.com/sitemap/tracks.xml", "https://www.codecademy.com/sitemap/paths.xml"], /codecademy\.com\/learn\//, (e) =>
    make({ source: "codecademy", title: deslug(lastSegment(e.loc).replace(/^(paths|learn)-/, "")), url: e.loc, provider: "Codecademy", fields: undefined, price: "freemium", cert: "paid", updated_at: e.lastmod }),
  );

// Trailhead (Salesforce): free modules and trails with badges.
const fetchTrailhead = () =>
  fromSitemaps(["https://trailhead.salesforce.com/content_sitemap.xml"], /trailhead\.salesforce\.com\/content\/learn\/(modules|trails)\/[^/?#]+$/, (e) =>
    make({ source: "trailhead", title: deslug(lastSegment(e.loc)), url: e.loc, provider: "Salesforce Trailhead", price: "free", cert: "completion", updated_at: e.lastmod }),
  );

// Unity Learn: free courses and pathways (game dev, 3D, XR).
const fetchUnity = () =>
  fromSitemaps(["https://learn.unity.com/course/sitemap.xml", "https://learn.unity.com/pathway/sitemap.xml"], /learn\.unity\.com\/(course|pathway)\//, (e) =>
    make({ source: "unity", title: deslug(lastSegment(e.loc)), url: e.loc, provider: "Unity", fields: ["gamedev"], price: "free", cert: "completion", updated_at: e.lastmod }),
  );

// Cisco Networking Academy: free courses (networking, cybersecurity, IoT, Python); CCNA ends in a paid proctored exam.
const fetchNetacad = () =>
  fromSitemaps(["https://www.netacad.com/sitemap.xml"], /netacad\.com\/courses\/[^/?#]+(\?courseLang=en-US)?$/, (e) => {
    const slug = lastSegment(e.loc.split("?")[0]);
    return make({ source: "netacad", title: deslug(slug), url: `https://www.netacad.com/courses/${slug}`, provider: "Cisco Networking Academy", price: "free", cert: /ccna|ccnp/.test(slug) ? "proctored" : "completion", updated_at: e.lastmod });
  });

// HubSpot Academy: free marketing and sales courses with free certificates.
const fetchHubspot = () =>
  fromSitemaps(["https://academy.hubspot.com/en-academy-sitemap.xml"], /academy\.hubspot\.com\/courses\/[^/?#]+$/, (e) =>
    make({ source: "hubspot", title: deslug(lastSegment(e.loc)), url: e.loc, provider: "HubSpot Academy", fields: ["business"], price: "free", cert: "completion", updated_at: e.lastmod }),
  );

// DeepLearning.AI: free short courses on AI.
const fetchDeepLearning = () =>
  fromSitemaps(["https://www.deeplearning.ai/sitemap.xml"], /deeplearning\.ai\/courses\/[^/?#]+$/, (e) =>
    make({ source: "deeplearning", title: deslug(lastSegment(e.loc)), url: e.loc, provider: "DeepLearning.AI", fields: ["ai"], price: "free", cert: "none", updated_at: e.lastmod }),
  );

// The Odin Project: free full-stack paths and their courses.
const fetchOdin = () =>
  fromSitemaps(["https://www.theodinproject.com/sitemap.xml"], /theodinproject\.com\/paths\/[^/]+(\/courses\/[^/?#]+)?$/, (e) => {
    const parts = new URL(e.loc).pathname.split("/").filter(Boolean);
    const title = parts.length > 2 ? `${deslug(parts[3])} (${deslug(parts[1])})` : deslug(parts[1]);
    return make({ source: "odin", title, url: e.loc, provider: "The Odin Project", fields: ["web", "programming"], price: "free", cert: "none", updated_at: e.lastmod });
  });

// Duolingo: free language courses (/course/{target}/{from}/Learn-X), kept for English speakers and French speakers.
const fetchDuolingo = () =>
  fromSitemaps(["https://www.duolingo.com/sitemap_courses.xml"], /duolingo\.com\/course\/[a-z-]+\/(en|fr|ar)\//, (e) => {
    const [, , target, from, name] = new URL(e.loc).pathname.split("/");
    return make({ source: "duolingo", title: `${deslug(name)} (${target.toUpperCase()}, ${from.toUpperCase()})`, url: e.loc, provider: "Duolingo", fields: ["languages"], languages: [from], price: "free", cert: "none", updated_at: e.lastmod });
  });

// ---------- JSON APIs ----------
interface MitItem {
  title: string;
  url: string;
  description?: string;
  offered_by?: { name?: string };
  free?: boolean;
  certification?: boolean;
  certification_type?: { code?: string };
  languages?: string[] | null;
  image?: { url?: string } | null;
  last_modified?: string | null;
  topics?: { name: string }[];
  runs?: { duration?: string; level?: { code?: string }[] }[];
}
export function mapMit(items: MitItem[]): NewCourse[] {
  return items
    .filter((x) => x.title && x.url)
    .map((x) => {
      const topics = (x.topics ?? []).map((t) => t.name).join(", ");
      const description = short(x.description ?? "");
      // MicroMasters credentials count toward a master's degree; a "Professional Certificate" is a paid certificate.
      const credit = x.certification_type?.code === "micromasters";
      return make({
        source: "mit",
        title: x.title,
        url: x.url,
        provider: x.offered_by?.name ? `MIT · ${x.offered_by.name}` : "MIT",
        description: description || topics,
        fields: classifyFields(`${x.title} ${topics}`, description),
        duration_min: parseDuration(x.runs?.[0]?.duration),
        languages: x.languages?.length ? x.languages.map((l) => l.slice(0, 2)) : ["en"],
        price: x.free ? (x.certification ? "freemium" : "free") : "paid",
        cert: !x.certification ? "none" : credit ? "credit" : "paid",
        image: x.image?.url ?? null,
        updated_at: x.last_modified?.slice(0, 10) ?? null,
      });
    });
}
async function fetchMit(): Promise<Result> {
  const out: NewCourse[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const { data, error } = await getJson<{ results: MitItem[]; next?: string | null }>(`https://api.learn.mit.edu/api/v1/learning_resources_search/?resource_type=course&limit=1000&offset=${offset}`, { timeoutMs: 90_000 });
    if (!data) return { courses: out, error: out.length ? undefined : error };
    out.push(...mapMit(data.results));
    if (!data.next) break;
    await sleep(800);
  }
  return { courses: out };
}

// Edraak (Queen Rania Foundation): free Arabic courses.
interface EdraakItem { name_ar?: string; name_en?: string; course_url?: string; short_description?: string; category?: { name_en?: string }; level?: string; effort?: number; cover_image?: string; modified?: string }
export function mapEdraak(items: EdraakItem[]): NewCourse[] {
  return items
    .filter((x) => (x.name_ar || x.name_en) && x.course_url)
    .map((x) =>
      make({
        source: "edraak",
        title: x.name_ar || x.name_en!,
        url: x.course_url!,
        provider: "Edraak",
        description: short(x.short_description ?? ""),
        fields: classifyFields(`${x.name_en ?? ""} ${x.category?.name_en ?? ""}`),
        level: x.level === "entry" ? "beginner" : x.level === "intermediate" ? "intermediate" : x.level === "advanced" ? "advanced" : null,
        duration_min: x.effort ? x.effort * 60 : null,
        languages: ["ar"],
        price: "free",
        cert: "completion",
        image: x.cover_image ?? null,
        updated_at: x.modified?.slice(0, 10) ?? null,
      }),
    );
}
async function fetchEdraak(): Promise<Result> {
  const out: NewCourse[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await getJson<{ results: EdraakItem[]; next?: string | null }>(`https://edraak.org/api/marketing/courses/?limit=100&offset=${offset}`, { timeoutMs: 30_000 });
    if (!data) return { courses: out, error: out.length ? undefined : error };
    out.push(...mapEdraak(data.results));
    if (!data.next) break;
    await sleep(600);
  }
  return { courses: out };
}

// Rwaq: Arabic courses (WordPress REST).
async function fetchRwaq(): Promise<Result> {
  const out: NewCourse[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await getJson<{ title?: { rendered?: string }; link?: string; modified?: string; excerpt?: { rendered?: string } }[]>(`https://rwaq.org/wp-json/wp/v2/course?per_page=100&page=${page}`, { timeoutMs: 30_000 });
    if (!data?.length) {
      if (!out.length && error) return { courses: [], error };
      break;
    }
    for (const x of data) {
      const title = htmlToText(x.title?.rendered ?? "").trim();
      if (!title || !x.link || /test|تجرب/i.test(title)) continue;
      out.push(make({ source: "rwaq", title, url: x.link, provider: "Rwaq", description: short(x.excerpt?.rendered ?? ""), languages: ["ar"], price: "free", cert: "completion", updated_at: x.modified?.slice(0, 10) }));
    }
    if (data.length < 100) break;
    await sleep(600);
  }
  return { courses: out };
}

// Google Cloud Skills Boost: the public catalog page embeds its results as JSON (8 per page).
interface SkillsItem { type?: string; title?: string; description?: string; path?: string; duration?: string; level?: string; credentialType?: string }
export function parseSkillsPage(html: string): { items: SkillsItem[]; total: number } {
  const m = /pagedSearchResults='([^']*)'/.exec(html) ?? /pagedSearchResults="([^"]*)"/.exec(html);
  if (!m) return { items: [], total: 0 };
  try {
    const j = JSON.parse(decode(m[1]).replace(/&#x27;/g, "'")) as { searchResults?: SkillsItem[]; resultsCount?: number };
    return { items: j.searchResults ?? [], total: j.resultsCount ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}
export function mapSkills(items: SkillsItem[]): NewCourse[] {
  return items
    .filter((x) => x.title && x.path)
    .map((x) =>
      make({
        source: "skillsboost",
        title: x.title!,
        url: `https://www.skills.google${x.path!.split("?")[0]}`,
        provider: "Google Cloud",
        description: short(x.description ?? ""),
        level: x.level === "introductory" ? "beginner" : x.level === "intermediate" || x.level === "advanced" ? x.level : null,
        duration_min: parseDuration(x.duration),
        price: "freemium",
        cert: x.credentialType === "skill_badge" ? "completion" : x.credentialType ? "paid" : "none",
      }),
    );
}
async function fetchSkillsBoost(): Promise<Result> {
  const out: NewCourse[] = [];
  let total = Infinity;
  for (let page = 1; page <= 250 && (page - 1) * 8 < total; page++) {
    const { text, error } = await getText(`https://www.skills.google/catalog?page=${page}`, "text/html", { timeoutMs: 30_000 });
    if (!text) return { courses: out, error: out.length ? undefined : error };
    const r = parseSkillsPage(text);
    if (!r.items.length) break;
    total = r.total || total;
    out.push(...mapSkills(r.items));
    await sleep(900);
  }
  return { courses: out };
}

// freeCodeCamp: the open curriculum on GitHub (certifications and courses), free with free certifications.
async function fetchFreeCodeCamp(): Promise<Result> {
  const base = "https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main";
  const { data: intro, error } = await getJson<Record<string, { title?: string; intro?: string[] }>>(`${base}/client/i18n/locales/english/intro.json`, { timeoutMs: 60_000 });
  if (!intro) return { courses: [], error };
  const { data: cur } = await getJson<{ superblocks?: string[]; superBlocks?: string[] } | string[]>(`${base}/curriculum/structure/curriculum.json`, { timeoutMs: 60_000 });
  const blocks = Array.isArray(cur) ? cur : (cur?.superblocks ?? cur?.superBlocks ?? Object.keys(intro));
  const out: NewCourse[] = [];
  for (const sb of blocks) {
    const x = intro[sb];
    if (!x?.title || typeof x.title !== "string") continue;
    const description = (x.intro ?? []).join(" ").slice(0, 600);
    out.push(make({ source: "freecodecamp", title: x.title, url: `https://www.freecodecamp.org/learn/${sb}/`, provider: "freeCodeCamp", description, price: "free", cert: /certification/i.test(x.title) ? "completion" : "none" }));
  }
  return { courses: out };
}

// ---------- free Udemy courses: 100%-off coupons reported by Tutorialbar ----------
// The RSS lists new coupons; each item's page carries the coupon's state. Only coupons the site still reports as
// 100% off and not expired are kept, and they are hidden 48 hours after the site last verified them.
// Udemy itself is never contacted (it blocks bots); the student opens the coupon link in their browser.
export function parseCoupon(html: string, slug: string): { url: string; verified: string | null; language?: string; duration?: string; image?: string; category?: string } | null {
  const s = html.replace(/\\\\"/g, '"').replace(/\\"/g, '"');
  const i = s.indexOf(`"couponUrl":"https://www.udemy.com/course/${slug}/`);
  if (i < 0) return null;
  const win = s.slice(Math.max(0, i - 2500), i + 900);
  const local = s.slice(i, i + 900);
  if (!/"is100PercentOff":true/.test(local) || /"isExpired":true/.test(local)) return null;
  const pick = (k: string, from = win) => new RegExp(`"${k}":"([^"]*)"`).exec(from)?.[1];
  return {
    url: /"couponUrl":"([^"]+)"/.exec(local)![1],
    verified: /"lastVerifiedAt":"\$?D?([^"]+)"/.exec(local)?.[1] ?? null,
    language: pick("language"),
    duration: pick("duration"),
    image: pick("imageUrl"),
    category: pick("category"),
  };
}
const LANG_CODE: Record<string, string> = { English: "en", French: "fr", Français: "fr", Spanish: "es", Español: "es", Arabic: "ar", German: "de", Portuguese: "pt", Italian: "it", Turkish: "tr" };

async function fetchCoupons(): Promise<Result> {
  const { text, error } = await getText("https://www.tutorialbar.com/feed.xml", "application/rss+xml, application/xml;q=0.9", { timeoutMs: 30_000 });
  if (!text) return { courses: [], error };
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 40).map((m) => ({
    title: /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(m[1])?.[1]?.replace(/\s*\(100% OFF\)\s*$/i, "").trim() ?? "",
    link: /<link>([^<]+)<\/link>/.exec(m[1])?.[1]?.trim() ?? "",
    description: /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/.exec(m[1])?.[1] ?? "",
  }));
  const out: NewCourse[] = [];
  for (const it of items) {
    const slug = /\/course\/([^/?#]+)/.exec(it.link)?.[1];
    if (!slug || !it.title) continue;
    const page = await getText(it.link, "text/html", { timeoutMs: 20_000 });
    const c = page.text ? parseCoupon(page.text, slug) : null;
    if (c) {
      const verified = c.verified ? Date.parse(c.verified) : Date.now();
      out.push(
        make({
          source: "coupons",
          title: it.title,
          url: c.url,
          provider: "Udemy (coupon via Tutorialbar)",
          description: short(it.description),
          languages: [LANG_CODE[c.language ?? ""] ?? "en"],
          duration_min: parseDuration(c.duration),
          price: "coupon",
          cert: "completion",
          image: c.image ?? null,
          updated_at: c.verified?.slice(0, 10) ?? null,
          expires_at: new Date(verified + 48 * 3_600_000).toISOString().slice(0, 10),
        }),
      );
    }
    await sleep(1200);
  }
  return { courses: out, error: out.length ? undefined : "no live 100% coupon found" };
}

/** Catalogs read here, by source id (merged into COURSE_SOURCES). */
export const MORE_SOURCES: Record<string, () => Promise<Result>> = {
  mit: fetchMit,
  edx: fetchEdx,
  skillsboost: fetchSkillsBoost,
  alison: fetchAlison,
  codecademy: fetchCodecademy,
  trailhead: fetchTrailhead,
  freecodecamp: fetchFreeCodeCamp,
  odin: fetchOdin,
  deeplearning: fetchDeepLearning,
  unity: fetchUnity,
  netacad: fetchNetacad,
  hubspot: fetchHubspot,
  edraak: fetchEdraak,
  rwaq: fetchRwaq,
  duolingo: fetchDuolingo,
  coupons: fetchCoupons,
};
