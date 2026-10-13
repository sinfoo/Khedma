"use server";

// One-sentence rewrite for a lint finding: the model when available, else the deterministic fix.
import { getProfile } from "@/lib/db";
import type { Locale } from "@/lib/types";
import { aiText } from "./index";
import { heuristicFix, LINT_RULES, WRITING_RULES, type LintRule } from "./writing";

export async function fixSentence(
  sentence: string,
  excerpt: string,
  rule: string,
  locale: string,
): Promise<{ ok: true; text: string; engine: string } | { ok: false; error: "invalid" | "nofix" }> {
  const s = typeof sentence === "string" ? sentence.trim().slice(0, 800) : "";
  const ex = typeof excerpt === "string" ? excerpt.trim().slice(0, 120) : "";
  if (!s || !ex || !(LINT_RULES as readonly string[]).includes(rule)) return { ok: false, error: "invalid" };
  const loc: Locale = locale === "en" ? "en" : "fr";
  const r = rule as LintRule;
  const offline = () => heuristicFix({ rule: r, excerpt: ex, sentence: s }) ?? "";
  const { text, engine } = await aiText(
    getProfile().settings,
    [
      {
        role: "system",
        content: `Rewrite one sentence of a job-application text written in ${loc === "fr" ? "French" : "English"}. Keep every fact, name, number and tool exactly; change wording only. Output the rewritten sentence alone, no quotes, no commentary.\n${WRITING_RULES}`,
      },
      { role: "user", content: `Problem: "${ex}" (rule: ${r}).\nSentence: ${s}` },
    ],
    offline,
  );
  const out = text.trim().replace(/^["«“]|["»”]$/g, "").split("\n")[0]?.trim() ?? "";
  if (!out || out === s) return { ok: false, error: "nofix" };
  return { ok: true, text: out, engine };
}
