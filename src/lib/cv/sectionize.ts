// Heuristic CV text → Markdown converter (FR/EN) and Markdown CV helpers. Pure, client-safe.
import { detectLanguage } from "@/lib/ai/heuristic";
import type { Locale } from "@/lib/types";

export const SECTION_KEYS = [
  "summary",
  "experience",
  "projects",
  "education",
  "skills",
  "languages",
  "certifications",
  "activities",
  "interests",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<Locale, Record<SectionKey, string>> = {
  fr: {
    summary: "Profil",
    experience: "Expérience",
    projects: "Projets",
    education: "Formation",
    skills: "Compétences",
    languages: "Langues",
    certifications: "Certifications",
    activities: "Vie associative",
    interests: "Centres d'intérêt",
  },
  en: {
    summary: "Summary",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    certifications: "Certifications",
    activities: "Activities",
    interests: "Interests",
  },
};

// Normalized (lowercase, no accents, letters/spaces only) heading synonyms.
const SYNONYMS: Record<SectionKey, string[]> = {
  summary: ["profil", "profile", "resume", "summary", "about me", "a propos", "a propos de moi", "objectif", "objective", "profil professionnel", "professional summary", "career objective"],
  education: ["formation", "formations", "education", "cursus", "parcours academique", "etudes", "academic background", "diplomes", "formation academique", "scolarite", "cursus universitaire"],
  experience: ["experience", "experiences", "experience professionnelle", "experiences professionnelles", "professional experience", "work experience", "stages", "internships", "employment", "parcours professionnel", "stages et experiences"],
  projects: ["projets", "projects", "projets academiques", "academic projects", "projets personnels", "personal projects", "realisations", "projets realises"],
  skills: ["competences", "skills", "competences techniques", "technical skills", "hard skills", "soft skills", "competences informatiques", "technologies", "outils", "savoir faire", "connaissances techniques", "competences cles"],
  languages: ["langues", "languages", "langues parlees", "langages parles"],
  certifications: ["certifications", "certificats", "certificates", "certification", "distinctions", "awards", "honors", "honors and awards", "prix", "certifications et distinctions"],
  activities: ["vie associative", "activites associatives", "activites", "activities", "extracurricular activities", "extra curricular activities", "engagement associatif", "benevolat", "volunteering", "clubs", "activites parascolaires", "leadership"],
  interests: ["centres d interet", "centres d interets", "loisirs", "hobbies", "interests", "interets"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Section key for a heading-like line, or null. */
export function headingKey(line: string): SectionKey | null {
  const raw = line.replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").trim();
  if (!raw || raw.length > 45) return null;
  const n = norm(raw);
  if (!n) return null;
  const words = n.split(" ").length;
  for (const key of SECTION_KEYS) {
    for (const syn of SYNONYMS[key]) {
      if (n === syn || (words <= 4 && n.startsWith(syn + " "))) return key;
    }
  }
  return null;
}

// Bullet glyphs seen in PDF/DOCX text, including private-use Symbol-font bullets.
const BULLET_RE = /^\s*(?:[-*•▪●◦‣⁃–—·»➢➤✓✔]|\d{1,2}[.)])\s+/;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const CONTACT_RE = /@|https?:\/\/|www\.|linkedin|github|\+?\d[\d .-]{7,}\d/i;

export const isBullet = (line: string) => BULLET_RE.test(line);
export const stripBullet = (line: string) => line.replace(BULLET_RE, "").trim();

const isAllCapsTitle = (l: string) =>
  l.length >= 4 && l.length <= 40 && !/\d/.test(l) && /\p{Lu}{3}/u.test(l) && l === l.toUpperCase() && !CONTACT_RE.test(l);

const ENTRY_SECTIONS = new Set<SectionKey | "other">(["experience", "projects", "education", "activities", "certifications"]);
const LIST_SECTIONS = new Set<SectionKey | "other">(["skills", "languages", "interests"]);

/**
 * Turn raw CV text (from a PDF/DOCX/TXT or a paste) into a sectioned Markdown CV.
 * Facts are kept verbatim; only structure (headings, bullets) is added.
 */
export function sectionizeToMarkdown(text: string): string {
  const src = (text ?? "").replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[ \t]+$/gm, "").trim();
  if (!src) return "";
  // Already Markdown with sections: keep it.
  if ((src.match(/^#{1,3} \S/gm) ?? []).length >= 2) return src.replace(/\n{3,}/g, "\n\n") + "\n";

  const locale = detectLanguage(src);
  const lines = src.split("\n").map((l) => l.trim());
  const out: string[] = [];
  let section: SectionKey | "other" | null = null;
  const header: string[] = [];

  const push = (l: string) => out.push(l);
  const last = () => out[out.length - 1] ?? "";
  const nextNonEmpty = (i: number) => {
    for (let k = i + 1; k < lines.length; k++) if (lines[k]) return lines[k];
    return "";
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      if (section && last() !== "") push("");
      continue;
    }
    const key = headingKey(line);
    if (key || (section !== null && isAllCapsTitle(line))) {
      if (section === null) flushHeader(header, out, locale);
      if (last() !== "") push("");
      const title = key ? SECTION_LABELS[locale][key] : titleCase(line);
      push(`## ${title}`);
      push("");
      section = key ?? "other";
      continue;
    }
    if (section === null) {
      header.push(line);
      continue;
    }
    if (isBullet(line)) {
      push(`- ${stripBullet(line)}`);
      continue;
    }
    // Wrapped bullet continuation (lowercase start right after a bullet).
    if (last().startsWith("- ") && /^[\p{Ll}(]/u.test(line)) {
      out[out.length - 1] = `${last()} ${line}`;
      continue;
    }
    if (LIST_SECTIONS.has(section)) {
      const m = line.match(/^([^:]{2,30})\s*:\s*(.+)$/);
      push(m ? `- **${m[1].trim()} :** ${m[2].trim()}` : `- ${line}`);
      continue;
    }
    if (ENTRY_SECTIONS.has(section) && line.length <= 120 && (YEAR_RE.test(line) || isBullet(nextNonEmpty(i)))) {
      if (last() !== "") push("");
      push(`### ${line}`);
      continue;
    }
    // Wrapped paragraph line.
    const prev = last();
    if (prev && !prev.startsWith("#") && !prev.startsWith("- ") && /^[\p{Ll}(]/u.test(line)) {
      out[out.length - 1] = `${prev} ${line}`;
    } else {
      push(line);
    }
  }
  if (section === null) flushHeader(header, out, locale);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function flushHeader(header: string[], out: string[], locale: Locale) {
  if (!header.length) return;
  const rest = [...header];
  const first = rest[0];
  if (first && first.split(/\s+/).length <= 6 && !CONTACT_RE.test(first) && !/\d/.test(first)) {
    out.push(`# ${first}`, "");
    rest.shift();
  }
  const contact = rest.filter((l) => CONTACT_RE.test(l));
  const other = rest.filter((l) => !CONTACT_RE.test(l));
  if (contact.length) {
    const parts = contact.flatMap((l) => l.split(/\s*[|•·]\s*/)).map((x) => x.trim()).filter(Boolean);
    out.push(parts.join(" · "), "");
  }
  if (other.length > 2) {
    out.push(`## ${SECTION_LABELS[locale].summary}`, "", other.join(" "), "");
  } else if (other.length) {
    out.push(`**${other.join(" — ")}**`, "");
  }
  header.length = 0;
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// ---------- Markdown CV structure ----------
export interface CvSection {
  key: SectionKey | "other";
  title: string;
  body: string;
}
export interface CvDoc {
  name: string;
  intro: string; // headline/contact lines before the first section
  sections: CvSection[];
}

export function parseCv(md: string): CvDoc {
  const doc: CvDoc = { name: "", intro: "", sections: [] };
  const intro: string[] = [];
  type Open = { key: CvSection["key"]; title: string; lines: string[] };
  let cur: Open | null = null as Open | null;
  const done: Open[] = [];
  for (const line of (md ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    if (h1 && !doc.name && !cur) {
      doc.name = h1[1].trim();
    } else if (h2) {
      if (cur) done.push(cur);
      const title = h2[1].trim();
      cur = { key: headingKey(title) ?? "other", title, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  if (cur) done.push(cur);
  doc.intro = intro.join("\n").trim();
  doc.sections = done.map((c) => ({ key: c.key, title: c.title, body: c.lines.join("\n").trim() }));
  return doc;
}

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) ?? []).length;

/** ATS-friendly plain text: no Markdown syntax, uppercase section titles. */
export function toPlainText(md: string): string {
  return (md ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      const h = l.match(/^(#{1,6})\s+(.+)$/);
      if (h) return h[1].length === 2 ? `\n${inline(h[2]).toUpperCase()}` : inline(h[2]);
      if (isBullet(l)) return `- ${inline(stripBullet(l))}`;
      return inline(l);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

const inline = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => (t === u ? u : `${t} (${u})`))
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
