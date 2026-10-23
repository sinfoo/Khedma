import { test } from "node:test";
import assert from "node:assert/strict";
import { questionText } from "./ats-questions";
import { isSensitiveQuestion } from "./questions";

test("form questions: text stays, choices list their options and stay with the candidate, uploads drop", () => {
  assert.equal(questionText({ label: "De quel établissement serez-vous conventionné ?", required: true, kind: "text" }, "fr"), "De quel établissement serez-vous conventionné ?");
  const choice = questionText({ label: "Aurez-vous une convention de stage ?", required: true, kind: "select", options: ["Yes", "No"] }, "fr")!;
  assert.equal(choice, "Aurez-vous une convention de stage ? (choix : Yes / No)");
  assert.equal(isSensitiveQuestion("custom", choice), true);
  assert.equal(questionText({ label: "Accept terms", required: true, kind: "boolean" }, "en"), "Accept terms (options : Yes / No)");
  assert.equal(questionText({ label: "Portfolio", required: false, kind: "file" }, "en"), null);
});
