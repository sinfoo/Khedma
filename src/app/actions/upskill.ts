"use server";

import { revalidatePath } from "next/cache";
import { getProfile, kvGet, kvSet, listJobs, updateProfile } from "@/lib/db";
import { buildUpskillPlan } from "@/lib/ai";
import { getLocale } from "@/lib/i18n/server";
import { markAllSteps, setStepDone } from "@/lib/repo/insights";
import type { UpskillPlan } from "@/lib/types";

export async function generateUpskillPlan() {
  const jobs = listJobs().filter((j) => !j.evaluation || j.evaluation.verdict !== "skip");
  const plan = await buildUpskillPlan(jobs, getProfile(), await getLocale());
  kvSet("upskill_plan", plan);
  revalidatePath("/app/upskill");
}

const planSkill = (skill: unknown) => {
  const s = String(skill ?? "").slice(0, 80);
  return kvGet<UpskillPlan | null>("upskill_plan", null)?.plan.find((p) => p.skill === s) ?? null;
};

export async function toggleStep(skill: string, step: number, done: boolean) {
  const p = planSkill(skill);
  const i = Number(step);
  if (!p || !Number.isInteger(i) || i < 0 || i >= p.steps.length) return;
  setStepDone(p.skill, i, !!done);
  revalidatePath("/app/upskill");
}

/** Add a skill to the profile (and close its plan steps). */
export async function markSkillAcquired(skill: string) {
  const s = String(skill ?? "").trim().slice(0, 80);
  if (!s) return;
  const profile = getProfile();
  if (!profile.skills.some((x) => x.toLowerCase() === s.toLowerCase())) updateProfile({ skills: [...profile.skills, s] });
  const p = planSkill(s);
  if (p) markAllSteps(p.skill, p.steps.length);
  revalidatePath("/app", "layout");
}
