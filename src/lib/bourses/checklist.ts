// The documents an application usually asks for, by study level. A starting list the student ticks off:
// the official call always has the last word. Source: the standard-documents survey in the research notes (2026-11).
import type { StudyLevel } from "./types";

export const DOC_KEYS = [
  "passport",
  "cv",
  "motivation",
  "transcripts",
  "diploma",
  "baccalaureate",
  "rank",
  "recommendations",
  "language",
  "admission",
  "proposal",
  "supervisor",
  "thesis",
  "publications",
  "agreement",
  "translations",
  "legalised",
  "medical",
] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export const isDocKey = (k: unknown): k is DocKey => (DOC_KEYS as readonly unknown[]).includes(k);

const EVERYONE: DocKey[] = ["passport", "cv", "motivation", "transcripts", "language", "translations"];
const BY_LEVEL: Record<StudyLevel, DocKey[]> = {
  licence: ["baccalaureate", "admission"],
  master: ["diploma", "rank", "recommendations", "admission"],
  doctorat: ["diploma", "recommendations", "proposal", "supervisor", "thesis", "publications"],
  postdoc: ["diploma", "proposal", "supervisor", "publications"],
  recherche: ["diploma", "proposal", "supervisor", "publications"],
  court: ["agreement"],
};
/** Government programmes also ask for legalised copies and a medical certificate. */
const STATE: DocKey[] = ["legalised", "medical"];

/** Documents to prepare for a scholarship at these levels, in a stable order. Unknown level: the common core. */
export function docsFor(levels: readonly StudyLevel[], state = false): DocKey[] {
  const wanted = new Set<DocKey>([...EVERYONE, ...levels.flatMap((l) => BY_LEVEL[l]), ...(state ? STATE : [])]);
  return DOC_KEYS.filter((k) => wanted.has(k));
}
