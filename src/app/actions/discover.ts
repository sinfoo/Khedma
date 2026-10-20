"use server";

import { revalidatePath } from "next/cache";
import { ensureApplication, getJob, getProfile, insertEvaluation, updateProfile } from "@/lib/db";
import { evaluateJob } from "@/lib/ai";
import { eligibilityGates } from "@/lib/ai/gates";
import { getProfileExtra } from "@/lib/cv/profile-extra";
import type { Evaluation } from "@/lib/types";
import { clearModelCache, FIELDS, LEVELS, setOverride, type Field, type Level } from "@/lib/recommend";
import { addProviderSource } from "./sources";

const id = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const refresh = () => revalidatePath("/app/discover");

/** Forget the cached candidate model so the next render recomputes it (and re-runs the AI pass). */
export async function refreshDiscover(): Promise<void> {
  clearModelCache();
  revalidatePath("/app", "layout");
}

/** Pin the detected field / level. Empty values clear the override. */
export async function setDiscoverOverride(input: { field?: string; level?: string }): Promise<{ ok: boolean }> {
  const field = (FIELDS as readonly string[]).includes(String(input?.field ?? "")) ? (input.field as Field) : undefined;
  const level = (LEVELS as readonly string[]).includes(String(input?.level ?? "")) ? (input.level as Level) : undefined;
  setOverride(field || level ? { field, level } : null);
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Append roles to the profile targets (dedupe, case-insensitive). Returns how many were new. */
export async function addTargetRoles(roles: string[]): Promise<number> {
  const clean = (Array.isArray(roles) ? roles : [])
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 10);
  if (!clean.length) return 0;
  const cur = getProfile().target_roles;
  const have = new Set(cur.map((r) => r.toLowerCase()));
  const fresh = clean.filter((r) => !have.has(r.toLowerCase()));
  if (fresh.length) updateProfile({ target_roles: [...cur, ...fresh].slice(0, 30) });
  revalidatePath("/app", "layout");
  return fresh.length;
}

/** One-click add of a recommended board; validation happens in the sources action. */
export async function addRecommendedSource(input: { kind: string; handle: string; label: string; keywords: string[] }) {
  const r = await addProviderSource({
    kind: String(input?.kind ?? ""),
    handle: String(input?.handle ?? ""),
    label: String(input?.label ?? ""),
    keywords: (Array.isArray(input?.keywords) ? input.keywords : []).map(String).join(", "),
  });
  refresh();
  return r;
}

export async function trackRecommended(jobId: number): Promise<number | null> {
  const jid = id(jobId);
  if (!jid || !getJob(jid)) return null;
  const app = ensureApplication(jid);
  revalidatePath("/app", "layout");
  return app.id;
}

export async function evaluateRecommended(jobId: number): Promise<{ ok: boolean; global?: number; verdict?: Evaluation["verdict"]; engine?: string }> {
  const jid = id(jobId);
  const job = jid ? getJob(jid) : null;
  if (!job) return { ok: false };
  try {
    const profile = getProfile();
    const ev = insertEvaluation(await evaluateJob(job, profile, eligibilityGates(job, profile, getProfileExtra().langs)));
    revalidatePath("/app", "layout");
    return { ok: true, global: ev.global, verdict: ev.verdict, engine: ev.engine };
  } catch (e) {
    console.warn("[discover] evaluation failed:", (e as Error).message);
    return { ok: false };
  }
}
