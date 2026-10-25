// What a CV should leave out or keep short for the country it is sent to. Pure; the CV is Markdown text.
// Sources: Europass guidance, and the US/UK/Canada norm of no personal details that invite discrimination.

export type CvIssue = "birth_date" | "marital_status" | "too_long" | "language";

// Roughly one page of CV text for the US, two elsewhere.
const MAX_WORDS: Record<string, number> = { US: 600, CA: 900, GB: 900 };
const NO_PERSONAL = new Set(["US", "CA", "GB", "IE", "NL"]);
const FRENCH = new Set(["FR", "BE", "LU"]);

const BIRTH = /\b(n[ée]e? le|date de naissance|birth ?date|date of birth|born( on)?|geburtsdatum|geboren am)\b|\b\d{1,2}\s*ans\b|\bage\s*:\s*\d{2}\b/i;
const MARITAL = /\b(c[ée]libataire|mari[ée]e?|pacs[ée]e?|single|married|ledig|verheiratet|situation familiale|marital status|familienstand)\b/i;
const FR_WORDS = /\b(et|des|les|une|pour|avec|dans|exp[ée]rience|comp[ée]tences|formation)\b/gi;
const EN_WORDS = /\b(and|the|with|for|experience|skills|education|projects)\b/gi;

/** Issues for this country, most important first. Unknown countries only get the length check. */
export function cvConventionIssues(cv: string, country: string): CvIssue[] {
  const text = cv ?? "";
  const out: CvIssue[] = [];
  if (NO_PERSONAL.has(country) && BIRTH.test(text)) out.push("birth_date");
  if (NO_PERSONAL.has(country) && MARITAL.test(text)) out.push("marital_status");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > (MAX_WORDS[country] ?? 1100)) out.push("too_long");
  const fr = (text.match(FR_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  if (words > 80 && (FRENCH.has(country) ? en > fr * 2 : !FRENCH.has(country) && country !== "TN" && country !== "CH" && fr > en * 2)) out.push("language");
  return out;
}
