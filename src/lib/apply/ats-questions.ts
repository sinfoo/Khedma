// The employer's form questions (read by lib/apply-form.ts) turned into questions to prepare answers for.
import type { FormQuestion } from "../apply-form";

const CHOICE = new Set(["select", "multiselect", "boolean"]);

/**
 * The question as stored and shown. Choice questions list their options and are never answered by the model
 * (see questions.ts CHOICE_RE): the candidate picks. Upload fields are not questions; null.
 */
export function questionText(q: FormQuestion, locale: "fr" | "en"): string | null {
  if (q.kind === "file") return null;
  if (!q.kind || !CHOICE.has(q.kind)) return q.label;
  const opts = q.options?.length ? q.options.slice(0, 12).join(" / ") : q.kind === "boolean" ? (locale === "fr" ? "Oui / Non" : "Yes / No") : locale === "fr" ? "à choisir dans le formulaire" : "pick in the form";
  return `${q.label} (${locale === "fr" ? "choix" : "options"} : ${opts})`;
}
