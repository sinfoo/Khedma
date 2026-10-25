// Global answer bank: every answer the user saves in the wizard is kept and reused when a similar
// question comes up on another application. Plus deterministic profile-fact answers for sensitive
// questions (never invented: missing facts become [brackets] the user must fill).
import { db, migrate } from "../db";
import type { Locale, Profile } from "../types";
import type { ProfileExtra } from "../cv/model";
import { countryName } from "../geo";

export interface BankAnswer {
  id: number;
  type: "text" | "choice" | "number" | "date";
  question_norm: string;
  question: string;
  answer: string;
  source_app: number | null;
  uses: number;
  updated_at: string;
}

type Row = Record<string, unknown>;

function schema() {
  migrate(
    "apply:002-bank",
    `CREATE TABLE IF NOT EXISTS answer_bank (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       type TEXT NOT NULL DEFAULT 'text',
       question_norm TEXT NOT NULL UNIQUE,
       question TEXT NOT NULL,
       answer TEXT NOT NULL,
       source_app INTEGER,
       uses INTEGER NOT NULL DEFAULT 0,
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );
}

// ---------- matching (pure) ----------
const STOP = new Set(["le", "la", "les", "de", "du", "des", "un", "une", "et", "ou", "à", "a", "en", "pour", "vous", "votre", "vos", "nous", "notre", "ce", "cette", "the", "an", "of", "to", "for", "and", "or", "you", "your", "our", "this", "that", "is", "are", "do", "does", "what", "why", "how", "est", "quel", "quelle", "quels", "quelles", "pourquoi", "comment"]);
export const normalizeQuestion = (q: string) =>
  q.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 200);
export const questionTokens = (q: string) => new Set(normalizeQuestion(q).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export const BANK_MATCH = 0.8;

/** Exact normalized match first, else token Jaccard ≥ 0.8. Pure so it can be tested on in-memory rows. */
export function matchBank(question: string, rows: BankAnswer[]): BankAnswer | null {
  const norm = normalizeQuestion(question);
  if (!norm) return null;
  const exact = rows.find((r) => r.question_norm === norm);
  if (exact) return exact;
  const toks = questionTokens(question);
  if (toks.size < 2) return null;
  let best: BankAnswer | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const s = jaccard(toks, questionTokens(r.question));
    if (s >= BANK_MATCH && s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}

// ---------- storage ----------
export function listBank(): BankAnswer[] {
  schema();
  return (db().prepare("SELECT * FROM answer_bank ORDER BY updated_at DESC, id DESC").all() as Row[]).map((r) => ({ ...(r as unknown as BankAnswer), source_app: (r.source_app as number) ?? null }));
}

export function findBankAnswer(question: string): BankAnswer | null {
  return matchBank(question, listBank());
}

export function upsertBankAnswer(a: { question: string; answer: string; type?: BankAnswer["type"]; source_app?: number | null }): void {
  schema();
  const norm = normalizeQuestion(a.question);
  if (!norm || !a.answer.trim()) return;
  db()
    .prepare(
      `INSERT INTO answer_bank (type, question_norm, question, answer, source_app, updated_at) VALUES (?,?,?,?,?,datetime('now'))
       ON CONFLICT(question_norm) DO UPDATE SET answer=excluded.answer, question=excluded.question, type=excluded.type, source_app=excluded.source_app, updated_at=datetime('now')`,
    )
    .run(a.type ?? "text", norm, a.question.slice(0, 200), a.answer.slice(0, 4000), a.source_app ?? null);
}

export function updateBankAnswer(id: number, answer: string): void {
  schema();
  db().prepare("UPDATE answer_bank SET answer = ?, updated_at = datetime('now') WHERE id = ?").run(answer.slice(0, 4000), id);
}

export function deleteBankAnswer(id: number): void {
  schema();
  db().prepare("DELETE FROM answer_bank WHERE id = ?").run(id);
}

export function bumpBankUse(id: number): void {
  schema();
  db().prepare("UPDATE answer_bank SET uses = uses + 1 WHERE id = ?").run(id);
}

// ---------- profile-fact answers (pure, deterministic, never invented) ----------
const fmtDate = (iso: string, locale: Locale) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB") : "");

/**
 * Deterministic answers for sensitive bank questions built only from profile facts.
 * Returns `confirm: true` when a fact is missing and left as a [bracket] for the candidate.
 */
export function profileFactAnswer(qid: "availability" | "english" | "mobility" | "salary", profile: Profile, extra: ProfileExtra, locale: Locale): { answer: string; confirm: boolean } {
  const fr = locale === "fr";
  switch (qid) {
    case "availability": {
      const { from, to } = extra.availability;
      const a = fr
        ? `Je suis disponible ${from ? `à partir du ${fmtDate(from, locale)}` : "[à partir du JJ/MM/AAAA]"}${to ? ` jusqu'au ${fmtDate(to, locale)}` : " [pour une durée de N mois]"}.`
        : `I am available ${from ? `from ${fmtDate(from, locale)}` : "[from DD/MM/YYYY]"}${to ? ` until ${fmtDate(to, locale)}` : " [for N months]"}.`;
      return { answer: a, confirm: !from };
    }
    case "english": {
      const langs = extra.langs.length ? extra.langs.map((l) => `${l.name} (${l.level})`).join(", ") : "";
      return langs
        ? { answer: fr ? `Langues : ${langs}.` : `Languages: ${langs}.`, confirm: false }
        : { answer: fr ? "Langues : [langue — niveau CECRL, ex. Anglais — B2]." : "Languages: [language — CEFR level, e.g. English — B2].", confirm: true };
    }
    case "mobility": {
      const places = [...extra.places.cities, ...extra.places.countries.map((c) => countryName(c, locale))].filter(Boolean);
      const remote = extra.places.remote === "no" ? (fr ? "sans télétravail" : "no remote") : extra.places.remote === "only" ? (fr ? "télétravail uniquement" : "remote only") : fr ? "télétravail possible" : "remote possible";
      return places.length
        ? { answer: fr ? `Mobile sur : ${places.join(", ")} ; ${remote}.` : `Mobile for: ${places.join(", ")}; ${remote}.`, confirm: false }
        : { answer: fr ? "Mobile sur : [villes / pays] ; [télétravail oui/non]." : "Mobile for: [cities / countries]; [remote yes/no].", confirm: true };
    }
    case "salary":
      // No salary expectation lives in the profile: never invent a number.
      return {
        answer: fr ? "Prétentions : à discuter, en ligne avec les pratiques du secteur pour ce type de poste." : "Expectations: open to discussion, in line with sector practice for this kind of role.",
        confirm: true,
      };
  }
}
