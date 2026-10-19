// "Best for you" shortlist shown when a scan ends: the open, untracked offers that fit the profile best,
// each with the reasons in plain words. New offers from the scan and older ones still open compete together.
import { db, getProfile, listJobs } from "./db";
import { matchBreakdown } from "./match";
import { cvForMatching } from "./repo/offers";
import { ensureSearchSchema, getSearchPrefs } from "./search/store";
import { dedupeKey } from "./sources/classify";

export type PickBasis = "ai" | "estimate" | "keywords";

export interface Pick {
  id: number;
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  /** 1-5. From the AI evaluation, else its offline estimate, else keyword relevance. */
  fit: number;
  basis: PickBasis;
  /** Skills from the posting found in the CV, and the ones it asks for that the CV lacks. */
  found: string[];
  missing: string[];
  /** The posting's level matches the levels in the search preferences. */
  levelFits: boolean | null;
  cvPct: number | null;
  isNew: boolean;
}

export interface Candidate {
  id: number;
  deadline: string | null;
  tracked: boolean;
  /** Latest evaluation, if any. */
  ev: { global: number; verdict: string; engine: string } | null;
  /** Keyword relevance from the scan, 0-100. */
  relevance: number;
  /** Rule-based CV match, 0-100, when computed. Ranks unscored offers better than keyword relevance. */
  cvPct?: number | null;
  /** Same role at the same company (one posting per city): only the best one is kept. */
  key?: string;
}

const BASIS_RANK: Record<PickBasis, number> = { ai: 2, estimate: 1, keywords: 0 };

/** Pure ranking: drops tracked, closed and "skip" offers; at equal fit AI beats estimate beats keywords, then this scan's offers. */
export function rankCandidates(cs: Candidate[], fresh: Set<number>, day: string, n = 5): { id: number; fit: number; basis: PickBasis }[] {
  return cs
    .filter((c) => !c.tracked && (!c.deadline || c.deadline.slice(0, 10) >= day) && c.ev?.verdict !== "skip")
    .map((c) => ({
      key: c.key ?? String(c.id),
      id: c.id,
      basis: (c.ev ? (c.ev.engine === "heuristic" ? "estimate" : "ai") : "keywords") as PickBasis,
      // ponytail: CV match (else keyword relevance) mapped onto 1-3.5, so an offer scored 3.5+ always ranks above an unscored one; replace with one calibrated scale if scores drift.
      fit: c.ev ? c.ev.global : 1 + ((c.cvPct ?? c.relevance) / 100) * 2.5,
    }))
    .sort((a, b) => b.fit - a.fit || BASIS_RANK[b.basis] - BASIS_RANK[a.basis] || Number(fresh.has(b.id)) - Number(fresh.has(a.id)) || b.id - a.id)
    .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i)
    .slice(0, n)
    .map(({ id, fit, basis }) => ({ id, fit, basis }));
}

export function bestPicks(scanIds: number[], n = 5): Pick[] {
  ensureSearchSchema();
  const fresh = new Set(scanIds);
  const relevance = new Map((db().prepare("SELECT id, relevance FROM jobs WHERE archived = 0").all() as { id: number; relevance: number | null }[]).map((r) => [r.id, r.relevance ?? 0]));
  const jobs = new Map(listJobs({ archived: false }).map((j) => [j.id, j]));
  const profile = getProfile();
  const cv = cvForMatching().text;
  const levels = getSearchPrefs().levels;
  const matches = new Map<number, ReturnType<typeof matchBreakdown>>();
  const matchOf = (id: number) => matches.get(id) ?? matches.set(id, matchBreakdown(jobs.get(id)!, profile, cv, levels)).get(id)!;
  const candidates: Candidate[] = [...jobs.values()].map((j) => ({ id: j.id, deadline: j.deadline, tracked: !!j.application, ev: j.evaluation, relevance: relevance.get(j.id) ?? 0, key: dedupeKey(j.company, j.title) }));
  // CV match for the 40 most relevant unscored offers only: it reads each description, so not for the whole list.
  for (const c of candidates.filter((c) => !c.ev && !c.tracked).sort((a, b) => b.relevance - a.relevance).slice(0, 40)) c.cvPct = matchOf(c.id).pct;
  const ranked = rankCandidates(candidates, fresh, new Date().toISOString().slice(0, 10), n);

  return ranked.map(({ id, fit, basis }) => {
    const j = jobs.get(id)!;
    const m = matchOf(id);
    const skills = m.lines.find((l) => l.kind === "skills");
    const level = m.lines.find((l) => l.kind === "seniority");
    return {
      id,
      title: j.title,
      company: j.company,
      location: j.location,
      deadline: j.deadline,
      fit: Math.round(fit * 10) / 10,
      basis,
      found: skills?.kind === "skills" ? skills.found.slice(0, 4) : [],
      missing: skills?.kind === "skills" ? skills.missing.slice(0, 3) : [],
      levelFits: level ? level.ratio > 0 : null,
      cvPct: m.pct,
      isNew: fresh.has(id),
    };
  });
}
