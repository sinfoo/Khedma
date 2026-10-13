// Company research: fetch homepage + about + careers politely, extract facts, summarise (AI with heuristic fallback), cache 14 days.
import { getProfile } from "@/lib/db";
import { htmlToText, pickMeta, pickTitle } from "@/lib/sources/html";
import { extractSkills } from "@/lib/ai/heuristic";
import { summarizeCompany } from "@/lib/ai/company";
import { politeFetch } from "./robots";
import { companyJobs, getCompany, updateCompany, RESEARCH_TTL_DAYS, type CompanyFacts, type CompanyRow } from "./index";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Hosts that are job boards / ATS, never the employer's own site.
const BOARD_HOSTS = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|keejob\.com|tanitjobs\.com|emploitunisie\.com|farojob\.net|linkedin\.com|indeed\.|glassdoor\.|welcometothejungle\.com|jobijoba|hellowork|optioncarriere|bayt\.com|weworkremotely\.com|python\.org|enitjobs\.local)/i;

const SECTORS: [string, RegExp][] = [
  ["Fintech / Banking", /\b(fintech|bank|banque|bancaire|banking|payments?|paiements?|neobank|financ\w*|assurance|insurance|insurtech|compte pro|tresorerie|facturation|credit|invoic\w*)\b/g],
  ["Health", /\b(health|sante|healthcare|medical|medecin|patient|clinic|hospital|hopital|pharma)\b/g],
  ["E-commerce / Retail", /\b(e-?commerce|marketplace|retail|boutique|shop|commerce en ligne)\b/g],
  ["Telecom", /\b(telecom|telecommunication|operateur|operator|5g|reseau mobile|mobile network)\b/g],
  ["IT services / Consulting", /\b(esn|ssii|consulting|conseil|outsourcing|offshore|nearshore|services numeriques|it services|integration)\b/g],
  ["Software / SaaS", /\b(saas|software|logiciel|platform|plateforme|editeur|product company)\b/g],
  ["Cybersecurity", /\b(cybersecurity|cybersecurite|security|securite informatique|soc|pentest)\b/g],
  ["Automotive / Embedded", /\b(automotive|automobile|embedded|embarque|electronique|electronics|iot|hardware|semiconductor)\b/g],
  ["Aerospace / Defense", /\b(aerospace|aeronautique|aeronautics|aeronautical|avionics|avionique|satellites?|spatial|space industry)\b/g],
  ["Energy / Industry", /\b(energy|energie|industrial|industrie|manufacturing|usine|factory|oil|gas|solar|solaire)\b/g],
  ["Education", /\b(education|edtech|learning|formation|school|ecole|universite|university|students?)\b/g],
  ["Logistics / Mobility", /\b(logistics|logistique|transport|delivery|livraison|mobility|mobilite|supply chain)\b/g],
  ["Media / Gaming", /\b(media|gaming|game studio|jeux video|video games?|advertising|publicite|entertainment)\b/g],
  ["AI / Data", /\b(artificial intelligence|intelligence artificielle|machine learning|deep learning|data science|big data|analytics)\b/g],
];

const CULTURE: [string, RegExp][] = [
  ["Remote", /\b(remote|teletravail|full remote|work from home|a distance)\b/],
  ["Hybrid", /\b(hybrid|hybride)\b/],
  ["Flexible hours", /\b(flexible|flexibilite|horaires flexibles|flexible hours)\b/],
  ["Mentoring", /\b(mentor|mentoring|mentorat|coaching|encadrement)\b/],
  ["Training", /\b(training|formation continue|formations|learning budget|certification)\b/],
  ["Agile", /\b(agile|scrum|kanban|sprint)\b/],
  ["Diversity & inclusion", /\b(diversity|diversite|inclusion|inclusive|equal opportunit)\b/],
  ["Open source", /\b(open ?source)\b/],
  ["Startup", /\b(start-?up|scale-?up)\b/],
  ["International", /\b(international|global|worldwide|multicultural|countries|pays)\b/],
  ["Innovation", /\b(innovation|innovative|innovant|r&d|research and development)\b/],
  ["Impact", /\b(impact|mission-driven|purpose|social|sustainab|durable|rse|csr)\b/],
  ["Work-life balance", /\b(work-?life balance|equilibre|bien-?etre|well-?being|wellness)\b/],
  ["Ownership", /\b(ownership|autonomy|autonomie|responsabilit|empower)\b/],
  ["Transparency", /\b(transparen)\w*/],
  ["Team events", /\b(team building|afterwork|hackathon|events|evenements)\b/],
  ["Career growth", /\b(career (path|growth)|evolution|promotion|grow with us|carriere)\b/],
];

const SOCIAL: [string, RegExp][] = [
  ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[\w%.-]+/i],
  ["github", /https?:\/\/github\.com\/[\w.-]+\/?(?=["'\s#?])/i],
  ["glassdoor", /https?:\/\/(?:www\.)?glassdoor\.[a-z.]+\/[^"'\s]+/i],
  ["welcometothejungle", /https?:\/\/(?:www\.)?welcometothejungle\.com\/[a-z]{2}\/companies\/[\w-]+/i],
  ["x", /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!share|intent|home|search)[\w]+\/?(?=["'\s#?])/i],
  ["facebook", /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog)[\w.-]+\/?(?=["'\s#?])/i],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/[\w.-]+\/?(?=["'\s#?])/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[\w.-]+/i],
];

const CITIES =
  /\b(tunis|ariana|sousse|sfax|monastir|nabeul|bizerte|ben arous|lac [12]|la marsa|gammarth|paris|lyon|nantes|lille|toulouse|marseille|bordeaux|grenoble|sophia antipolis|london|berlin|munich|amsterdam|barcelona|madrid|milan|montreal|dubai|casablanca|san francisco|new york)\b/i;

/** First internal link whose href or text looks like an "about" or "careers" page. */
export function findLink(html: string, base: URL, kind: "about" | "careers"): string | null {
  const want =
    kind === "about"
      ? /about|a-?propos|qui-?sommes-?nous|notre-?histoire|company|entreprise|our-?story|who-?we-?are/i
      : /career|carriere|jobs?\b|recrut|join-?us|rejoi|nous-?rejoindre|work-?with-?us|offres?-?d-?emploi|opportunit|talent/i;
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    const text = htmlToText(m[2]);
    if (!want.test(href) && !want.test(text)) continue;
    if (/mailto:|tel:|javascript:/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      // careers may live on an ATS (boards.greenhouse.io/x), about must stay on the site
      if (kind === "about" && u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      u.hash = "";
      if (u.href === base.href) continue;
      return u.href;
    } catch {
      continue;
    }
  }
  return null;
}

/** Deterministic extraction from up to three fetched pages. */
export function extractFacts(pages: { url: string; html: string }[]): CompanyFacts {
  const texts = pages.map((p) => htmlToText(p.html));
  const all = texts.join("\n\n");
  const f = fold(all);
  const home = pages[0]?.html ?? "";

  // Some boards (Greenhouse) put HTML inside og:description; flatten it like any other fragment.
  const meta = htmlToText(pickMeta(home, "og:description") || pickMeta(home, "description") || "").split("\n")[0]?.trim() ?? "";
  const description =
    (meta.length >= 30 ? meta : "") ||
    texts.flatMap((t) => t.split("\n")).find((l) => l.length >= 80 && l.length <= 400 && !/cookie|javascript/i.test(l)) ||
    "";

  let sector = "";
  let best = 0;
  for (const [name, re] of SECTORS) {
    const n = (f.match(re) ?? []).length;
    if (n > best) {
      best = n;
      sector = name;
    }
  }

  const sizeM = /(\d{1,3}(?:[ ,.]\d{3})*|\d+)\s*\+?\s*(employees|employes|collaborateurs|collaborators|salaries|people|personnes|team members|engineers|ingenieurs|talents)/i.exec(f);
  const size = sizeM
    ? `${sizeM[1].replace(/[ ,.]/g, "")}+ ${/employes|collaborateurs|salaries|personnes|ingenieurs/.test(sizeM[2]) ? "collaborateurs" : sizeM[2]}`
    : /\b(start-?up)\b/.test(f)
      ? "Startup"
      : /\b(scale-?up)\b/.test(f)
        ? "Scale-up"
        : /\b(multinational|groupe international|global leader|leader mondial)\b/.test(f)
          ? "Multinational"
          : /\b(pme|sme)\b/.test(f)
            ? "PME / SME"
            : "";

  const hqM = /(?:headquartered|head office|headquarters|siege(?: social)?|bases?|based|located|situe[es]?)\s+(?:in|a|au|en|:)\s+([A-Za-zÀ-ſ][\wÀ-ſ' -]{2,30}?)(?=[,.;\n)]|\s+(?:and|et|with|avec|in|en)\b)/i.exec(all);
  // ponytail: no explicit HQ sentence -> most-mentioned known city; a real geocoder would do better.
  const cityCounts = new Map<string, number>();
  for (const m of all.matchAll(new RegExp(CITIES.source, "gi"))) {
    const k = m[1].toLowerCase();
    cityCounts.set(k, (cityCounts.get(k) ?? 0) + 1);
  }
  const topCity = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const hq = hqM?.[1].trim() ?? (topCity ? topCity.replace(/\b\w/g, (c) => c.toUpperCase()) : "");

  // Marketing pages mention languages and soft skills everywhere; keep the technical stack.
  const soft = /^(english|french|german|arabic|spanish|italian|communication|teamwork|leadership|excel|powerpoint|word|office|statistics)$/i;
  const tech = extractSkills(all).filter((s) => !soft.test(s)).slice(0, 15);

  const social: Record<string, string> = {};
  const htmlAll = pages.map((p) => p.html).join("\n");
  for (const [k, re] of SOCIAL) {
    const m = re.exec(htmlAll);
    if (m) social[k] = m[0].replace(/\/$/, "");
  }

  const culture = CULTURE.filter(([, re]) => re.test(f)).map(([k]) => k).slice(0, 10);

  // About page first (if any), then the rest: that is the most useful grounding for Q&A.
  const ordered = pages.map((p, i) => ({ p, t: texts[i] })).sort((a, b) => Number(isAbout(b.p.url)) - Number(isAbout(a.p.url)));
  const excerpt = ordered
    .map((x) => `[${x.p.url}]\n${x.t.replace(/\n{2,}/g, "\n").slice(0, 2500)}`)
    .join("\n\n")
    .slice(0, 6000);

  return { description: description.slice(0, 500), sector, size, hq: hq.slice(0, 60), tech, social, culture, pages: pages.map((p) => p.url), excerpt };
}
const isAbout = (u: string) => /about|propos|sommes|story|company/i.test(u);

/** User-set website, else the offers' own host (not a board), else a domain guess that must be confirmed by the page title. */
function guessWebsite(c: CompanyRow, jobUrls: string[]): { url: string; guessed: boolean } | null {
  if (c.website) return { url: c.website, guessed: false };
  for (const u of jobUrls) {
    try {
      const url = new URL(u);
      if (/^https?:$/.test(url.protocol) && !BOARD_HOSTS.test(url.hostname)) return { url: url.origin, guessed: false };
    } catch {
      continue;
    }
  }
  const domain = c.slug.replace(/-/g, "");
  return /^[a-z0-9]{3,40}$/.test(domain) ? { url: `https://www.${domain}.com`, guessed: true } : null;
}

/** Careers page known from an ATS job URL (boards.greenhouse.io/acme/jobs/1 -> boards.greenhouse.io/acme). */
function careersFromJobs(jobUrls: string[]): string | null {
  for (const u of jobUrls) {
    const m = /^(https?:\/\/(?:boards\.greenhouse\.io|job-boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/[^/?#]+)/i.exec(u);
    if (m) return m[1];
  }
  return null;
}

export interface ResearchResult {
  company: CompanyRow;
  cached: boolean;
  error?: string;
}

export async function researchCompany(slug: string, force = false): Promise<ResearchResult> {
  const c = getCompany(slug);
  if (!c) return { company: c as never, cached: false, error: "not found" };
  const ageDays = c.researched_at ? (Date.now() - new Date(c.researched_at).getTime()) / 86_400_000 : Infinity;
  if (!force && c.research && !c.research.error && ageDays < RESEARCH_TTL_DAYS) return { company: c, cached: true };

  const jobs = companyJobs(slug);
  const urls = jobs.map((j) => j.url);
  const website = guessWebsite(c, urls);
  const careers = c.careers_url || careersFromJobs(urls);
  const profile = getProfile();
  const locale = profile.settings.locale;
  const askedSkills = c.skills.map((s) => s.name);
  const offers = jobs.filter((j) => !j.archived).map((j) => ({ title: j.title, type: j.type }));

  const pages: { url: string; html: string }[] = [];
  const errors: string[] = [];
  const grab = async (u: string | null) => {
    if (!u || pages.length >= 3 || pages.some((p) => p.url === u)) return;
    const r = await politeFetch(u);
    if (r.status >= 200 && r.status < 300 && r.html) pages.push({ url: r.finalUrl, html: r.html });
    else errors.push(`${u}: ${r.error ?? `HTTP ${r.status}`}`);
  };

  if (website) {
    await grab(website.url);
    const home = pages[0];
    if (home) {
      const base = new URL(home.url);
      // A guessed domain must actually be about this company; a wrong site would poison the summary.
      const title = `${pickTitle(home.html) ?? ""} ${pickMeta(home.html, "og:site_name") ?? ""}`;
      const key = fold(c.name).split(/\s+/)[0];
      if (website.guessed && key.length > 2 && !fold(title).includes(key)) {
        pages.length = 0;
        errors.push(`${website.url}: page does not mention ${c.name}`);
      } else {
        await grab(findLink(home.html, base, "about"));
        await grab(careers ?? findLink(home.html, base, "careers"));
      }
    }
  }
  // Site unknown or unusable: the ATS board alone still gives offers, values and tech.
  if (!pages.length && careers) await grab(careers);

  if (!pages.length) {
    const error = errors.length ? errors.join("; ") : "no website";
    updateCompany(slug, { researched_at: new Date().toISOString(), research: { facts: emptyFacts(), summary: { what: "", lookFor: "", standOut: [], questions: [], engine: "heuristic" }, locale, error } });
    return { company: getCompany(slug)!, cached: false, error };
  }

  const facts = extractFacts(pages);
  const summary = await summarizeCompany(profile.settings, { name: c.name, facts, askedSkills, offers, locale });
  // Keep values the user typed; replace the ones a previous research auto-filled.
  const prev = c.research?.facts;
  const fill = (cur: string, prevAuto: string | undefined, next: string) => (cur && cur !== prevAuto ? cur : next || cur);
  updateCompany(slug, {
    website: c.website || (pages[0] && !BOARD_HOSTS.test(new URL(pages[0].url).hostname) ? new URL(pages[0].url).origin : ""),
    careers_url: c.careers_url || careers || pages.find((p) => /career|carriere|job|recrut|join/i.test(p.url))?.url || "",
    sector: fill(c.sector, prev?.sector, facts.sector),
    size: fill(c.size, prev?.size, facts.size),
    hq: fill(c.hq, prev?.hq, facts.hq),
    description: fill(c.description, prev?.description, facts.description),
    researched_at: new Date().toISOString(),
    research: { facts, summary, locale },
  });
  return { company: getCompany(slug)!, cached: false };
}

const emptyFacts = (): CompanyFacts => ({ description: "", sector: "", size: "", hq: "", tech: [], social: {}, culture: [], pages: [], excerpt: "" });
