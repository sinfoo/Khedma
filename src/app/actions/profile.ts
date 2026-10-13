"use server";

import { revalidatePath } from "next/cache";
import { getProfile, updateProfile } from "@/lib/db";
import { JOB_TYPES, type JobType } from "@/lib/types";
import { getEngine } from "@/lib/ai";
import { ollamaHealth } from "@/lib/ai/ollama";
import { getProfileExtra, updateProfileExtra } from "@/lib/cv/profile-extra";
import { ONBOARDING_STEPS, type ProfileDraft } from "@/lib/cv/model";

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

/** Ollama reachability + whether the configured model is pulled, and the engine Khedma will actually use. */
export async function aiStatus(): Promise<{ ollama: boolean; hasModel: boolean; model: string; engine: string }> {
  const s = getProfile().settings;
  const [h, e] = await Promise.all([ollamaHealth(s.ollama_url), getEngine(s)]);
  const hasModel = h.models.some((m) => m === s.ollama_model || m.split(":")[0] === s.ollama_model);
  return { ollama: h.ok, hasModel, model: s.ollama_model, engine: e.label };
}

export async function saveSettings(formData: FormData) {
  const cur = getProfile().settings;
  updateProfile({
    settings: {
      ...cur,
      ollama_url: str(formData.get("ollama_url"), 300).replace(/\/+$/, "") || cur.ollama_url,
      ollama_model: str(formData.get("ollama_model"), 100) || cur.ollama_model,
    },
  });
  revalidatePath("/app", "layout");
}
