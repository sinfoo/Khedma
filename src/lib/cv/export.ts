// Export hygiene: ATS-safe unicode, paper size by target country, plain ATS text with
// standard headings, keyword coverage against one offer. Pure, client-safe.
import { extractSkills } from "@/lib/ai/heuristic";
import { countryOf } from "@/lib/geo";
import type { Locale } from "@/lib/types";
import { isBullet, parseCv, SECTION_LABELS, stripBullet } from "./sectionize";

export type Paper = "a4" | "letter";

/** Characters ATS parsers garble, mapped to ASCII; zero-width and NBSP cleaned. Keeps accents. */
export function normalizeForAts(text: string): string {
  return (text ?? "")
    .replace(/[​-‏⁠﻿­]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[—―]/g, " - ")
    .replace(/–/g, "-")
    // Non-breaking hyphen falls back to another font in PDFs; tabs and wide spaces break ATS word splitting.
    .replace(/[‐‑]/g, "-")
    .replace(/[\t　 - ]/g, " ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•▪●◦‣∙]/g, "-")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ {2,}/g, " ")
    .replace(/ +$/gm, "");
}

const LETTER_COUNTRIES = new Set(["US", "CA", "MX"]);

/** Letter when the first target country prints Letter, else A4 (Tunisia, Europe, Gulf). */
export function paperFor(countries: string[]): Paper {
  const first = countries.find((c) => c !== "REMOTE");
  return first && LETTER_COUNTRIES.has(first.toUpperCase()) ? "letter" : "a4";
}

/** Paper for one offer's location when it names a country, else null. */
export function paperForLocation(location: string): Paper | null {
  const c = countryOf(location ?? "");
  return c && c !== "REMOTE" ? paperFor([c]) : null;
}

const inline = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => (t === u ? u : `${t} (${u})`))
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{3,6}\s+/, "");

/**
 * Single-column plain text for ATS upload: name, contact, then each section under its
 * standard uppercase heading in `locale` (unknown sections keep their title).
 */
export function atsPlainText(markdown: string, locale: Locale): string {
  const doc = parseCv(normalizeForAts(markdown));
  const out: string[] = [];
  if (doc.name) out.push(doc.name.toUpperCase());
  for (const l of doc.intro.split("\n")) if (l.trim()) out.push(inline(l.trim()));
  for (const sec of doc.sections) {
    const title = sec.key === "other" ? sec.title : SECTION_LABELS[locale][sec.key];
    out.push("", title.toUpperCase());
    for (const raw of sec.body.split("\n")) {
      const l = raw.trim();
      if (!l) continue;
      out.push(isBullet(l) ? `- ${inline(stripBullet(l))}` : inline(l));
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Share of the offer's recognised skills present in the CV text. */
export function keywordCoverage(offerText: string, cv: string) {
  const keywords = extractSkills(offerText ?? "");
  const have = new Set(extractSkills(cv ?? "").map((s) => s.toLowerCase()));
  const present = keywords.filter((k) => have.has(k.toLowerCase()));
  const missing = keywords.filter((k) => !have.has(k.toLowerCase()));
  return { keywords, present, missing, pct: keywords.length ? Math.round((present.length / keywords.length) * 100) : null };
}
