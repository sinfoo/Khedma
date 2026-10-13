// Fact gate: every number, year, tool and organisation in a generated text must exist
// in the source CV. Deterministic, client-safe. Catches invented facts, never judges wording.
import { extractSkills } from "@/lib/ai/heuristic";

export type FactKind = "number" | "year" | "tool" | "org";

export interface FactFinding {
  kind: FactKind;
  /** The invented value as written in the generated text. */
  value: string;
  /** The sentence or bullet that contains it. */
  sentence: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

// Text with [placeholders], URLs, emails and markdown link targets removed: those never carry claims.
const claims = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/\[[^\]\n]{1,80}\]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")
    .replace(/\([^)]*\)/g, (m) => (/https?:|www\./i.test(m) ? " " : m));

const YEAR = /\b(?:19|20)\d{2}\b/g;
const NUMBER = /(?<![\w./-])\d[\d.,/]*\d%?|(?<![\w./-])\d%?(?![\w/-])/g;
const normNum = (n: string) => n.replace(/[,%]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/\.$/, "");

const ORG_MARK = /(?:\b(?:chez|at|with|pour|for|de la soci[ée]t[ée]|de l['’]entreprise|@)\s+)((?:\p{Lu}[\p{L}\p{N}&'’.-]*)(?:\s+(?:\p{Lu}[\p{L}\p{N}&'’.-]*|de|du|des|of|and|&))*)/gu;
const SCHOOL = /\b(?:universit[ée]|university|[ée]cole|institut|institute|lyc[ée]e|facult[ée]|faculty|college)\b(?:\s+(?:[\p{L}\p{N}'’-]+)){1,4}/giu;
const ACRONYM = /\b[A-Z][A-Z0-9]{2,6}\b/g;
const ACRONYM_IGNORE = new Set([
  "CV", "PFE", "PDF", "URL", "ATS", "HTTP", "HTTPS", "JSON", "XML", "HTML", "CSS", "API", "APIS", "REST", "SQL", "UML", "OOP", "CRUD", "CI", "CD",
  "QA", "UX", "UI", "IT", "AI", "ML", "IOT", "CEO", "CTO", "HR", "RH", "TND", "DT", "EUR", "USD", "MVP", "SDK", "IDE", "OS", "ENIT", "TOEIC", "TOEFL",
  "IELTS", "GPA", "SAAS", "B2B", "B2C", "ERP", "CRM", "KPI", "SEO", "LLM", "LLMS", "NLP", "GPU", "CPU", "RAM", "TCP", "IP", "DNS", "VPN", "SSH", "AWS",
  "GCP", "JWT", "SSO", "STAR", "FR", "EN", "AR",
]);

const sentencesOf = (s: string) => s.split(/\n+|(?<=\D[.!?])\s+(?=\p{Lu})/u).map((x) => x.trim()).filter(Boolean);

/**
 * Facts in `generated` that do not appear in `source` (accent/case-insensitive).
 * Numbers: digits must match after dropping separators. Tools: `extractSkills` canonical names.
 * Orgs: names after "chez/at/@", school phrases and new ALL-CAPS acronyms.
 */
export function checkFacts(source: string, generated: string): FactFinding[] {
  const srcClaims = claims(source ?? "");
  const srcFold = fold(srcClaims);
  const srcNums = new Set([...(srcClaims.match(NUMBER) ?? []), ...(srcClaims.replace(YEAR, " ").match(NUMBER) ?? [])].map(normNum));
  const srcYears = new Set(srcClaims.match(YEAR) ?? []);
  const srcTools = new Set(extractSkills(source ?? "").map((t) => t.toLowerCase()));
  const srcAcr = new Set((source ?? "").match(ACRONYM) ?? []);
  const out: FactFinding[] = [];
  const seen = new Set<string>();
  const add = (kind: FactKind, value: string, sentence: string) => {
    const key = `${kind}:${fold(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value: value.trim(), sentence: sentence.slice(0, 240) });
  };
  const inSource = (phrase: string) => srcFold.includes(fold(phrase));

  for (const sentence of sentencesOf(claims(generated ?? ""))) {
    const body = sentence.replace(/^[-*•]\s+|^#+\s+|^\d{1,2}[.)]\s+/, "");
    for (const y of body.match(YEAR) ?? []) if (!srcYears.has(y)) add("year", y, body);
    const noYears = body.replace(YEAR, " ");
    for (const n of noYears.match(NUMBER) ?? []) {
      if (/^\d{1,2}\.$/.test(n) || n.length > 14) continue; // list numbering, phone-like runs
      if (!srcNums.has(normNum(n))) add("number", n, body);
    }
    const tools = extractSkills(body);
    for (const t of tools) if (!srcTools.has(t.toLowerCase()) && !tools.some((u) => u !== t && u.toLowerCase().includes(t.toLowerCase()))) add("tool", t, body);
    for (const m of body.matchAll(ORG_MARK)) {
      const org = m[1].replace(/[.,;:'’]+$/, "");
      if (org.length > 2 && !inSource(org) && !extractSkills(org).length) add("org", org, body);
    }
    for (const m of body.match(SCHOOL) ?? []) if (!inSource(m)) add("org", m, body);
    for (const a of body.match(ACRONYM) ?? []) if (!ACRONYM_IGNORE.has(a) && !srcAcr.has(a) && !srcTools.has(a.toLowerCase()) && !inSource(a)) add("org", a, body);
  }
  return out;
}
