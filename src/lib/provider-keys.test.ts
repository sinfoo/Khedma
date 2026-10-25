import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app DB at a throwaway file before db.ts is loaded (hence the dynamic imports).
process.env.KHEDMA_DB = path.join(mkdtempSync(path.join(tmpdir(), "khedma-keys-")), "test.db");

test("provider keys: Settings beats .env.local, unknown names are refused, backups never carry them", async () => {
  const { keyNames, keySource, missingKeyKinds, providerKey, setProviderKey } = await import("./provider-keys");
  const { exportBackup, validateBackup } = await import("../app/api/backup/backup");
  const saved = process.env.REED_KEY;
  process.env.REED_KEY = "from-env";
  try {
    assert.ok(keyNames().includes("REED_KEY") && keyNames().includes("ANTHROPIC_API_KEY"));
    assert.equal(providerKey("REED_KEY"), "from-env");
    assert.equal(keySource("REED_KEY"), "env");
    assert.ok(setProviderKey("REED_KEY", "  from-settings "));
    assert.equal(providerKey("REED_KEY"), "from-settings");
    assert.equal(keySource("REED_KEY"), "app");
    assert.equal(setProviderKey("PATH", "x"), false);
    assert.ok(!JSON.stringify(exportBackup()).includes("from-settings"));
    const crafted = validateBackup({ app: "khedma", format: 1, tables: { kv: [{ key: "settings:secret:REED_KEY", value: '"evil"' }] } });
    assert.deepEqual(crafted.backup?.tables.kv, []);
    setProviderKey("REED_KEY", "");
    delete process.env.REED_KEY;
    assert.equal(providerKey("REED_KEY"), "");
    assert.ok(missingKeyKinds().includes("reed"));
  } finally {
    if (saved === undefined) delete process.env.REED_KEY;
    else process.env.REED_KEY = saved;
  }
});

test("scan errors read as short reasons in the UI language; LinkedIn runs use it too", async () => {
  const { dicts } = await import("./i18n/dict");
  const { errorReason } = await import("../components/sources/error-reason");
  const { runLabel } = await import("./search/plan");
  const fr = dicts.fr;
  assert.equal(errorReason(fr, "HTTP 500 for api.example.com"), fr.sources2.reasonsErr.server);
  assert.equal(errorReason(fr, "Timeout for x: aborted"), fr.sources2.reasonsErr.timeout);
  assert.equal(errorReason(fr, "Missing env: REED_KEY"), fr.sources2.reasonsErr.key);
  assert.equal(errorReason(fr, "interrupted"), fr.sources2.reasonsErr.interrupted);
  assert.equal(errorReason(fr, "Invalid SuccessFactors career-site host"), fr.sources2.reasonsErr.settings);
  const run = { kind: "linkedin" as const, label: "LinkedIn · Allemagne", country: "DE" };
  assert.equal(runLabel(run, "en"), "LinkedIn · Germany");
  assert.equal(runLabel({ ...run, sourceId: 3, label: "My LinkedIn" }, "en"), "My LinkedIn");
});
