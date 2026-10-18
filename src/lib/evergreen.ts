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

export type EvergreenReason = { kind: "phrase"; phrase: string } | { kind: "reposts"; n: number };

export function evergreenReasons(text: string, postings: number): EvergreenReason[] {
  const t = fold(text);
  const out: EvergreenReason[] = PHRASES.filter((p) => t.includes(p)).slice(0, 2).map((phrase) => ({ kind: "phrase", phrase }));
  if (postings >= REPOST_MIN) out.push({ kind: "reposts", n: postings });
  return out;
}
