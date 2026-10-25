"use server";

import { revalidatePath } from "next/cache";
import { getProfile, updateProfile } from "@/lib/db";
import { JOB_TYPES, type JobType } from "@/lib/types";
import { getEngine } from "@/lib/ai";
import { getProfileExtra, updateProfileExtra } from "@/lib/cv/profile-extra";
import { ONBOARDING_STEPS, mergeSkills, type ProfileDraft } from "@/lib/cv/model";
import { extractSkills } from "@/lib/ai/heuristic";
import { cvKeywords } from "@/lib/search/cv-keywords";
import { cvSkills, defaultKeywords, rerankOpenJobs } from "@/lib/repo/sources";
import { cvForMatching } from "@/lib/repo/offers";

const str = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");
const list = (v: unknown, max = 200, len = 80) =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, len))
    .filter(Boolean)
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
    .slice(0, max);

/** Autosave target for the profile editor and the welcome wizard. Accepts any subset of fields. */
export async function saveProfileDraft(draft: Partial<ProfileDraft>): Promise<{ ok: boolean; at: string }> {
  if (!draft || typeof draft !== "object") return { ok: false, at: new Date().toISOString() };
  const p: Parameters<typeof updateProfile>[0] = {};
  if ("name" in draft) p.name = str(draft.name, 120).trim();
  if ("email" in draft) p.email = str(draft.email, 200).trim();
  if ("headline" in draft) p.headline = str(draft.headline, 300);
  if ("cv_md" in draft) p.cv_md = str(draft.cv_md, 60_000);
  if ("skills" in draft) p.skills = list(draft.skills);
  if ("target_roles" in draft) p.target_roles = list(draft.target_roles, 30, 100);
  if ("target_locations" in draft) p.target_locations = list(draft.target_locations, 30, 100);
  if ("target_types" in draft) p.target_types = list(draft.target_types).filter((t): t is JobType => (JOB_TYPES as string[]).includes(t));
  if (draft.extra && typeof draft.extra === "object") {
    // onboarding progress only changes through its own actions
    const { onboarding: _ignored, ...extra } = draft.extra as Record<string, unknown>;
    void _ignored;
    const next = updateProfileExtra(extra);
    p.languages = next.langs.map((l) => l.name);
    if (p.skills) {
      // drop levels of removed skills
      const keep = new Set(p.skills);
      updateProfileExtra({ skill_levels: Object.fromEntries(Object.entries(next.skill_levels).filter(([k]) => keep.has(k))) });
    }
  }
  if (Object.keys(p).length) updateProfile(p);
  return { ok: true, at: new Date().toISOString() };
}

export async function saveCvMarkdown(md: string): Promise<{ ok: boolean }> {
  updateProfile({ cv_md: str(md, 60_000) });
  revalidatePath("/app/profile");
  return { ok: true };
}

export async function setOnboardingStep(step: number): Promise<void> {
  const s = Number(step);
  if (!Number.isFinite(s)) return;
  updateProfileExtra({ onboarding: { step: Math.min(ONBOARDING_STEPS, Math.max(1, Math.round(s))), done: getProfileExtra().onboarding.done } });
}

/** Mark the wizard finished (or skipped) so the dashboard stops redirecting. */
export async function finishOnboarding(): Promise<void> {
  updateProfileExtra({ onboarding: { step: ONBOARDING_STEPS, done: true } });
  revalidatePath("/app", "layout");
}

/** Whether the online AI is in use (an API key that works), and the engine label. */
export async function aiStatus(): Promise<{ online: boolean; engine: string }> {
  const e = await getEngine(getProfile().settings);
  return { online: e.online, engine: e.label };
}

export async function runCvReview(): Promise<{ ok: true; review: import("@/lib/ai/cv-review").CvReview } | { ok: false; error: string }> {
  const { reviewCv } = await import("@/lib/ai/cv-review");
  const { getCvSource } = await import("@/lib/cv/source");
  const { getLocale } = await import("@/lib/i18n/server");
  const { kvSet } = await import("@/lib/db");
  const cv = getCvSource().text;
  if (cv.trim().length < 80) return { ok: false, error: "empty" };
  const review = await reviewCv(cv, getProfile(), await getLocale());
  kvSet("cv_review", review);
  return { ok: true, review };
}

export async function applyReviewToCv(): Promise<{ ok: true; md: string; engine: string } | { ok: false; error: string }> {
  const { applyCvReview } = await import("@/lib/ai/cv-review");
  const { getCvSource } = await import("@/lib/cv/source");
  const { getLocale } = await import("@/lib/i18n/server");
  const { kvGet } = await import("@/lib/db");
  const review = kvGet<import("@/lib/ai/cv-review").CvReview | null>("cv_review", null);
  const cv = getCvSource().text;
  if (!review) return { ok: false, error: "noreview" };
  if (cv.trim().length < 80) return { ok: false, error: "empty" };
  const r = await applyCvReview(cv, review, getProfile(), await getLocale());
  return { ok: true, ...r };
}

export async function chooseCvSource(pref: string): Promise<{ ok: boolean }> {
  const { setCvSourcePref } = await import("@/lib/cv/source");
  if (pref !== "upload" && pref !== "markdown") return { ok: false };
  setCvSourcePref(pref);
  revalidatePath("/app", "layout");
  return { ok: true };
}

/**
 * After a new or replaced CV: skills and target roles follow the CV (search/cv-keywords.ts), every open offer is
 * re-scored against it, and the keywords for the next scan are returned (the caller runs the scan).
 */
export async function adaptToCv(): Promise<{ roles: string[]; keywords: string[]; skills: string[]; skillsAdded: number; reranked: number }> {
  const profile = getProfile();
  const cv = cvForMatching().text;
  const skills = mergeSkills(profile.skills, extractSkills(cv));
  const { roles } = cvKeywords(cv, profile.headline, cvSkills({ ...profile, skills }, cv));
  updateProfile({ skills, ...(roles.length ? { target_roles: roles } : {}) });
  const reranked = rerankOpenJobs();
  revalidatePath("/app", "layout");
  return { roles, keywords: defaultKeywords(getProfile(), cv), skills, skillsAdded: skills.length - profile.skills.length, reranked };
}
