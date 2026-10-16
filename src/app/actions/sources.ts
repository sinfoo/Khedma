"use server";

import { revalidatePath } from "next/cache";
import { addSource, deleteSource, updateSource } from "@/lib/db";
import { CATALOG, SUGGESTED_SOURCES, SUGGESTED_TN_SOURCES, isProviderKind } from "@/lib/sources";
import { validatePublicUrl } from "@/lib/sources/url";
import {
  AUTO_HOURS,
  createSourceRow,
  getAutoScan,
  getSearchPrefs,
  lastRunAt,
  listSourceRows,
  runScan,
  setAutoScan as saveAutoScan,
  setSearchPrefs as savePrefs,
  sweep,
  trackCompany,
  updateSourceRow,
  type SourceInput,
} from "@/lib/repo/sources";
import { normalizePrefs, type SearchPrefs } from "@/lib/search/prefs";
import type { Source } from "@/lib/types";

const id = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

const parseKeywords = (v: unknown) =>
  [...new Set(String(v ?? "").split(/[,;\n]+/).map((s) => s.trim().slice(0, 40)).filter(Boolean))].slice(0, 8);

/** Validate a source definition from the client (trust boundary). */
function clean(input: { kind?: unknown; label?: unknown; handle?: unknown; keywords?: unknown; keep_all?: unknown }): SourceInput | { error: string } {
  const kind = String(input.kind ?? "");
  if (!isProviderKind(kind)) return { error: "kind" };
  const entry = CATALOG.find((c) => c.kind === kind)!;
  let handle = String(input.handle ?? "").trim().slice(0, 500);
  if (entry.handle.type === "none") handle = "";
  else if (entry.handle.type === "select") {
    if (!entry.handle.options.some((o) => o.value === handle)) return { error: "handle" };
  } else if (entry.handle.type === "slug") {
    handle = handle.toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(handle)) return { error: "handle" };
  } else if (!validatePublicUrl(handle).url) return { error: "handle" };
  const optionLabel = entry.handle.type === "select" ? entry.handle.options.find((o) => o.value === handle)?.label : undefined;
  const label = String(input.label ?? "").trim().slice(0, 80) || (handle && optionLabel ? `${entry.name} – ${optionLabel}` : handle && entry.handle.type === "slug" ? handle : entry.name);
  return { kind, handle, label, keywords: parseKeywords(input.keywords), keep_all: input.keep_all === true || input.keep_all === "on" };
}

export async function addProviderSource(input: { kind: string; label?: string; handle?: string; keywords?: string; keep_all?: boolean }): Promise<{ ok: boolean; id?: number; error?: "kind" | "handle" | "duplicate" }> {
  const s = clean(input);
  if ("error" in s) return { ok: false, error: s.error as "kind" | "handle" };
  const newId = createSourceRow(s);
  if (!newId) return { ok: false, error: "duplicate" };
  revalidatePath("/app/sources");
  return { ok: true, id: newId };
}

export async function updateSourceSettings(sourceId: number, input: { label?: string; keywords?: string; keep_all?: boolean }) {
  const n = id(sourceId);
  if (!n) return;
  updateSourceRow(n, {
    ...(input.label !== undefined && String(input.label).trim() ? { label: String(input.label).trim().slice(0, 80) } : {}),
    ...(input.keywords !== undefined ? { keywords: parseKeywords(input.keywords) } : {}),
    ...(input.keep_all !== undefined ? { keep_all: !!input.keep_all } : {}),
  });
  revalidatePath("/app/sources");
}

/** Kept for older callers: FormData-based add of an API/RSS source. */
export async function createSource(fd: FormData) {
  await addProviderSource({ kind: String(fd.get("kind") ?? ""), label: String(fd.get("label") ?? ""), handle: String(fd.get("handle") ?? "") });
}

export async function toggleSource(sourceId: number, enabled: boolean) {
  const n = id(sourceId);
  if (!n) return;
  updateSource(n, { enabled: !!enabled });
  revalidatePath("/app/sources");
}

export async function removeSource(sourceId: number) {
  const n = id(sourceId);
  if (!n) return;
  deleteSource(n);
  revalidatePath("/app/sources");
}

export async function loadSuggestedSources(set: "tn" | "intl" | "all" = "all") {
  if (set !== "intl") for (const s of SUGGESTED_TN_SOURCES) createSourceRow({ ...s, keywords: [], keep_all: false });
  if (set !== "tn") for (const s of SUGGESTED_SOURCES) addSource(s as Pick<Source, "kind" | "label" | "handle">);
  revalidatePath("/app/sources");
}

/** Non-streaming scan of one source (the page uses the streaming route; this stays for other callers). */
export async function scanOne(sourceId: number): Promise<{ added: number; total: number; error?: string }> {
  const run = await runScan({ ids: [id(sourceId)] });
  revalidatePath("/app", "layout");
  const d = run?.detail[0];
  return { added: d?.added ?? 0, total: d?.listed ?? 0, error: run ? d?.error : "busy" };
}

export async function scanAll(): Promise<{ added: number }> {
  const run = await runScan();
  revalidatePath("/app", "layout");
  return { added: run?.added ?? 0 };
}

export async function getAutoScanState() {
  return { ...getAutoScan(), lastRunAt: lastRunAt() };
}

export async function setAutoScan(enabled: boolean, hours: number) {
  const h = AUTO_HOURS.includes(hours as (typeof AUTO_HOURS)[number]) ? hours : 6;
  saveAutoScan({ enabled: !!enabled, hours: h });
  revalidatePath("/app/sources");
}

/** Tracked company from a careers URL (ATS auto-detected). `name` overrides the detected label. */
export async function addTrackedCompany(url: string, name?: string) {
  const u = String(url ?? "").trim().slice(0, 1000);
  if (!u) return { ok: false as const, error: "invalid" as const };
  const r = await trackCompany(u, name ? String(name).slice(0, 80) : undefined);
  if (r.ok) revalidatePath("/app/sources");
  return r;
}

export async function loadSearchPrefs(): Promise<SearchPrefs> {
  return getSearchPrefs();
}

/** Work preferences for the search (validated server-side). */
export async function saveSearchPrefs(prefs: Partial<SearchPrefs>): Promise<SearchPrefs> {
  const next = savePrefs(normalizePrefs(prefs));
  revalidatePath("/app", "layout");
  return next;
}

/** Deadline sweep + mass-posting consolidation on demand. */
export async function runSweep(): Promise<{ urgent: number; merged: number; expired: number }> {
  const r = sweep();
  revalidatePath("/app", "layout");
  return { urgent: r.urgent.length, merged: r.merged.length, expired: r.expired.length };
}

/** First search with no sources: add the Tunisian boards and LinkedIn's public search, return the enabled list. */
export async function prepareSearchSources(): Promise<{ id: number; label: string; kind: string }[]> {
  const before = listSourceRows().filter((s) => s.enabled);
  if (before.length === 0) {
    for (const s of SUGGESTED_TN_SOURCES) createSourceRow({ ...s, keywords: [], keep_all: false });
    createSourceRow({ kind: "linkedin", label: "LinkedIn (recherche publique)", handle: "", keywords: [], keep_all: false });
    revalidatePath("/app", "layout");
  }
  return listSourceRows()
    .filter((s) => s.enabled)
    .map((s) => ({ id: s.id, label: s.label, kind: s.kind }));
}
