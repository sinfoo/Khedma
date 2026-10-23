import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bookmarkletHref } from "./clip-url";

// Point the app DB at a throwaway file before db.ts is loaded.
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-clip-")), "test.db");

test("the bookmarklet is self-contained: valid script, no request and no script load (LinkedIn's CSP blocks both)", () => {
  const href = bookmarkletHref("http://localhost:3000", "abc123");
  assert.ok(href.startsWith("javascript:"));
  const js = decodeURIComponent(href.slice("javascript:".length));
  assert.doesNotThrow(() => new Function(js));
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|createElement\(["']script/);
  assert.match(js, /window\.open\(url, "_blank"\)/);
  assert.match(js, /\/app\/clip#/);
});

test("clipped offers are stored only with this install's token", async () => {
  const { clipToken, importClipped } = await import("./clip");
  const jobs = [{ url: "https://tn.linkedin.com/jobs/view/1", title: "Stage PFE", company: "Acme", location: "Tunis" }, { url: "ftp://x", title: "bad url" }];
  assert.deepEqual(importClipped({ token: "wrong", site: "www.linkedin.com", jobs }), { ok: false });
  const r = importClipped({ token: clipToken(), site: "www.linkedin.com", jobs });
  assert.ok(r.ok && r.added === 1 && r.known === 0);
  const again = importClipped({ token: clipToken(), site: "www.linkedin.com", jobs });
  assert.ok(again.ok && again.added === 0 && again.known === 1);
});
