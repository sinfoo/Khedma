import { test } from "node:test";
import assert from "node:assert/strict";
import { outcomeNote } from "./digest";

test("outcome note needs 3 closed applications and lists kinds with 2+", () => {
  assert.equal(outcomeNote([{ kind: "data", good: true }, { kind: "data", good: false }]), "");
  const note = outcomeNote([
    { kind: "data", good: true },
    { kind: "data", good: true },
    { kind: "data", good: false },
    { kind: "sales", good: false },
    { kind: "sales", good: false },
    { kind: "web", good: true },
  ]);
  assert.equal(note, "- data: 2 of 3 closed applications reached an interview or better\n- sales: 0 of 2 closed applications reached an interview or better");
});
