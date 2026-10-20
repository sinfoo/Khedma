// The CV and letter go out as they are: no "[Date]" or "[Nom du recruteur]" left for the user to fill in.
// Known facts replace their placeholder; any other placeholder takes its sentence (or line) with it.
import type { Locale } from "../types";

export interface DocFacts {
  /** Today's date, written out ("20 octobre 2026"). */
  date: string;
  /** Contact name when the user saved one for this application. */
  recipient: string | null;
  /** "du 1 février au 30 juin 2027" style text, or null when unknown. */
  availability: string | null;
}

/** `[text]` that is not a markdown link `[text](url)`. */
const PH = /\[([^\]\n]{1,80})\](?!\()/g;
const DATE_PH = /^(date|date du jour|today'?s date)$/i;
/** "Attention of [name]" lines: dropping them loses nothing worth telling the user. */
const ATTN = /^(à l'attention de|attn\.?|to)\s/i;
const GREETING_PH = /^(madame,? monsieur|dear hiring (manager|team)|hiring manager)$/i;

export function longDate(d: Date, locale: Locale): string {
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function fillPlaceholders(md: string, facts: DocFacts): { md: string; dropped: string[] } {
  const out: string[] = [];
  const dropped: string[] = [];
  for (const line of md.split("\n")) {
    let l = line.replace(PH, (m, inner: string) => {
      const x = inner.trim();
      if (DATE_PH.test(x)) return facts.date;
      if (GREETING_PH.test(x)) return x;
      return m;
    });
    if (!hasPlaceholder(l)) {
      out.push(l);
      continue;
    }
    // Drop only the sentences that still hold a placeholder; drop the line when nothing useful is left.
    l = l
      .split(/(?<=[.!?:])\s+/)
      .filter((s) => !hasPlaceholder(s) || (!ATTN.test(s.trim()) && dropped.push(s.trim()), false))
      .join(" ");
    const rest = l.replace(/[*_#>\-\s,.;:]/g, "");
    if (rest && !/^(à l'attention de|attn|to)$/i.test(l.replace(/[*_:]/g, "").trim())) out.push(l);
  }
  return { md: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", dropped };
}

/** Markdown joins single newlines into one paragraph; documents mean them (address blocks, "Company · Role · Dates"). */
export function hardBreaks(md: string): string {
  return md.replace(/([^\n\\])\n(?=[^\n])(?!\s*([-*+] |\d+[.)] |#|\||>))/g, "$1\\\n");
}

const hasPlaceholder = (s: string) => new RegExp(PH.source).test(s);
