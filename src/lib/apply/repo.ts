// Apply-assistant data access: saved form answers and the per-application
// "pack" row (submission details + outcome + lesson).
import { db, migrate } from "../db";
import { isChannel, isOutcome, type Pack, type SavedAnswer } from "./types";

export { CHANNELS, OUTCOMES, isChannel, isOutcome, type Channel, type Outcome, type Pack, type SavedAnswer } from "./types";

type Row = Record<string, unknown>;

function schema() {
  migrate(
    "apply:001-packs",
    `CREATE TABLE IF NOT EXISTS apply_answers (
       application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
       qid TEXT NOT NULL,
       question TEXT NOT NULL,
       answer TEXT NOT NULL DEFAULT '',
       max_chars INTEGER NOT NULL DEFAULT 600,
       engine TEXT NOT NULL DEFAULT 'heuristic',
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (application_id, qid)
     );
     CREATE TABLE IF NOT EXISTS apply_packs (
       application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
       channel TEXT,
       reference TEXT NOT NULL DEFAULT '',
       answers TEXT NOT NULL DEFAULT '[]',
       submitted_at TEXT,
       outcome TEXT,
       outcome_reason TEXT NOT NULL DEFAULT '',
       lesson TEXT NOT NULL DEFAULT '',
       outcome_at TEXT
     );`,
  );
}

// ---------- answers ----------
export function listAnswers(appId: number): SavedAnswer[] {
  schema();
  return db().prepare("SELECT * FROM apply_answers WHERE application_id = ? ORDER BY rowid").all(appId) as unknown as SavedAnswer[];
}

export function saveAnswer(a: Omit<SavedAnswer, "updated_at">): void {
  schema();
  db()
    .prepare(
      `INSERT INTO apply_answers (application_id, qid, question, answer, max_chars, engine, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
       ON CONFLICT(application_id, qid) DO UPDATE SET question=excluded.question, answer=excluded.answer, max_chars=excluded.max_chars,
         engine=excluded.engine, updated_at=datetime('now')`,
    )
    .run(a.application_id, a.qid, a.question, a.answer, a.max_chars, a.engine);
}

export function deleteAnswer(appId: number, qid: string): void {
  schema();
  db().prepare("DELETE FROM apply_answers WHERE application_id = ? AND qid = ?").run(appId, qid);
}

// ---------- pack ----------
const rowToPack = (r: Row | undefined, appId: number): Pack => {
  let answers: Pack["answers"] = [];
  try {
    answers = r ? (JSON.parse(String(r.answers)) as Pack["answers"]) : [];
  } catch {}
  return {
    application_id: appId,
    channel: isChannel(r?.channel) ? r!.channel : null,
    reference: (r?.reference as string) ?? "",
    answers: Array.isArray(answers) ? answers : [],
    submitted_at: (r?.submitted_at as string) ?? null,
    outcome: isOutcome(r?.outcome) ? r!.outcome : null,
    outcome_reason: (r?.outcome_reason as string) ?? "",
    lesson: (r?.lesson as string) ?? "",
    outcome_at: (r?.outcome_at as string) ?? null,
  };
};

export function getPack(appId: number): Pack {
  schema();
  return rowToPack(db().prepare("SELECT * FROM apply_packs WHERE application_id = ?").get(appId) as Row | undefined, appId);
}

export function listPacks(): Map<number, Pack> {
  schema();
  const rows = db().prepare("SELECT * FROM apply_packs").all() as Row[];
  return new Map(rows.map((r) => [r.application_id as number, rowToPack(r, r.application_id as number)]));
}

export function setPack(appId: number, patch: Partial<Omit<Pack, "application_id">>): void {
  const n = { ...getPack(appId), ...patch };
  db()
    .prepare(
      `INSERT INTO apply_packs (application_id, channel, reference, answers, submitted_at, outcome, outcome_reason, lesson, outcome_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(application_id) DO UPDATE SET channel=excluded.channel, reference=excluded.reference, answers=excluded.answers,
         submitted_at=excluded.submitted_at, outcome=excluded.outcome, outcome_reason=excluded.outcome_reason, lesson=excluded.lesson, outcome_at=excluded.outcome_at`,
    )
    .run(appId, n.channel, n.reference, JSON.stringify(n.answers), n.submitted_at, n.outcome, n.outcome_reason, n.lesson, n.outcome_at);
}
