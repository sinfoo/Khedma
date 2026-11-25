import { test } from "node:test";
import assert from "node:assert/strict";
import { addChips } from "./chips";

test("a pasted list becomes one chip per item, whatever the separator", () => {
  assert.deepEqual(addChips([], "React, Docker;AWS\nNode.js\r\n• Figma\n- C++\tGit"), ["React", "Docker", "AWS", "Node.js", "Figma", "C++", "Git"]);
});

test("duplicates are skipped case-insensitively and suggestions fix the spelling", () => {
  assert.deepEqual(addChips(["React"], "react, REACT , typescript, TypeScript", ["TypeScript"]), ["React", "TypeScript"]);
});

test("blank input changes nothing and the list never passes max", () => {
  const before = ["a", "b"];
  assert.deepEqual(addChips(before, " , ;\n"), before);
  assert.deepEqual(addChips(before, "c, d, e", [], 3), ["a", "b", "c"]);
});

test("a hyphenated name is not mistaken for a bullet", () => {
  assert.deepEqual(addChips([], "scikit-learn, CI/CD"), ["scikit-learn", "CI/CD"]);
});
