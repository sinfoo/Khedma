import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultKeywords } from "./sources";
import type { Profile } from "../types";

test("default scan keywords skip soft skills, spoken languages and everyday tools from the CV", () => {
  const profile = { target_roles: ["Développeur full stack"], target_types: ["stage"], skills: ["Communication", "Creativity", "English", "GitHub", "Figma", "SQL"], cv_md: "" } as unknown as Profile;
  assert.deepEqual(defaultKeywords(profile, ""), ["développeur", "figma", "sql"]);
  // Internship words only fill in when the CV gives almost nothing else.
  assert.deepEqual(defaultKeywords({ ...profile, target_roles: [], skills: ["Excel"] }, ""), ["stage"]);
});
