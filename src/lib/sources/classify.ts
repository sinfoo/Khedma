import type { NewJob } from "../db";
import type { JobType, Profile } from "../types";

/** Lowercase, strip accents, unify dev/develop stems and a few FR/EN synonyms. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/d[ée]velop\w*/g, "dev")
    .replace(/\bdev\w*/g, "dev")
    .replace(/\blogiciel\w*/g, "software")
    .replace(/\bingenieur\w*|\bengineer\w*/g, "engineer")
    .replace(/\bdonnees\b/g, "data");
}

// Body sentences about the candidate's past or about mentoring say nothing about this offer's contract:
// "completed at least one internship", "ayant réalisé son PFE", "vous encadrerez un stagiaire".
const NOT_CONTRACT = /[^.\n;!?]*\b(experience|completed|realise|ayant|encadr|mentor|supervis|previous|deja effectue|au moins un|at least one)[^.\n;!?]*/g;

export function guessType(title: string, description = ""): JobType {
  const t = fold(title);
  const all = `${t} ${fold(description).replace(NOT_CONTRACT, " ")}`;
  // Bare "fin d'études" only counts in the title: descriptions often say it in passing.
  const pfe = /\bpfe\b|projet de fin d'?etudes?|final year project|graduation project/;
  if (pfe.test(t) || /fin d'?etudes?/.test(t)) return "pfe";
  if (/\balternan|apprenti|apprenticeship|work-?study/.test(t)) return "alternance";
  // werkstudent / praktikum / working student / co-op: freehire's internship vocabulary.
  if (/\bstage|\bstagiaire|\bintern(ship)?s?\b|\bwerkstudent|\bpraktik(um|ant)|\bworking student\b|\bco-op\b/.test(t)) return pfe.test(all) ? "pfe" : "stage";
  if (/\bfreelance|\bfreelancer|\bindependant/.test(t)) return "freelance";
  // Title was not decisive; look at the body with the same priorities.
  // Bare "stage" is skipped here: in English bodies it usually means "early-stage".
  if (pfe.test(all)) return "pfe";
  if (/\balternan|apprenti|apprenticeship/.test(all)) return "alternance";
  if (/\bstagiaire|\binternship\b|\bstage (d'?ete|d'?ingenieur|technicien|ouvrier|conventionne|remunere)|\b(offre|convention|periode|duree) de stage\b/.test(all)) return "stage";
  if (/\bfreelance/.test(all)) return "freelance";
  return "emploi";
}

// Negation and hybrid patterns after elliottdehn/open-jobs tools/locparse.py (CC0).
const NO_REMOTE = /\b(no|not|non|pas de|sans|aucun)\b[^.\n]{0,25}\b(remote|t[ée]l[ée]travail)|\b(remote|t[ée]l[ée]travail)\b[^.\n]{0,20}\b(not (an )?option|not possible|impossible|non possible|pas possible|not available|not offered|exclu|n'est pas (possible|propos))/i;
const FULL_REMOTE = /\b(full[- ]?remote|fully remote|100 ?% (remote|t[ée]l[ée]travail)|remote[- ]first)\b/i;

export function guessRemote(text: string): boolean {
  if (NO_REMOTE.test(text)) return false;
  if (/\bhybrid|\bhybride/i.test(text) && !FULL_REMOTE.test(text)) return false;
  return /\b(remote|teletravail|télétravail|full[- ]remote|work from home|a distance|à distance|anywhere)\b/i.test(text);
}

// Compact built-in tech list. Display name -> regex (word-ish boundaries, case-insensitive).
const TECH: [string, RegExp][] = [
  ["Java", /\bjava\b(?!script)/i], ["Spring", /\bspring( boot)?\b/i], ["Python", /\bpython\b/i], ["Django", /\bdjango\b/i],
  ["Flask", /\bflask\b/i], ["FastAPI", /\bfastapi\b/i], ["JavaScript", /\bjavascript\b|\bjs\b/i], ["TypeScript", /\btypescript\b|\bts\b/i],
  ["React", /\breact(\.?js)?\b/i], ["Next.js", /\bnext\.?js\b/i], ["Vue", /\bvue(\.?js)?\b/i], ["Angular", /\bangular\b/i],
  ["Node.js", /\bnode(\.?js)?\b/i], ["Flutter", /\bflutter\b/i], ["Dart", /\bdart\b/i], ["Kotlin", /\bkotlin\b/i],
  ["Android", /\bandroid\b/i], ["iOS", /\bios\b/i], ["Swift", /\bswift\b/i], ["C++", /\bc\+\+/i], ["C", /\bC\b(?![#+])|\blangage c\b/],
  ["C#", /\bc#|\bcsharp\b/i], [".NET", /\.net\b|\bdotnet\b/i], ["PHP", /\bphp\b/i], ["Laravel", /\blaravel\b/i], ["Symfony", /\bsymfony\b/i],
  ["Go", /\bgolang\b|\bgo\b(?= (developer|engineer|dev))/i], ["Rust", /\brust\b/i], ["SQL", /\bsql\b/i], ["PostgreSQL", /\bpostgres(ql)?\b/i],
  ["MySQL", /\bmysql\b/i], ["MongoDB", /\bmongo(db)?\b/i], ["Redis", /\bredis\b/i], ["Docker", /\bdocker\b/i], ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Linux", /\blinux\b/i], ["Git", /\bgit\b/i], ["CI/CD", /\bci\/cd\b|\bjenkins\b|\bgitlab ci\b|\bgithub actions\b/i], ["AWS", /\baws\b/i],
  ["Azure", /\bazure\b/i], ["GCP", /\bgcp\b|\bgoogle cloud\b/i], ["Terraform", /\bterraform\b/i], ["DevOps", /\bdevops\b/i],
  ["Machine Learning", /\bmachine learning\b|\bml\b|\bapprentissage automatique\b/i], ["Deep Learning", /\bdeep learning\b|\bpytorch\b|\btensorflow\b/i],
  ["Data Science", /\bdata scien/i], ["Data Engineering", /\bdata engineer|\bspark\b|\bairflow\b/i], ["NLP", /\bnlp\b|\bllm\b/i],
  ["Pandas", /\bpandas\b/i], ["Embedded", /\bembedded\b|\bembarqu/i], ["STM32", /\bstm32\b/i], ["Arduino", /\barduino\b/i], ["IoT", /\biot\b/i],
  ["RTOS", /\brtos\b|\bfreertos\b/i], ["Cybersecurity", /\bcybers[eé]cu|\bpentest|\bsiem\b|\binfosec|\bsecurity (engineer|analyst|operations)/i],
  ["Network", /\bnetworking\b|\br[eé]seaux? (informatique|ip|d'entreprise)|\bcisco\b|\btcp\/ip\b/i], ["REST API", /\brest(ful)? api|\bapi rest\b|\brestful\b/i], ["GraphQL", /\bgraphql\b/i], ["Microservices", /\bmicroservices?\b/i], ["Agile", /\bagile\b|\bscrum\b/i],
  ["Tailwind", /\btailwind\b/i], ["Figma", /\bfigma\b/i], ["Odoo", /\bodoo\b/i], ["SAP", /\bsap\b/i], ["Power BI", /\bpower ?bi\b/i],
  ["MATLAB", /\bmatlab\b/i], ["Unity", /\bunity\b/i], ["Blockchain", /\bblockchain\b|\bsolidity\b/i],
];

export function extractTags(title: string, description = ""): string[] {
  const text = `${title}\n${description}`;
  const out: string[] = [];
  for (const [name, re] of TECH) {
    if (re.test(text)) out.push(name);
    if (out.length >= 8) break;
  }
  return out;
}

const MONTH_NUM: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1, feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, aout: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
};
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/**
 * Any date-ish input -> yyyy-mm-dd or null. Written dates keep the calendar day they show, whatever their time zone:
 * ISO ("2026-11-12T00:00:00+01:00" is the 12th), RFC 2822 ("Tue, 21 Oct 2026 00:30:00 +0200" is the 21st),
 * "25 octobre 2026", and dd/mm/yyyy as Tunisian and European boards write it. Numbers are epoch ms, or seconds below 1e11.
 */
export function normalizeDate(s?: string | number | null): string | null {
  if (s === undefined || s === null || s === "") return null;
  if (typeof s === "number" || /^\d{9,13}$/.test(String(s).trim())) {
    const n = Number(s);
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const str = s.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(str);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);
  const named = /\b(\d{1,2})(?:er)?\s+([a-zéû]{3,9})\.?,?\s+(\d{4})\b/i.exec(str.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const mon = named && MONTH_NUM[named[2].toLowerCase()];
  if (named && mon) return ymd(+named[3], mon, +named[1]);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(str);
  if (dmy) return ymd(+dmy[3], +dmy[2], +dmy[1]);
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function matchesProfile(job: NewJob, profile: Profile): boolean {
  if (profile.target_types.length && !profile.target_types.includes(job.type)) return false;
  const roles = profile.target_roles.map((r) => r.trim()).filter(Boolean);
  if (!roles.length) return true;
  const title = fold(job.title);
  // "Sales/Business Developer" is a sales role. Checked on the raw title: `fold` rewrites develop* to "dev".
  const raw = job.title.toLowerCase();
  if (/(sales|business)\s+d[ée]velop/.test(raw) && !/(engineer|ing[ée]nieur|software|logiciel|web|full\s?stack)/.test(raw)) return false;
  return roles.some((role) =>
    fold(role)
      .split(/[^a-z0-9#+.]+/)
      .filter((tok) => tok.length >= 4 || tok === "dev" || tok === "data")
      .some((tok) => title.includes(tok)),
  );
}

/**
 * Boards list several contracts per offer ("CDI, SIVP, Stage/PFE"). Only let the
 * contract drive the type when every listed contract is an internship kind.
 */
export function guessTypeWithContract(title: string, contract: string, description = ""): JobType {
  const parts = fold(contract).split(/[,&|/]+|\bet\b/).map((p) => p.trim()).filter(Boolean);
  const internOnly = parts.length > 0 && parts.every((p) => /\b(stage|stagiaire|pfe|intern|internship|alternance)\b/.test(p));
  return guessType(internOnly ? `${title} ${contract}` : title, description);
}

// Keyword search uses a lighter fold than `fold`: "développeur" must not match "développement".
const SYNONYMS: Record<string, string[]> = {
  stage: ["stage", "stagiaire", "intern", "internship"],
  pfe: ["pfe", "fin d etude", "final year project"],
  developpeur: ["developpeur", "developer", "developper"],
  developer: ["developpeur", "developer"],
  ingenieur: ["ingenieur", "engineer"],
  engineer: ["ingenieur", "engineer"],
};

// "full stack", "full-stack" and "fullstack" are one word; "early-stage" is not an internship.
const kwNorm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9#+.]+/g, " ").replace(/\.(?= |$)/g, "")
    .replace(/\b(front|back|full) (end|stack)\b/g, "$1$2").replace(/\b(early|late|seed|growth|multi) stage\b/g, "$1stage").trim();

/** True when any keyword appears as whole words in the text (accent/case-insensitive, plural "s" allowed). Empty list keeps everything. */
export function matchesKeywords(text: string, keywords: string[]): boolean {
  const kws = keywords.map(kwNorm).filter(Boolean).flatMap((k) => SYNONYMS[k] ?? [k]);
  if (!kws.length) return true;
  const hay = ` ${kwNorm(text)} `;
  return kws.some((k) => hay.includes(` ${k} `) || hay.includes(` ${k}s `));
}

const MONTHS = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|fall|winter|printemps|ete|automne|hiver";
const DATE_TAIL = new RegExp(String.raw`\s+[-–—|]\s*(?:(?:${MONTHS})\s*(?:20\d\d)?|20\d\d)\s*$`);

/** Cross-source duplicate key: same company + same title, ignoring accents, case, (H/F) and punctuation. */
export function dedupeKey(company: string, title: string): string {
  const clean = (s: string) =>
    fold(s)
      .replace(/\(?\b[hf]\s*\/\s*[hf]\b\)?/g, " ")
      // "… - janvier 2027" / "… | Summer 2027": a dated repost of the same role (freehire strips the trailing clause).
      .replace(DATE_TAIL, "")
      .replace(/[^a-z0-9#+]+/g, " ")
      .replace(/\b(sarl|suarl|sa|sas|sasu|ltd|llc|inc|gmbh|srl|spa)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${clean(company)}|${clean(title)}`;
}
