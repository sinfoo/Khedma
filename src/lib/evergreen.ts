// "Possibly evergreen" hint (freehire's job-reality dictionary, MIT): a standing call for CVs rather
// than a live opening. Curated phrases plus reposts of the same role. A hint with its reasons, never a verdict.
import { fold } from "./sources/classify";

const PHRASES = [
  "always hiring", "always looking for", "talent pool", "talent community", "talent network", "general application",
  "open application", "future opportunities", "future openings", "ongoing recruitment",
  "candidature spontanee", "vivier", "nous recrutons en permanence", "recrutons en continu",
];
/** Distinct postings of one role (company + title) before it counts as reposted (freehire's threshold). */
export const REPOST_MIN = 3;

export type EvergreenReason = { kind: "phrase"; phrase: string } | { kind: "reposts"; n: number } | { kind: "restamped"; days: number };
/** Days between Khedma first storing an offer and the newer posting date it later shows (open-jobs' "re-stamped"). */
export const RESTAMP_DAYS = 14;

/** `dates`: when the offer says it was posted, and when Khedma first stored it. A posting date well after the day
 * Khedma first saw the offer means the same ad was re-dated to look new. */
export function evergreenReasons(text: string, postings: number, dates?: { posted_at: string | null; created_at: string }): EvergreenReason[] {
  const t = fold(text);
  const out: EvergreenReason[] = PHRASES.filter((p) => t.includes(p)).slice(0, 2).map((phrase) => ({ kind: "phrase", phrase }));
  if (postings >= REPOST_MIN) out.push({ kind: "reposts", n: postings });
  if (dates?.posted_at) {
    const days = Math.floor((Date.parse(dates.posted_at) - Date.parse(dates.created_at.replace(" ", "T"))) / 86_400_000);
    if (days >= RESTAMP_DAYS) out.push({ kind: "restamped", days });
  }
  return out;
}
