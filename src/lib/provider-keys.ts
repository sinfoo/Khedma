// API keys for the keyed job boards and the AI. Entered in Settings (stored in kv, never exported or shown
// back) or set in .env.local; the Settings value wins. Server only: never import from a client component.
import { db, kvGet, kvSet } from "./db";
import { CATALOG } from "./sources/catalog";

/** kv prefix: under "settings:" so "Reset all data" keeps the keys; the backup export skips it. */
export const KEY_PREFIX = "settings:secret:";
export const AI_KEY = "ANTHROPIC_API_KEY";

/** Every key name the app reads: the catalog's `needsEnv` (new keyed boards appear on their own), then the AI key. */
export function keyNames(): string[] {
  return [...new Set([...CATALOG.flatMap((c) => c.needsEnv ?? []), AI_KEY])];
}

function stored(name: string): string {
  try {
    const v = kvGet<unknown>(KEY_PREFIX + name, "");
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return ""; // no database (unit tests, build): the environment only
  }
}

/** The key's value: Settings first, then the environment. "" when neither is set. */
export function providerKey(name: string): string {
  return stored(name) || process.env[name]?.trim() || "";
}

/** Where a key comes from, for the masked "•••• set" state. Never the value. */
export function keySource(name: string): "app" | "env" | null {
  return stored(name) ? "app" : process.env[name]?.trim() ? "env" : null;
}

/** Catalog kinds whose keys are not all set (the scan skips them, the catalog says where to add them). */
export function missingKeyKinds(): string[] {
  return CATALOG.filter((c) => c.needsEnv?.some((n) => !providerKey(n))).map((c) => c.kind);
}

/** Save or clear (empty value) a key from Settings. Unknown names are refused. */
export function setProviderKey(name: string, value: string): boolean {
  if (!keyNames().includes(name)) return false;
  const v = value.trim().slice(0, 500);
  if (v) kvSet(KEY_PREFIX + name, v);
  else db().prepare("DELETE FROM kv WHERE key = ?").run(KEY_PREFIX + name);
  return true;
}
