// Interview debrief feedback (career-ops interview/debrief): per weak question,
// "what landed / what to sharpen / a stronger version". Never invents candidate facts.
import type { Locale, Settings } from "../types";
import { aiText } from "./index";

export { DEBRIEF_ROUNDS, RATINGS, type DebriefRound, type Rating } from "./debrief-rounds";
import type { DebriefRound, Rating } from "./debrief-rounds";

export interface DebriefQuestion {
  question: string;
  rating: Rating;
  notes: string;
  competency: string;
}

export interface DebriefInput {
  company: string;
  role: string;
  round: DebriefRound;
  questions: DebriefQuestion[];
  retracted: string[];
  locale: Locale;
}

export function heuristicDebrief(d: DebriefInput): string {
  const fr = d.locale === "fr";
  const T = (en: string, f: string) => (fr ? f : en);
  const strong = d.questions.filter((q) => q.rating === "green");
  const weak = d.questions.filter((q) => q.rating !== "green");
  const out: string[] = [];
  out.push(`## ${T("What landed", "Ce qui a marché")}`);
  out.push(strong.length ? strong.map((q) => `- ${q.question}${q.notes ? ` : ${q.notes}` : ""}`).join("\n") : T("- Nothing marked green yet. Add at least one answer that went well: it is what you repeat next time.", "- Rien de marqué en vert. Notez au moins une réponse réussie : c'est ce que vous répéterez la prochaine fois."));
  out.push(`\n## ${T("What to sharpen", "À affûter")}`);
  out.push(
    weak.length
      ? weak
          .map((q) => `- **${q.question}** (${q.rating === "red" ? "🔴" : "🟡"})${q.notes ? ` : ${q.notes}` : ""}\n  ${T("Stronger version: state the concept in one sentence, give one example from your own projects, name the limit or trade-off, then stop.", "Version plus solide : énoncez le concept en une phrase, donnez un exemple tiré de vos projets, nommez la limite ou le compromis, puis arrêtez-vous.")}`)
          .join("\n")
      : T("- No gap recorded. Re-read the questions once more: a 🟡 is easy to forget.", "- Aucune lacune notée. Relisez les questions une fois de plus : un 🟡 s'oublie vite."),
  );
  if (d.retracted.length) {
    out.push(`\n## ${T("Claims to retract", "Affirmations à retirer")}`);
    out.push(d.retracted.map((r) => `- "${r}" ${T("is not defensible under pressure. Replace it with a version that depends only on what you actually did.", "ne tient pas sous pression. Remplacez-la par une version qui repose uniquement sur ce que vous avez réellement fait.")}`).join("\n"));
  }
  out.push(`\n## ${T("Before the next round", "Avant le prochain tour")}`);
  const top = weak.filter((q) => q.rating === "red").slice(0, 2);
  out.push(
    top.length
      ? top.map((q, i) => `${i + 1}. ${T("Rehearse", "Répétez")} « ${q.question} » ${T("out loud twice, two minutes max, with one concrete example.", "à voix haute deux fois, deux minutes max, avec un exemple concret.")}`).join("\n")
      : T("1. Keep the same preparation: it worked.", "1. Gardez la même préparation : elle a fonctionné."),
  );
  return out.join("\n");
}

export async function debriefFeedback(settings: Settings, d: DebriefInput): Promise<{ text: string; engine: string }> {
  const lang = d.locale === "fr" ? "French" : "English";
  const qs = d.questions.map((q, i) => `${i + 1}. [${q.rating.toUpperCase()}] ${q.question}${q.competency ? ` (competency: ${q.competency})` : ""}${q.notes ? `\n   candidate notes: ${q.notes}` : ""}`).join("\n");
  return aiText(
    settings,
    [
      {
        role: "system",
        content: `You are an interview coach debriefing an engineering student after a real interview. Write in ${lang}, in Markdown, under 350 words.
Sections, in this order: "What landed" (be specific, name what to repeat), "What to sharpen" (one bullet per RED/YELLOW question: what was missing and a stronger version of the answer in 2-3 sentences), "Claims to retract" (only if any are listed), "Before the next round" (the 1-2 highest-priority gaps, one fix each).
Hard rules: never invent facts, projects, numbers or experience for the candidate; a stronger version may use general domain knowledge but any personal claim must come from the notes. Never reuse a retracted claim. Be direct, no softening, no filler.`,
      },
      {
        role: "user",
        content: `Company: ${d.company}. Role: ${d.role}. Round: ${d.round}.
Questions and self-ratings (RED = gap, YELLOW = solid but incomplete, GREEN = strong):
${qs || "(none)"}
Retracted claims (never suggest these): ${d.retracted.length ? d.retracted.map((r) => `"${r}"`).join("; ") : "none"}`,
      },
    ],
    () => heuristicDebrief(d),
  );
}
