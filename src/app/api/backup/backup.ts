// Generic backup / restore of every app table. Table and column names always come from
// the live schema (sqlite_master / PRAGMA), never from the uploaded file, so a crafted
// backup cannot inject SQL. Environment values (API keys) are never part of the DB.
import { statSync } from "node:fs";
import { db } from "@/lib/db";

type Row = Record<string, unknown>;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const FORMAT = 1;
const MAX_ROWS = 500_000;

/** Data tables in dependency order (parents before children). */
export function dataTables(): string[] {
  const d = db();
  const names = (d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'").all() as Row[])
    .map((r) => r.name as string)
    .filter((n) => IDENT.test(n));
  const deps = new Map(names.map((n) => [n, parents(n).filter((p) => p !== n && names.includes(p))]));
  const out: string[] = [];
  const visit = (n: string, stack: Set<string>) => {
    if (out.includes(n) || stack.has(n)) return;
    stack.add(n);
    for (const p of deps.get(n) ?? []) visit(p, stack);
    out.push(n);
  };
  for (const n of names.sort()) visit(n, new Set());
  return out;
}

const q = (n: string) => `"${n}"`;
const columns = (t: string) => (db().prepare(`PRAGMA table_info(${q(t)})`).all() as Row[]).map((r) => ({ name: r.name as string, pk: r.pk as number, type: String(r.type).toUpperCase() }));
const foreignKeys = (t: string) => (db().prepare(`PRAGMA foreign_key_list(${q(t)})`).all() as Row[]).map((r) => ({ from: r.from as string, table: r.table as string }));
const parents = (t: string) => foreignKeys(t).map((f) => f.table);
const count = (t: string) => (db().prepare(`SELECT COUNT(*) AS n FROM ${q(t)}`).get() as Row).n as number;

export interface Backup {
  app: "khedma";
  format: number;
  exported_at: string;
  tables: Record<string, Row[]>;
}

export function exportBackup(): Backup {
  const tables: Record<string, Row[]> = {};
  for (const t of dataTables()) tables[t] = db().prepare(`SELECT * FROM ${q(t)}`).all() as Row[];
  return { app: "khedma", format: FORMAT, exported_at: new Date().toISOString(), tables };
}

/** Shape check at the trust boundary. Returns a normalized backup or an error code. */
export function validateBackup(raw: unknown): { backup?: Backup; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "not-an-object" };
  const b = raw as Partial<Backup>;
  if (b.app !== "khedma" || b.format !== FORMAT) return { error: "not-a-khedma-backup" };
  if (!b.tables || typeof b.tables !== "object" || Array.isArray(b.tables)) return { error: "no-tables" };
  let total = 0;
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!IDENT.test(name) || !Array.isArray(rows)) return { error: `bad-table:${name.slice(0, 40)}` };
    if (!rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) return { error: `bad-rows:${name}` };
    total += rows.length;
    tables[name] = rows as Row[];
  }
  if (total > MAX_ROWS) return { error: "too-large" };
  return { backup: { app: "khedma", format: FORMAT, exported_at: String(b.exported_at ?? ""), tables } };
}

export interface PreviewRow {
  table: string;
  backup: number;
  current: number | null; // null = table unknown to this version, ignored on restore
}

export function previewBackup(b: Backup): PreviewRow[] {
  const known = new Set(dataTables());
  return Object.entries(b.tables)
    .map(([table, rows]) => ({ table, backup: rows.length, current: known.has(table) ? count(table) : null }))
    .sort((a, b2) => b2.backup - a.backup);
}

/** Only keep values SQLite can bind. */
const bindable = (v: unknown) => (v === null || typeof v === "number" || typeof v === "string" || typeof v === "bigint" ? v : v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : JSON.stringify(v));

function insert(t: string, row: Row, cols: string[], orIgnore: boolean) {
  const use = cols.filter((c) => c in row);
  if (!use.length) return { changes: 0, id: 0 };
  const r = db()
    .prepare(`INSERT ${orIgnore ? "OR IGNORE " : ""}INTO ${q(t)} (${use.map(q).join(",")}) VALUES (${use.map(() => "?").join(",")})`)
    .run(...use.map((c) => bindable(row[c]) as string | number | null));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

/**
 * replace: wipe every data table and restore the backup with its ids.
 * merge: add rows that are missing. Rows whose parent already existed (same offer URL,
 * same application) are skipped so nothing is duplicated; the profile and scan history are kept.
 */
export function restoreBackup(b: Backup, mode: "merge" | "replace"): { inserted: number } {
  const d = db();
  const order = dataTables();
  let inserted = 0;
  if (mode === "replace") {
    d.exec("PRAGMA foreign_keys = OFF");
    d.exec("BEGIN");
    try {
      for (const t of [...order].reverse()) d.exec(`DELETE FROM ${q(t)}`);
      for (const t of order) {
        const cols = columns(t).map((c) => c.name);
        for (const row of b.tables[t] ?? []) inserted += insert(t, row, cols, true).changes;
      }
      if (!count("profile")) d.exec("INSERT OR IGNORE INTO profile (id) VALUES (1)");
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    } finally {
      d.exec("PRAGMA foreign_keys = ON");
    }
    return { inserted };
  }

  const maps = new Map<string, Map<unknown, { id: unknown; inserted: boolean }>>();
  d.exec("BEGIN");
  try {
    for (const t of order) {
      if (t === "profile" || t === "scan_runs" || !b.tables[t]) continue;
      const cols = columns(t);
      const pk = cols.filter((c) => c.pk > 0);
      const intPk = pk.length === 1 && pk[0].type.includes("INT") ? pk[0].name : null;
      const fks = foreignKeys(t).filter((f) => f.table !== t);
      const map = new Map<unknown, { id: unknown; inserted: boolean }>();
      maps.set(t, map);
      const names = cols.map((c) => c.name).filter((c) => c !== intPk);
      rows: for (const src of b.tables[t]) {
        const row = { ...src };
        for (const fk of fks) {
          const v = row[fk.from];
          if (v === null || v === undefined) continue;
          const parentMap = maps.get(fk.table);
          if (parentMap) {
            const m = parentMap.get(v);
            if (!m || !m.inserted) continue rows;
            row[fk.from] = m.id;
          } else if (!d.prepare(`SELECT 1 FROM ${q(fk.table)} WHERE rowid = ?`).get(bindable(v) as number)) continue rows;
        }
        const r = insert(t, row, names, true);
        if (intPk) map.set(src[intPk], { id: r.changes ? r.id : null, inserted: r.changes > 0 });
        inserted += r.changes;
      }
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { inserted };
}

/** Erase user data, keep profile, sources (config) and settings:* preferences. */
export function resetAll(): void {
  const d = db();
  const keep = new Set(["profile", "sources", "kv"]);
  d.exec("PRAGMA foreign_keys = OFF");
  d.exec("BEGIN");
  try {
    for (const t of dataTables().reverse()) if (!keep.has(t)) d.exec(`DELETE FROM ${q(t)}`);
    d.exec("DELETE FROM kv WHERE key NOT LIKE 'settings:%'");
    d.exec("UPDATE sources SET last_scan = NULL, last_count = 0");
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    d.exec("PRAGMA foreign_keys = ON");
  }
}

export function storageInfo(): { file: string; bytes: number } {
  const file = ((db().prepare("PRAGMA database_list").all() as Row[]).find((r) => r.name === "main")?.file as string) ?? "";
  let bytes = 0;
  for (const f of [file, `${file}-wal`]) {
    try {
      bytes += statSync(f).size;
    } catch {
      // no WAL file yet
    }
  }
  return { file, bytes };
}
