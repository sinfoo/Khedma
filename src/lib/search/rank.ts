// Relevance 0–100 for a found offer, with the reasons behind it. Pure.
import type { NewJob } from "../db";
import type { JobType } from "../types";
import { countryOf, REMOTE_CODE } from "../geo";
import { tokenize } from "../recommend/similarity";
import { dedupeKey } from "../sources/classify";
import { fold, titleMatch, titleTokens, type Positive } from "./filter";

export interface RankContext {
  positives: Positive[];
  keywords: string[];
  types: JobType[];
  places: { countries: string[]; remote: "yes" | "only" | "no" };
  /** Normalized names (see `companyKey`) of tracked companies. */
  tracked: ReadonlySet<string>;
  /** Dedupe keys already produced by this search (another board listed the same role). */
  seen: ReadonlySet<string>;
  /** Skills read from the profile and the CV text; postings that name them rank higher. */
  skills?: string[];
  now?: number;
}

export interface Ranked {
  score: number;
  /** Codes rendered by the UI: "title:dev,data", "type:stage", "place:TN", "remote", "desc:3", "fresh:2", "company", "junior", "dup". */
  why: string[];
}

export const companyKey = (name: string) => fold(name).replace(/[^a-z0-9]+/g, " ").trim();
const JUNIOR = /\b(junior|debutant|graduate|entry[- ]level|jeune diplome)\b/;

export function scoreJob(job: Pick<NewJob, "title" | "company" | "description" | "location" | "remote" | "type" | "posted_at">, ctx: RankContext): Ranked {
  const why: string[] = [];
  let score = 0;

  // Title (45): share of the role words found in the title.
  const roleEntries = ctx.positives.filter((p) => p.tokens.length || p.matcher);
  const m = titleMatch(job.title, ctx.positives);
  if (roleEntries.length) {
    if (m && m.hits.length) {
      score += Math.round(45 * m.score);
      why.push(`title:${m.hits.join(",")}`);
    }
  } else {
    // Only contract words were searched ("stage"): reward titles that say so.
    const t = fold(job.title);
    const hit = ctx.keywords.some((k) => t.includes(fold(k)));
    score += hit ? 35 : 15;
    if (hit) why.push(`title:${ctx.keywords.find((k) => t.includes(fold(k)))}`);
  }

  // Description (20): distinct keyword / role words present in the body.
  const want = new Set<string>([...ctx.positives.flatMap((p) => p.tokens), ...ctx.keywords.flatMap((k) => [...titleTokens(k)])]);
  if (want.size && job.description) {
    const body = new Set(tokenize(job.description.slice(0, 8000)));
    const n = [...want].filter((t) => body.has(t)).length;
    if (n) {
      score += Math.min(4, n) * 5;
      why.push(`desc:${n}`);
    }
  }

  // CV skills (12): distinct profile/CV skills named in the posting.
  if (ctx.skills?.length) {
    const text = fold(`${job.title} ${job.description ?? ""}`.slice(0, 8000));
    const hits = ctx.skills.filter((k) => k && text.includes(fold(k)));
    if (hits.length) {
      score += Math.min(3, hits.length) * 4;
      why.push(`skills:${hits.slice(0, 3).join(",")}`);
    }
  }

  // Type (15 + 5 junior).
  if (!ctx.types.length || ctx.types.includes(job.type)) {
    score += 15;
    why.push(`type:${job.type}`);
  } else if (job.type === "emploi" && JUNIOR.test(fold(job.title))) {
    score += 8;
    why.push("junior");
  }

  // Recency (10).
  const now = ctx.now ?? Date.now();
  if (job.posted_at) {
    const days = Math.max(0, Math.floor((now - new Date(job.posted_at).getTime()) / 86_400_000));
    if (days <= 7) score += 10;
    else if (days <= 30) score += 6;
    if (days <= 30) why.push(`fresh:${days}`);
  } else score += 3;

  // Location (8) / remote (4).
  const code = countryOf(job.location);
  const chosen = ctx.places.countries.filter((c) => c !== REMOTE_CODE);
  if (code && code !== REMOTE_CODE && chosen.includes(code)) {
    score += 8;
    why.push(`place:${code}`);
  } else if ((job.remote || code === REMOTE_CODE) && ctx.places.remote !== "no") {
    score += 4;
    why.push("remote");
  }

  // Tracked company (8), duplicate across boards (-10).
  if (ctx.tracked.has(companyKey(job.company))) {
    score += 8;
    why.push("company");
  }
  if (ctx.seen.has(dedupeKey(job.company, job.title))) {
    score -= 10;
    why.push("dup");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), why };
}
