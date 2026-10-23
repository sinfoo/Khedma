"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, getProfile, kvGet, kvSet, updateProfile } from "@/lib/db";
import { aiText, getEngine } from "@/lib/ai";
import { claudeConfigured, claudeHealth } from "@/lib/ai/anthropic";
import { resetAll } from "@/app/api/backup/backup";
import type { Settings } from "@/lib/types";

const PROVIDERS: Settings["provider"][] = ["auto", "offline"];
const CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"];
// The shell reads this cookie to set <html data-motion="reduce">.
const MOTION_COOKIE = "khedma_motion";

/** Claude status for the settings page. Never returns or logs the key itself. */
export async function claudeStatus(): Promise<{ configured: boolean; working: boolean }> {
  return { configured: claudeConfigured(), working: await claudeHealth() };
}

type EngineInput = { provider?: string; claude_model?: string };

/** Validated settings merged over the saved ones (unknown values keep the current setting). */
function merge(input: EngineInput): Settings {
  const cur = getProfile().settings;
  return {
    ...cur,
    provider: PROVIDERS.includes(input.provider as Settings["provider"]) ? (input.provider as Settings["provider"]) : cur.provider,
    claude_model: CLAUDE_MODELS.includes(String(input.claude_model)) ? String(input.claude_model) : cur.claude_model,
  };
}

export async function saveEngineSettings(input: EngineInput): Promise<{ ok: boolean; engine: string }> {
  const settings = merge(input);
  updateProfile({ settings });
  revalidatePath("/app", "layout");
  return { ok: true, engine: (await getEngine(settings)).label };
}

/** Tiny completion through the same path every feature uses; reports engine + latency. */
export async function testEngine(input: EngineInput): Promise<{ engine: string; ms: number; text: string }> {
  const settings = merge(input);
  const locale = settings.locale === "en" ? "en" : "fr";
  const t0 = Date.now();
  const { text, engine } = await aiText(
    settings,
    [
      { role: "system", content: "You are a concise assistant for an engineering student's job search. Answer in one sentence." },
      {
        role: "user",
        content: locale === "fr" ? "Donne un conseil en une phrase pour décrocher un stage PFE en Tunisie." : "Give one sentence of advice for landing a final-year internship in Tunisia.",
      },
    ],
    () =>
      locale === "fr"
        ? "Ciblez 10 entreprises, adaptez votre CV à chaque offre et relancez une semaine après votre candidature."
        : "Target 10 companies, tailor your CV to each offer and follow up one week after applying.",
  );
  return { engine, ms: Date.now() - t0, text: text.slice(0, 600) };
}

export async function getMotion(): Promise<"reduce" | "system"> {
  return (await cookies()).get(MOTION_COOKIE)?.value === "reduce" ? "reduce" : "system";
}

export async function setMotion(v: string) {
  (await cookies()).set(MOTION_COOKIE, v === "reduce" ? "reduce" : "system", { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

const NOTIFY_KEY = "settings:notify";
export async function getNotify(): Promise<boolean> {
  return kvGet<boolean>(NOTIFY_KEY, false);
}
export async function setNotify(enabled: boolean) {
  kvSet(NOTIFY_KEY, !!enabled);
}

/** Open reminders whose due date/time has passed (local time), oldest first. */
export async function dueReminders(): Promise<{ id: number; title: string; due_at: string }[]> {
  if (!kvGet<boolean>(NOTIFY_KEY, false)) return [];
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const rows = db().prepare("SELECT id, title, due_at FROM reminders WHERE done = 0 AND due_at <= ? ORDER BY due_at LIMIT 20").all(local);
  return rows.map((r) => ({ id: Number(r.id), title: String(r.title), due_at: String(r.due_at) }));
}

/** Destructive: needs the literal word RESET typed by the user. */
export async function resetData(confirm: string): Promise<{ ok: boolean }> {
  if (confirm !== "RESET") return { ok: false };
  resetAll();
  revalidatePath("/app", "layout");
  return { ok: true };
}
