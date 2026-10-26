// Course recommendations from the student's gaps: skills the target offers ask for and the CV lacks, the target
// roles, and the language they apply in. Offline ranking always works; the AI re-ranks the best ones when a key
// is set. Server only.
import { createHash } from "node:crypto";
import { kvGet, kvSet } from "../db";
import { tryEngine } from "../ai";
import type { Prompt } from "../ai/prompts";
import type { Locale, Settings } from "../types";
import { coursesMatching } from "./store";
import type { Course } from "./model";

export type Reason = { kind: "gap"; skill: string; n: number } | { kind: "role"; role: string } | { kind: "lang"; lang: string } | { kind: "free" } | { kind: "cert" };
export interface Recommendation {
  course: Course;
  score: number;
  reasons: Reason[];
  /** The AI's one-line reason, when it ranked the list. */
  why?: string;
}
export interface RecommendInput {
  gaps: { skill: string; demand: number }[];
  roles: string[];
  have: string[];
  lang: Locale;
  limit?: number;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const has = (text: string, word: string) => new RegExp(`(^|[^a-z0-9+#])${fold(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9+#])`).test(text);
// Words that say what kind of job, not what to learn.
const ROLE_STOP = new Set(["stage", "stagiaire", "intern", "internship", "pfe", "junior", "senior", "engineer", "ingenieur", "developer", "developpeur", "dev", "h/f", "f/h", "alternance"]);

/** Rank catalog courses for the student. Pure apart from the catalog read. */
export function recommendCourses(input: RecommendInput): Recommendation[] {
  const gaps = input.gaps.filter((g) => g.skill.trim()).slice(0, 12);
  const roleWords = [...new Set(input.roles.flatMap((r) => fold(r).split(/[^a-z0-9+#.]+/)).filter((w) => w.length >= 3 && !ROLE_STOP.has(w)))].slice(0, 8);
  const have = new Set(input.have.map(fold));
  const pool = coursesMatching([...gaps.map((g) => g.skill), ...roleWords]);
  const scored: Recommendation[] = [];
  for (const c of pool) {
    const title = fold(c.title);
    const text = `${title} ${fold(c.skills.join(" "))} ${fold(c.description.slice(0, 300))}`;
    const reasons: Reason[] = [];
    let score = 0;
    const add = (n: number, r?: Reason) => {
      score += n;
      if (r) reasons.push(r);
    };
    for (const g of gaps) {
      if (have.has(fold(g.skill))) continue;
      if (has(title, g.skill)) add(12 + 3 * Math.min(g.demand, 6), { kind: "gap", skill: g.skill, n: g.demand });
      else if (has(text, g.skill)) add(5 + Math.min(g.demand, 6), { kind: "gap", skill: g.skill, n: g.demand });
    }
    const role = roleWords.find((w) => has(title, w));
    if (role) add(4, { kind: "role", role });
    if (!score) continue;
    // Something they already know is a weaker pick.
    if (c.skills.length && c.skills.every((s) => have.has(fold(s)))) add(-6);
    if (c.languages.includes(input.lang)) add(3, input.lang !== "en" ? { kind: "lang", lang: input.lang } : undefined);
    else if (c.languages.includes("en")) add(1);
    if (c.price === "free" || c.price === "coupon") add(3, { kind: "free" });
    else if (c.price === "freemium") add(2);
    if (c.cert === "proctored" || c.cert === "credit") add(2, { kind: "cert" });
    else if (c.cert !== "none") add(1);
    if (c.duration_min && c.duration_min <= 40 * 60) add(1);
    scored.push({ course: c, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score || a.course.id - b.course.id);
  // Variety: at most 3 courses for the same first gap and 4 from the same source.
  const perGap = new Map<string, number>();
  const perSource = new Map<string, number>();
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const r of scored) {
    const key = fold(r.course.title);
    const gap = r.reasons.find((x) => x.kind === "gap") as Extract<Reason, { kind: "gap" }> | undefined;
    const g = gap?.skill ?? "_";
    if (seen.has(key) || (perGap.get(g) ?? 0) >= 3 || (perSource.get(r.course.source) ?? 0) >= 4) continue;
    seen.add(key);
    perGap.set(g, (perGap.get(g) ?? 0) + 1);
    perSource.set(r.course.source, (perSource.get(r.course.source) ?? 0) + 1);
    out.push(r);
    if (out.length >= (input.limit ?? 12)) break;
  }
  return out;
}

// ---------- AI re-ranking (only with a key; cached a day for the same list) ----------
function rankPrompt(input: RecommendInput, recs: Recommendation[]): Prompt {
  return {
    system: `You help an engineering student choose courses. From the numbered candidates, pick up to 8 that best close the student's gaps for the jobs they target, best first. Prefer free or audit-able courses and recognised certificates (vendor exams, university credit) when two are close. Never invent courses: only use the given ids.
For each pick write "why": one short sentence in ${input.lang === "fr" ? "French" : "English"} naming the gap it closes. Output JSON only.`,
    user: `TARGET ROLES: ${input.roles.join(", ") || "[none]"}
GAPS (skill: number of target offers asking for it): ${input.gaps.map((g) => `${g.skill}: ${g.demand}`).join(", ") || "[none]"}
ALREADY KNOWS: ${input.have.slice(0, 30).join(", ") || "[none]"}

CANDIDATES:
${recs.map((r, i) => `${i + 1}. [id ${r.course.id}] ${r.course.title} — ${r.course.provider} — ${r.course.price}/${r.course.cert}${r.course.duration_min ? ` — ${Math.round(r.course.duration_min / 60)} h` : ""}`).join("\n")}`,
    schema: {
      type: "object",
      properties: { picks: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, why: { type: "string" } }, required: ["id", "why"] } } },
      required: ["picks"],
    },
  };
}

/** The AI's order and reasons over the offline candidates; null when no AI is configured or it fails. */
export async function aiRankCourses(settings: Settings, input: RecommendInput, recs: Recommendation[]): Promise<{ recs: Recommendation[]; engine: string } | null> {
  if (recs.length < 2) return null;
  const key = `learn:ai:${createHash("sha1").update(JSON.stringify([input, recs.map((r) => r.course.id)])).digest("hex").slice(0, 16)}`;
  const cached = kvGet<{ at: number; ids: { id: number; why: string }[]; engine: string } | null>(key, null);
  let picks = cached && Date.now() - cached.at < 86_400_000 ? cached : null;
  if (!picks) {
    const r = await tryEngine(settings, rankPrompt(input, recs.slice(0, 25)), (raw, engine) => {
      const list = (raw as { picks?: { id?: unknown; why?: unknown }[] })?.picks ?? [];
      return { ids: list.filter((p) => Number.isInteger(p.id)).map((p) => ({ id: Number(p.id), why: String(p.why ?? "").slice(0, 200) })), engine };
    });
    if (!r?.ids.length) return null;
    picks = { at: Date.now(), ...r };
    kvSet(key, picks);
  }
  const byId = new Map(recs.map((r) => [r.course.id, r]));
  const ranked = picks.ids.flatMap((p) => (byId.has(p.id) ? [{ ...byId.get(p.id)!, why: p.why }] : []));
  return ranked.length ? { recs: ranked, engine: picks.engine } : null;
}
