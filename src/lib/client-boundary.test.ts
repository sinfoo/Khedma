// A "use client" file must never reach Node-only code (node:sqlite, node:dns…) through its imports: Turbopack then
// fails the whole page. Type-only imports and "use server" action modules do not count (they are not bundled).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = path.resolve(import.meta.dirname, "..");
const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? path.join(src, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const e of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  return null;
};
const IMPORT = /^\s*(?:import|export)\s+(type\s)?(?:[^'";]*?\sfrom\s)?["']([^"']+)["']/gm;
const directive = (f: string, d: string) => fs.readFileSync(f, "utf8").trimStart().startsWith(`"${d}"`);

function nodeImport(start: string): string | null {
  const parent = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    for (const m of fs.readFileSync(f, "utf8").matchAll(IMPORT)) {
      if (m[1]) continue;
      if (m[2].startsWith("node:")) {
        const chain = [m[2]];
        for (let x: string | null = f; x; x = parent.get(x) ?? null) chain.unshift(path.relative(src, x));
        return chain.join(" -> ");
      }
      const r = resolve(f, m[2]);
      if (r && !parent.has(r) && !directive(r, "use server")) parent.set(r, f), queue.push(r);
    }
  }
  return null;
}

test("client components never import Node-only modules", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) files.push(p);
    }
  };
  walk(src);
  const bad = files.filter((f) => directive(f, "use client")).map(nodeImport).filter(Boolean);
  assert.deepEqual(bad, []);
});
