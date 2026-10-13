"use server";

import { getProfile } from "@/lib/db";
import { aiText } from "@/lib/ai";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { weeklyDigest } from "@/lib/reports/repo";
import { weekStart } from "@/lib/reports/digest";

/** Rewrite the week's focus sentences as one short coaching paragraph; heuristic = the sentences joined. */
export async function polishDigest(week: string): Promise<{ ok: true; text: string; engine: string } | { ok: false; error: string }> {
  const { t, locale } = await getDict();
  const ws = weekStart(String(week ?? "").slice(0, 10));
  try {
    const d = weeklyDigest(ws);
    const lines = d.focus.map((f) => fmt(t.apply2.reports.focusKeys[f.key], f.vars));
    const facts = `New offers: ${d.newOffers}. Scored: ${d.evaluated}. Applied: ${d.applied}. Responses: ${d.responses}. Interviews: ${d.interviews.length}. Deadlines next week: ${d.deadlinesNext.length}. Lessons: ${d.lessons.map((l) => l.lesson).join(" | ") || "none"}.`;
    const r = await aiText(
      getProfile().settings,
      [
        {
          role: "system",
          content: `You are a concise career coach for an engineering student in Tunisia. Write in ${locale === "fr" ? "French" : "English"}. Use only the facts given; never invent numbers or companies. Output one paragraph of at most 90 words, no title, no bullet points.`,
        },
        { role: "user", content: `Week ${d.weekStart} to ${d.weekEnd}. Facts: ${facts}\nSuggested priorities:\n${lines.map((l) => `- ${l}`).join("\n")}\nRewrite these priorities as an encouraging, specific paragraph.` },
      ],
      () => lines.join(" "),
    );
    return { ok: true, text: r.text.trim().slice(0, 1200), engine: r.engine };
  } catch {
    return { ok: false, error: t.apply2.err.generic };
  }
}
