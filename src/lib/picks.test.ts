import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type Candidate } from "./picks";

const c = (id: number, p: Partial<Candidate> = {}): Candidate => ({ id, deadline: null, tracked: false, ev: null, relevance: 0, ...p });
const ai = (global: number, verdict = "apply") => ({ global, verdict, engine: "ollama" });

test("post-scan shortlist keeps open untracked offers, best fit first, AI before estimates", () => {
  const r = rankCandidates(
    [
      c(1, { ev: ai(4.6), tracked: true }), // already in the pipeline
      c(2, { ev: ai(4.8), deadline: "2026-10-01" }), // closed
      c(3, { ev: ai(2, "skip") }),
      c(4, { ev: { global: 4.2, verdict: "apply", engine: "heuristic" } }),
      c(5, { ev: ai(4.2), key: "acme|dev" }),
      c(9, { ev: ai(4.1), key: "acme|dev" }), // same role, other city
      c(6, { relevance: 100 }), // unscored tops out at 3.5
      c(7, { relevance: 10, cvPct: 100 }), // CV match beats keyword relevance
      c(8, { ev: { global: 3.5, verdict: "maybe", engine: "heuristic" } }),
    ],
    new Set([7]),
    "2026-10-19",
  );
  assert.deepEqual(r.map((x) => x.id), [5, 4, 8, 7, 6]);
  assert.deepEqual(r.map((x) => x.basis), ["ai", "estimate", "estimate", "keywords", "keywords"]);
  assert.equal(r[3].fit, 3.5);
});
