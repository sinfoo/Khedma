import { test } from "node:test";
import assert from "node:assert/strict";
import { strictSchema } from "./anthropic";

test("structured-output schemas drop unsupported bounds and close every object", () => {
  const num = { type: "number", minimum: 1, maximum: 5 };
  const s = { type: "object", properties: { global: num, rows: { type: "array", maxItems: 12, items: { type: "object", properties: { text: { type: "string", maxLength: 80 } }, required: ["text"] } } }, required: ["global", "rows"] };
  assert.deepEqual(strictSchema(s), {
    type: "object",
    properties: { global: { type: "number" }, rows: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } } },
    required: ["global", "rows"],
    additionalProperties: false,
  });
  // A property literally named "minimum" is kept: only schema keywords are dropped.
  assert.deepEqual(strictSchema({ type: "object", properties: { minimum: { type: "string" } } }), { type: "object", properties: { minimum: { type: "string" } }, additionalProperties: false });
});
