"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/db";
import { claudeHealth } from "@/lib/ai/anthropic";
import { AI_KEY, keySource, setProviderKey } from "@/lib/provider-keys";
import { CATALOG } from "@/lib/sources/catalog";
import { scanSource } from "@/lib/sources";

/** One card in Settings > API keys: a keyed board (from the catalog's `needsEnv`) or the AI. Never carries a value. */
export interface KeyGroup {
  id: string;
  name: string;
  site?: string;
  keys: { name: string; source: "app" | "env" | null }[];
}

export async function listKeyGroups(): Promise<KeyGroup[]> {
  const boards = CATALOG.filter((c) => c.needsEnv?.length).map((c) => ({ id: c.kind, name: c.name, site: c.site, keys: c.needsEnv!.map((n) => ({ name: n, source: keySource(n) })) }));
  return [{ id: "ai", name: "Claude", site: "https://console.anthropic.com", keys: [{ name: AI_KEY, source: keySource(AI_KEY) }] }, ...boards];
}

/** Save the keys typed for one group; an empty field clears the Settings value (an .env.local value still applies). */
export async function saveKeys(values: Record<string, string>): Promise<KeyGroup[]> {
  for (const [name, v] of Object.entries(values ?? {})) setProviderKey(String(name), String(v ?? ""));
  revalidatePath("/app", "layout");
  return listKeyGroups();
}

/** "Test": one small real request with the saved keys. Reports success or a short error, never the key. */
export async function testKeys(group: string): Promise<{ ok: boolean; n?: number; error?: string }> {
  if (group === "ai") return (await claudeHealth(true)) ? { ok: true } : { ok: false, error: keySource(AI_KEY) ? "HTTP 401" : "Missing env" };
  const entry = CATALOG.find((c) => c.kind === group && c.needsEnv?.length);
  if (!entry) return { ok: false };
  const r = await scanSource({ kind: entry.kind, handle: "" }, getProfile(), { keepAll: true, keywords: ["intern"] });
  return r.error && !r.total ? { ok: false, error: r.error.replace(/https?:\/\/([^/\s?#]+)\S*/g, "$1").slice(0, 120) } : { ok: true, n: r.total };
}
