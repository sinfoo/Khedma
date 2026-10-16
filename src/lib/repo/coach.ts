// Coach data access: mock-interview sessions, answers, STAR stories, drill progress.
import { db, migrate } from "@/lib/db";
import type { Lang, Level, Track } from "@/lib/coach/bank";
import type { DrillState, Kind, Scores, SessionQuestion, StoryInput, Tip } from "@/lib/coach/logic";
import type { DebriefQuestion, DebriefRound } from "@/lib/ai/debrief";

function ensure() {
  migrate(
    "coach:001-init",
    `CREATE TABLE IF NOT EXISTS coach_sessions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
       title TEXT NOT NULL,
       track TEXT NOT NULL,
       kind TEXT NOT NULL,
       lang TEXT NOT NULL,
       level INTEGER NOT NULL,
       questions TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'active',
       score REAL,
       dims TEXT,
       engine TEXT NOT NULL DEFAULT 'heuristic',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       finished_at TEXT
     );
     CREATE TABLE IF NOT EXISTS coach_answers (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       session_id INTEGER NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
       idx INTEGER NOT NULL,
       question_id TEXT NOT NULL,
       answer TEXT NOT NULL DEFAULT '',
       seconds INTEGER NOT NULL DEFAULT 0,
       skipped INTEGER NOT NULL DEFAULT 0,
       scores TEXT,
       overall REAL,
       tips TEXT NOT NULL DEFAULT '[]',
       feedback TEXT NOT NULL DEFAULT '',
       engine TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       UNIQUE(session_id, idx)
     );
     CREATE TABLE IF NOT EXISTS coach_stories (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       situation TEXT NOT NULL DEFAULT '',
       task TEXT NOT NULL DEFAULT '',
       action TEXT NOT NULL DEFAULT '',
       result TEXT NOT NULL DEFAULT '',
       tags TEXT NOT NULL DEFAULT '[]',
       skills TEXT NOT NULL DEFAULT '[]',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
     );
     CREATE TABLE IF NOT EXISTS coach_drill (
       question_id TEXT PRIMARY KEY,
       box INTEGER NOT NULL,
       due_at TEXT NOT NULL,
       reviews INTEGER NOT NULL DEFAULT 0
     );`,
  );
  return db();
}

type Row = Record<string, unknown>;
const json = <T>(s: unknown, fallback: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
};

// ---------- sessions ----------
export interface CoachSession {
  id: number;
  application_id: number | null;
  title: string;
  track: Track;
  kind: Kind;
  lang: Lang;
  level: Level;
  questions: SessionQuestion[];
  status: "active" | "done";
  score: number | null;
  dims: Scores | null;
  engine: string;
  created_at: string;
  finished_at: string | null;
}

const rowToSession = (r: Row): CoachSession => ({
  id: r.id as number,
  application_id: (r.application_id as number) ?? null,
  title: r.title as string,
  track: r.track as Track,
  kind: r.kind as Kind,
  lang: r.lang as Lang,
  level: r.level as Level,
  questions: json<SessionQuestion[]>(r.questions, []),
  status: r.status === "done" ? "done" : "active",
  score: (r.score as number) ?? null,
  dims: json<Scores | null>(r.dims, null),
  engine: r.engine as string,
  created_at: r.created_at as string,
  finished_at: (r.finished_at as string) ?? null,
});

export function createSession(s: Pick<CoachSession, "application_id" | "title" | "track" | "kind" | "lang" | "level" | "questions" | "engine">): number {
  const res = ensure()
    .prepare("INSERT INTO coach_sessions (application_id, title, track, kind, lang, level, questions, engine) VALUES (?,?,?,?,?,?,?,?)")
    .run(s.application_id, s.title, s.track, s.kind, s.lang, s.level, JSON.stringify(s.questions), s.engine);
  return Number(res.lastInsertRowid);
}

export function getSession(id: number): CoachSession | null {
  const r = ensure().prepare("SELECT * FROM coach_sessions WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToSession(r) : null;
}

export interface SessionSummary extends CoachSession {
  answered: number;
}

export function listSessions(limit = 50): SessionSummary[] {
  const rows = ensure()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM coach_answers a WHERE a.session_id = s.id AND a.skipped = 0) AS answered
       FROM coach_sessions s ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .all(limit) as Row[];
  return rows.map((r) => ({ ...rowToSession(r), answered: r.answered as number }));
}

export function finishSession(id: number, score: number | null, dims: Scores | null): void {
  ensure()
    .prepare("UPDATE coach_sessions SET status='done', score=?, dims=?, finished_at=datetime('now') WHERE id=?")
    .run(score, dims ? JSON.stringify(dims) : null, id);
}

export function deleteSession(id: number): void {
  ensure().prepare("DELETE FROM coach_sessions WHERE id = ?").run(id);
}

/** Question ids asked in the most recent sessions, to avoid repeats across sessions. */
export function recentQuestionIds(sessions = 3): Set<string> {
  const rows = ensure().prepare("SELECT questions FROM coach_sessions ORDER BY id DESC LIMIT ?").all(sessions) as Row[];
  return new Set(rows.flatMap((r) => json<SessionQuestion[]>(r.questions, []).map((q) => q.id)));
}

// ---------- answers ----------
export interface CoachAnswer {
  idx: number;
  question_id: string;
  answer: string;
  seconds: number;
  skipped: boolean;
  scores: Scores | null;
  overall: number | null;
  tips: Tip[];
  feedback: string;
  engine: string;
}

export function listAnswers(sessionId: number): CoachAnswer[] {
  const rows = ensure().prepare("SELECT * FROM coach_answers WHERE session_id = ? ORDER BY idx").all(sessionId) as Row[];
  return rows.map((r) => ({
    idx: r.idx as number,
    question_id: r.question_id as string,
    answer: r.answer as string,
    seconds: r.seconds as number,
    skipped: !!r.skipped,
    scores: json<Scores | null>(r.scores, null),
    overall: (r.overall as number) ?? null,
    tips: json<Tip[]>(r.tips, []),
    feedback: r.feedback as string,
    engine: r.engine as string,
  }));
}

/** Insert or replace the answer at a position (retry overwrites). */
export function saveAnswer(sessionId: number, a: Omit<CoachAnswer, "feedback" | "engine">): void {
  ensure()
    .prepare(
      `INSERT INTO coach_answers (session_id, idx, question_id, answer, seconds, skipped, scores, overall, tips, feedback, engine)
       VALUES (?,?,?,?,?,?,?,?,?,'','')
       ON CONFLICT(session_id, idx) DO UPDATE SET question_id=excluded.question_id, answer=excluded.answer, seconds=excluded.seconds,
         skipped=excluded.skipped, scores=excluded.scores, overall=excluded.overall, tips=excluded.tips, feedback='', engine='',
         created_at=datetime('now')`,
    )
    .run(sessionId, a.idx, a.question_id, a.answer, a.seconds, a.skipped ? 1 : 0, a.scores ? JSON.stringify(a.scores) : null, a.overall, JSON.stringify(a.tips));
}

export function setFeedback(sessionId: number, idx: number, feedback: string, engine: string): void {
  ensure().prepare("UPDATE coach_answers SET feedback=?, engine=? WHERE session_id=? AND idx=?").run(feedback, engine, sessionId, idx);
}

// ---------- stories ----------
export interface Story extends StoryInput {
  id: number;
  updated_at: string;
}

const rowToStory = (r: Row): Story => ({
  id: r.id as number,
  title: r.title as string,
  situation: r.situation as string,
  task: r.task as string,
  action: r.action as string,
  result: r.result as string,
  tags: json<string[]>(r.tags, []),
  skills: json<string[]>(r.skills, []),
  updated_at: r.updated_at as string,
});

export function listStories(): Story[] {
  return (ensure().prepare("SELECT * FROM coach_stories ORDER BY updated_at DESC, id DESC").all() as Row[]).map(rowToStory);
}

export function getStory(id: number): Story | null {
  const r = ensure().prepare("SELECT * FROM coach_stories WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToStory(r) : null;
}

export function upsertStory(id: number | null, s: StoryInput): number {
  const d = ensure();
  const args = [s.title, s.situation, s.task, s.action, s.result, JSON.stringify(s.tags), JSON.stringify(s.skills)] as const;
  if (id && getStory(id)) {
    d.prepare("UPDATE coach_stories SET title=?, situation=?, task=?, action=?, result=?, tags=?, skills=?, updated_at=datetime('now') WHERE id=?").run(...args, id);
    return id;
  }
  const res = d.prepare("INSERT INTO coach_stories (title, situation, task, action, result, tags, skills) VALUES (?,?,?,?,?,?,?)").run(...args);
  return Number(res.lastInsertRowid);
}

export function deleteStory(id: number): void {
  ensure().prepare("DELETE FROM coach_stories WHERE id = ?").run(id);
}

// ---------- drill ----------
export function drillStates(): Map<string, DrillState> {
  const rows = ensure().prepare("SELECT * FROM coach_drill").all() as unknown as DrillState[];
  return new Map(rows.map((r) => [r.question_id, { question_id: r.question_id, box: r.box, due_at: r.due_at, reviews: r.reviews }]));
}

export function saveDrillState(s: DrillState): void {
  ensure()
    .prepare(
      "INSERT INTO coach_drill (question_id, box, due_at, reviews) VALUES (?,?,?,?) ON CONFLICT(question_id) DO UPDATE SET box=excluded.box, due_at=excluded.due_at, reviews=excluded.reviews",
    )
    .run(s.question_id, s.box, s.due_at, s.reviews);
}

// ---------- debriefs (real interviews) ----------
function ensureDebrief() {
  const d = ensure();
  migrate(
    "coach:002-debrief",
    `CREATE TABLE IF NOT EXISTS coach_debriefs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
       interview_id INTEGER,
       company TEXT NOT NULL DEFAULT '',
       role TEXT NOT NULL DEFAULT '',
       round TEXT NOT NULL,
       interviewer TEXT NOT NULL DEFAULT '',
       outcome TEXT NOT NULL DEFAULT 'pending',
       competencies TEXT NOT NULL DEFAULT '[]',
       questions TEXT NOT NULL DEFAULT '[]',
       retracted TEXT NOT NULL DEFAULT '[]',
       feedback TEXT NOT NULL DEFAULT '',
       engine TEXT NOT NULL DEFAULT 'heuristic',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`,
  );
  return d;
}

export type DebriefOutcome = "pending" | "forward" | "rejected";
export interface Debrief {
  id: number;
  application_id: number | null;
  interview_id: number | null;
  company: string;
  role: string;
  round: DebriefRound;
  interviewer: string;
  outcome: DebriefOutcome;
  competencies: string[];
  questions: DebriefQuestion[];
  retracted: string[];
  feedback: string;
  engine: string;
  created_at: string;
}

const rowToDebrief = (r: Row): Debrief => ({
  id: r.id as number,
  application_id: (r.application_id as number) ?? null,
  interview_id: (r.interview_id as number) ?? null,
  company: r.company as string,
  role: r.role as string,
  round: r.round as DebriefRound,
  interviewer: r.interviewer as string,
  outcome: (r.outcome as DebriefOutcome) ?? "pending",
  competencies: json<string[]>(r.competencies, []),
  questions: json<DebriefQuestion[]>(r.questions, []),
  retracted: json<string[]>(r.retracted, []),
  feedback: r.feedback as string,
  engine: r.engine as string,
  created_at: r.created_at as string,
});

export function createDebrief(d: Omit<Debrief, "id" | "created_at">): number {
  const res = ensureDebrief()
    .prepare(
      `INSERT INTO coach_debriefs (application_id, interview_id, company, role, round, interviewer, outcome, competencies, questions, retracted, feedback, engine)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(d.application_id, d.interview_id, d.company, d.role, d.round, d.interviewer, d.outcome, JSON.stringify(d.competencies), JSON.stringify(d.questions), JSON.stringify(d.retracted), d.feedback, d.engine);
  return Number(res.lastInsertRowid);
}

export function getDebrief(id: number): Debrief | null {
  const r = ensureDebrief().prepare("SELECT * FROM coach_debriefs WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToDebrief(r) : null;
}

export function listDebriefs(limit = 50): Debrief[] {
  return (ensureDebrief().prepare("SELECT * FROM coach_debriefs ORDER BY created_at DESC, id DESC LIMIT ?").all(limit) as Row[]).map(rowToDebrief);
}

export function deleteDebrief(id: number): void {
  ensureDebrief().prepare("DELETE FROM coach_debriefs WHERE id = ?").run(id);
}

/** Every claim the candidate retracted, across debriefs: a hard gate for suggested answers. */
export function allRetracted(): string[] {
  return [...new Set(listDebriefs(500).flatMap((d) => d.retracted))];
}
