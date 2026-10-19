// Zero-LLM trust score for a posting (career-ops trust_filter): annotate, never drop. Pure.
import type { NewJob } from "../db";

export type HostClass = "portal" | "ats" | "company" | "unverified";

export interface Trust {
  /** 0–100; below 60 is shown as suspicious. */
  score: number;
  flags: string[];
  host: HostClass;
}

const ATS_HOSTS = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|teamtailor\.com|bamboohr\.com|workable\.com|icims\.com|successfactors\.(com|eu)|taleo\.net|jobvite\.com|personio\.(de|com)|pinpointhq\.com|myworkdaysite\.com|breezy\.hr|softgarden\.io|join\.com)$/i;
const PORTAL_HOSTS = /(linkedin\.com|indeed\.com|keejob\.com|tanitjobs\.com|emploitunisie\.com|farojob\.net|jobs\.ch|jobup\.ch|job-room\.ch|jobbank\.gc\.ca|arbeitnow\.\w+|arbeitsagentur\.de|europa\.eu|englishjobs\.(de|fr)|englishjobsearch\.ch|daijob\.com|wantedly\.com|remoteok\.com|jobicy\.com|himalayas\.app|remotive\.com|artificialintelligencejobs\.co|adzuna\.\w+|jooble\.org|reed\.co\.uk|findwork\.dev|glassdoor\.\w+|welcometothejungle\.com|hellowork\.com|apec\.fr|francetravail\.fr|stepstone\.\w+|xing\.com|python\.org|weworkremotely\.com|bayt\.com|thehub\.io|landing\.jobs|ycombinator\.com)$/i;
const SUSPICIOUS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|shorturl\.at|forms\.gle|docs\.google\.com|t\.me|telegram\.(me|org)|wa\.me|whatsapp\.com|cutt\.ly|rb\.gy|is\.gd|linktr\.ee)$/i;
const WEBMAIL = /\b[\w.+-]+@(gmail|yahoo|hotmail|outlook|live|aol|protonmail|icloud|mail)\.(com|fr|tn)\b/i;
const FEES = /\b(frais (de )?(dossier|formation|inscription)|payer (pour|avant)|paiement (requis|obligatoire)|registration fee|processing fee|pay (a |an )?(fee|deposit)|training fee|send money|western union|moneygram|carte bancaire pour postuler)\b/i;

const STOP = new Set(["sarl", "suarl", "sa", "sas", "ltd", "llc", "inc", "gmbh", "group", "groupe", "the", "tunisie", "tunisia", "international", "corp", "co"]);

export function hostClass(url: string): HostClass {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unverified";
  }
  if (PORTAL_HOSTS.test(host)) return "portal";
  if (ATS_HOSTS.test(host)) return "ats";
  if (/^manual:/.test(url)) return "unverified";
  return "company";
}

/**
 * A job board's ad often names the employer's own posting ("apply at https://jobs.lever.co/…"): the first such
 * link in the text, so the apply step can open the employer's form instead of the board.
 */
export function employerLink(url: string, description: string): string | null {
  if (hostClass(url) !== "portal") return null;
  for (const m of description.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const link = m[0].replace(/[.,;:!?]+$/, "");
    try {
      // A board root ("jobs.lever.co/acme") is not a posting; keep links at least two path segments deep.
      if (hostClass(link) === "ats" && new URL(link).pathname.split("/").filter(Boolean).length >= 2) return link;
    } catch {
      // not a URL
    }
  }
  return null;
}

/** Does the company name share a word with the posting's host? Only judged for company-hosted pages. */
function domainMismatch(company: string, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  const words = company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  if (!words.length) return false;
  const flat = host.replace(/[^a-z0-9]/g, "");
  return !words.some((w) => flat.includes(w));
}

export function trustScore(job: Pick<NewJob, "url" | "company" | "description" | "posted_at">, now = Date.now()): Trust {
  const flags: string[] = [];
  let score = 100;
  const url = job.url ?? "";
  let host = "";
  const isHttp = /^https?:\/\//i.test(url);
  if (!isHttp) {
    if (!url || /^manual:/.test(url)) {
      score -= 40;
      flags.push("missing_apply_url");
    } else {
      score -= 50;
      flags.push("invalid_url");
    }
  } else {
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      score -= 50;
      flags.push("invalid_url");
    }
  }
  const cls = hostClass(url);
  if (host && SUSPICIOUS.test(host)) {
    score -= 25;
    flags.push("suspicious_domain");
  }
  if (cls === "company" && host && domainMismatch(job.company, url)) {
    score -= 15;
    flags.push("company_domain_mismatch");
  }
  const desc = job.description ?? "";
  if (desc.trim().length < 300) {
    score -= 10;
    flags.push("short_description");
  }
  if (WEBMAIL.test(desc)) {
    score -= 15;
    flags.push("webmail_contact");
  }
  if (FEES.test(desc)) {
    score -= 40;
    flags.push("fees");
  }
  if (job.posted_at) {
    const days = (now - new Date(job.posted_at).getTime()) / 86_400_000;
    if (days >= 60) {
      score -= 10;
      flags.push("stale");
    }
  }
  return { score: Math.max(0, Math.min(100, score)), flags, host: cls };
}
