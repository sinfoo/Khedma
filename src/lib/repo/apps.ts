// Pipeline / application workspace data access. Pure helpers (stage effects,
// checklist, stats, ICS) are exported separately so they can be unit-tested.
import { db, getApplication, kvGet, kvSet, migrate } from "../db";
import { companyLatency, computeCadence, type Cadence } from "../apps/cadence";
import { COMPARE_DIMS, DEFAULT_WEIGHTS, type CompareDim } from "../apps/compare";
import { normalizeOffer, type OfferRecord } from "../apps/offer";
import { normalizeCompany } from "../company/normalize";
import {
  APP_STATES,
  INTERVIEW_KINDS,
  type AppState,
  type Contact,
  type Interview,
  type InterviewKind,
  type Reminder,
} from "../types";

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

type Row = Record<string, unknown>;

function schema() {
  migrate(
    "apps:001-extras",
    `CREATE TABLE IF NOT EXISTS application_extras (
       application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
       checklist TEXT NOT NULL DEFAULT '[]',
       cv_engine TEXT,
       letter_engine TEXT,
       cv_override_text TEXT,
       cv_override_name TEXT,
       cv_override_at TEXT
     );
     ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom';`,
  );
}

// ---------- pure helpers ----------
export const ACTIVE_STATES: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];
export const CLOSED_STATES: AppState[] = ["rejected", "discarded"];
export const isState = (s: unknown): s is AppState => typeof s === "string" && (APP_STATES as readonly string[]).includes(s);
export const isKind = (s: unknown): s is InterviewKind => typeof s === "string" && (INTERVIEW_KINDS as readonly string[]).includes(s);

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date "YYYY-MM-DD". */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export const isDateTime = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + ":00Z"));
export function addDays(date: string, n: number): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface StageInput {
  appliedAt: string | null;
  nextActionAt: string | null;
  hasOpenFollowup: boolean;
}
export interface StageEffects {
  appliedAt: string | null;
  nextActionAt: string | null;
  /** Due date of the follow-up reminder to create, or null. */
  followupDue: string | null;
  askInterview: boolean;
  askReason: boolean;
}

/** What else changes when an application moves from one stage to another. */
export function stageEffects(from: AppState, to: AppState, s: StageInput, now: Date): StageEffects {
  const r: StageEffects = { appliedAt: s.appliedAt, nextActionAt: s.nextActionAt, followupDue: null, askInterview: false, askReason: false };
  if (from === to) return r;
  if (to === "applied") {
    if (!r.appliedAt) r.appliedAt = now.toISOString();
    if (!s.hasOpenFollowup) {
      r.followupDue = addDays(localDate(now), 7);
      if (!r.nextActionAt) r.nextActionAt = r.followupDue;
    }
  }
  if (to === "evaluated") {
    r.appliedAt = null;
    r.nextActionAt = null;
  }
  r.askInterview = to === "interview";
  r.askReason = to === "rejected";
  return r;
}

export const CHECK_KEYS = ["profile_cv", "evaluated", "cv_tailored", "letter", "applied", "followup", "interview_prep"] as const;
/** Stored in the extras checklist when the student skips the letter step: no letter is needed for this offer. */
export const LETTER_SKIPPED = "letter_skipped";
export type CheckKey = (typeof CHECK_KEYS)[number];
export const isCheckKey = (s: unknown): s is CheckKey => typeof s === "string" && (CHECK_KEYS as readonly string[]).includes(s);

export interface ChecklistItem {
  key: CheckKey;
  done: boolean;
  /** Detected from data (cannot be unticked by hand). */
  auto: boolean;
}

export function computeChecklist(facts: Record<CheckKey, boolean>, manual: string[]) {
  const items: ChecklistItem[] = CHECK_KEYS.map((key) => ({ key, auto: !!facts[key], done: !!facts[key] || manual.includes(key) }));
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

const PAST_APPLIED: AppState[] = ["applied", "responded", "interview", "offer", "hired"];
const RESPONDED: AppState[] = ["responded", "interview", "offer", "hired", "rejected"];

/** Board header numbers. Week = Monday to Sunday, local time. */
export function pipelineStats(apps: { status: AppState; applied_at: string | null }[], interviews: { starts_at: string }[], now: Date) {
  const active = apps.filter((a) => ACTIVE_STATES.includes(a.status) && a.status !== "hired").length;
  const applied = apps.filter((a) => PAST_APPLIED.includes(a.status) || (a.applied_at && a.status === "rejected"));
  const responded = applied.filter((a) => RESPONDED.includes(a.status)).length;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const from = localDate(monday);
  const to = addDays(from, 7);
  const week = interviews.filter((i) => i.starts_at.slice(0, 10) >= from && i.starts_at.slice(0, 10) < to).length;
  return { active, applied: applied.length, responseRate: applied.length ? Math.round((responded / applied.length) * 100) : null, interviewsThisWeek: week };
}

// ---------- ICS (RFC 5545) ----------
export interface IcsEvent {
  uid: string;
  summary: string;
  /** "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:mm[:ss]" (floating local time). */
  start: string;
  durationMin?: number;
  description?: string;
  location?: string;
  url?: string;
  alarmMin?: number;
}

export const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

/** Fold a content line at 75 octets (continuation lines start with a space). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let n = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > limit) {
      parts.push(cur);
      cur = "";
      n = 0;
      limit = 74;
    }
    cur += ch;
    n += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const compact = (d: Date) => stamp(d).slice(0, 15); // naive date-time, no Z

function eventLines(e: IcsEvent, now: Date): string[] | null {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  const m = e.start.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!allDay && !m) return null;
  const out = ["BEGIN:VEVENT", `UID:${e.uid}@khedma.local`, `DTSTAMP:${stamp(now)}`];
  if (allDay) {
    if (!isDate(e.start)) return null;
    out.push(`DTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.start, 1).replace(/-/g, "")}`);
  } else {
    // Treat as naive wall-clock time: compute in UTC arithmetic, print without Z (floating).
    const s = new Date(`${m![1]}T${m![2]}:${m![3]}:${m![4] ?? "00"}Z`);
    if (Number.isNaN(s.getTime())) return null;
    const end = new Date(s.getTime() + Math.max(5, e.durationMin ?? 60) * 60_000);
    out.push(`DTSTART:${compact(s)}`, `DTEND:${compact(end)}`);
  }
  out.push(`SUMMARY:${icsEscape(e.summary)}`);
  if (e.description) out.push(`DESCRIPTION:${icsEscape(e.description)}`);
  if (e.location) out.push(`LOCATION:${icsEscape(e.location)}`);
  if (e.url && /^https?:\/\//.test(e.url)) out.push(`URL:${e.url.replace(/[\r\n]/g, "")}`);
  if (e.alarmMin) out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.summary)}`, `TRIGGER:-PT${Math.round(e.alarmMin)}M`, "END:VALARM");
  out.push("END:VEVENT");
  return out;
}

export function buildIcs(events: IcsEvent[], name: string, now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Khedma//Pipeline//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(name)}`];
  for (const e of events) lines.push(...(eventLines(e, now) ?? []));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ---------- extras ----------
export interface Extras {
  checklist: string[];
  cv_engine: string | null;
  letter_engine: string | null;
  cv_override_text: string | null;
  cv_override_name: string | null;
  cv_override_at: string | null;
}

export function getExtras(appId: number): Extras {
  schema();
  const r = db().prepare("SELECT * FROM application_extras WHERE application_id = ?").get(appId) as Row | undefined;
  let checklist: string[] = [];
  try {
    checklist = r ? (JSON.parse(String(r.checklist)) as string[]) : [];
  } catch {}
  return {
    checklist: Array.isArray(checklist) ? checklist : [],
    cv_engine: (r?.cv_engine as string) ?? null,
    letter_engine: (r?.letter_engine as string) ?? null,
    cv_override_text: (r?.cv_override_text as string) ?? null,
    cv_override_name: (r?.cv_override_name as string) ?? null,
    cv_override_at: (r?.cv_override_at as string) ?? null,
  };
}

export function setExtras(appId: number, patch: Partial<Extras>): void {
  const n = { ...getExtras(appId), ...patch };
  db()
    .prepare(
      `INSERT INTO application_extras (application_id, checklist, cv_engine, letter_engine, cv_override_text, cv_override_name, cv_override_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(application_id) DO UPDATE SET checklist=excluded.checklist, cv_engine=excluded.cv_engine, letter_engine=excluded.letter_engine,
         cv_override_text=excluded.cv_override_text, cv_override_name=excluded.cv_override_name, cv_override_at=excluded.cv_override_at`,
    )
    .run(appId, JSON.stringify(n.checklist), n.cv_engine, n.letter_engine, n.cv_override_text, n.cv_override_name, n.cv_override_at);
}

// ---------- events ----------
export type EventKind = "status" | "note" | "followup" | "doc" | "interview" | "message";
export function logEvent(appId: number, kind: EventKind, payload: string): number {
  const r = db().prepare("INSERT INTO events (application_id, kind, payload) VALUES (?,?,?)").run(appId, kind, payload);
  return Number(r.lastInsertRowid);
}

/** When each application entered its current stage (last status event). */
export function stageEnteredAt(): Map<number, string> {
  const rows = db().prepare("SELECT application_id AS id, MAX(created_at) AS at FROM events WHERE kind = 'status' GROUP BY application_id").all() as Row[];
  return new Map(rows.map((r) => [r.id as number, r.at as string]));
}

export function hasFollowupSent(appId: number): boolean {
  return !!db().prepare("SELECT 1 FROM events WHERE application_id = ? AND kind = 'followup' LIMIT 1").get(appId);
}

// ---------- follow-up cadence ----------
const RESPONSE_STATES = new Set(["responded", "interview", "offer", "hired", "rejected"]);

/**
 * Cadence for many applications in three queries: follow-up events, last past interview,
 * and the company's median days-to-first-answer ("this company usually answers in N days").
 */
export function cadenceFor(apps: { id: number; status: AppState; applied_at: string | null; company: string }[], now = new Date()): Map<number, Cadence> {
  const d = db();
  const entered = stageEnteredAt();
  const followups = new Map<number, string[]>();
  for (const r of d.prepare("SELECT application_id AS id, created_at AS at FROM events WHERE kind = 'followup'").all() as Row[])
    followups.set(r.id as number, [...(followups.get(r.id as number) ?? []), r.at as string]);
  const lastIv = new Map<number, string>();
  // The latest interview, past or planned: a planned one means no thank-you is due yet.
  for (const r of d.prepare("SELECT application_id AS id, MAX(starts_at) AS at FROM interviews GROUP BY application_id").all() as Row[])
    lastIv.set(r.id as number, r.at as string);
  // First response per application (status event in a response state, after applying).
  const rows = d
    .prepare(
      `SELECT a.id, j.company, a.applied_at, (SELECT MIN(e.created_at) FROM events e WHERE e.application_id = a.id AND e.kind = 'status' AND e.payload IN ('responded','interview','offer','hired','rejected')) AS first
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.applied_at IS NOT NULL`,
    )
    .all() as Row[];
  const latency = companyLatency(rows.map((r) => ({ company: r.company as string, applied_at: r.applied_at as string, firstResponseAt: (r.first as string) ?? null })));
  const out = new Map<number, Cadence>();
  for (const a of apps)
    out.set(
      a.id,
      computeCadence(
        {
          status: a.status,
          applied_at: a.applied_at,
          stageEnteredAt: entered.get(a.id) ?? null,
          followups: followups.get(a.id) ?? [],
          lastInterviewAt: lastIv.get(a.id) ?? null,
          companyLatencyDays: RESPONSE_STATES.has(a.status) ? null : (latency.get(a.company.trim().toLowerCase()) ?? null),
        },
        now,
      ),
    );
  return out;
}

// ---------- compare (kv) ----------
export { COMPARE_DIMS, DEFAULT_WEIGHTS, type CompareDim };
const WEIGHTS_KEY = "compare:weights";
const RATINGS_KEY = "compare:ratings";

export function getCompareWeights(): Record<CompareDim, number> {
  const w = kvGet<Partial<Record<CompareDim, number>>>(WEIGHTS_KEY, {});
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of COMPARE_DIMS) if (Number.isFinite(w[k])) out[k] = Math.min(100, Math.max(0, Math.round(Number(w[k]))));
  return out;
}
export const setCompareWeights = (w: Record<CompareDim, number>) => kvSet(WEIGHTS_KEY, w);

/** Personal 1–5 rating per application, 0 = unrated. */
export function getRatings(): Record<number, number> {
  return kvGet<Record<number, number>>(RATINGS_KEY, {});
}
export function setRating(appId: number, n: number): void {
  const r = getRatings();
  if (n) r[appId] = n;
  else delete r[appId];
  kvSet(RATINGS_KEY, r);
}

// ---------- stage changes ----------
export interface MoveSnapshot {
  status: AppState;
  applied_at: string | null;
  next_action_at: string | null;
  eventIds: number[];
  reminderId: number | null;
}

export function applyStageChange(id: number, to: AppState, followupTitle: string, now = new Date()) {
  schema();
  const app = getApplication(id);
  if (!app) return null;
  const snapshot: MoveSnapshot = { status: app.status, applied_at: app.applied_at, next_action_at: app.next_action_at, eventIds: [], reminderId: null };
  const fx = stageEffects(app.status, to, { appliedAt: app.applied_at, nextActionAt: app.next_action_at, hasOpenFollowup: !!openFollowup(id) }, now);
  if (app.status === to) return { snapshot, fx };
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare("UPDATE applications SET status=?, applied_at=?, next_action_at=?, updated_at=datetime('now') WHERE id=?").run(to, fx.appliedAt, fx.nextActionAt, id);
    snapshot.eventIds.push(logEvent(id, "status", to));
    if (fx.followupDue) {
      const company = (d.prepare("SELECT company FROM jobs WHERE id = ?").get(app.job_id) as Row | undefined)?.company ?? "";
      snapshot.reminderId = addReminder({ application_id: id, title: followupTitle.replace("{company}", String(company)), due_at: fx.followupDue, kind: "followup" });
    }
    if (to === "evaluated") d.prepare("UPDATE reminders SET done = 1 WHERE application_id = ? AND kind = 'followup' AND done = 0").run(id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { snapshot, fx };
}

/** Restore an application to a snapshot taken by applyStageChange (scoped to that application). */
export function undoStageChange(id: number, s: MoveSnapshot): boolean {
  if (!getApplication(id)) return false;
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare("UPDATE applications SET status=?, applied_at=?, next_action_at=?, updated_at=datetime('now') WHERE id=?").run(s.status, s.applied_at, s.next_action_at, id);
    for (const e of s.eventIds) d.prepare("DELETE FROM events WHERE id = ? AND application_id = ?").run(e, id);
    if (s.reminderId) d.prepare("DELETE FROM reminders WHERE id = ? AND application_id = ?").run(s.reminderId, id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return true;
}

// ---------- contacts ----------
const rowToContact = (r: Row): Contact => ({
  id: r.id as number,
  application_id: (r.application_id as number | null) ?? null,
  name: r.name as string,
  role: r.role as string,
  company: (r.company as string) ?? "",
  email: r.email as string,
  phone: r.phone as string,
  linkedin: r.linkedin as string,
  notes: r.notes as string,
  created_at: r.created_at as string,
});
export type ContactInput = Omit<Contact, "id" | "application_id" | "created_at">;

export function listContacts(appId: number): Contact[] {
  return (db().prepare("SELECT * FROM contacts WHERE application_id = ? ORDER BY id").all(appId) as Row[]).map(rowToContact);
}
export function contactCounts(): Map<number, number> {
  const rows = db().prepare("SELECT application_id AS id, COUNT(*) AS n FROM contacts GROUP BY application_id").all() as Row[];
  return new Map(rows.map((r) => [r.id as number, r.n as number]));
}
/** Everyone, application-linked or not, with the offer they were met through. */
export type NetworkContact = Contact & { job_title: string | null };
export function listAllContacts(): NetworkContact[] {
  return (
    db()
      .prepare("SELECT c.*, j.title AS job_title FROM contacts c LEFT JOIN applications a ON a.id = c.application_id LEFT JOIN jobs j ON j.id = a.job_id ORDER BY c.name COLLATE NOCASE, c.id")
      .all() as Row[]
  ).map((r) => ({ ...rowToContact(r), job_title: (r.job_title as string) ?? null }));
}
/** People met elsewhere who work at this application's company: "you know X at Y, ask for a referral". */
export function contactsAtCompany(company: string, appId: number): NetworkContact[] {
  const key = normalizeCompany(company);
  return key ? listAllContacts().filter((c) => c.application_id !== appId && normalizeCompany(c.company) === key) : [];
}
/** Attach a network contact (on no application yet) to an application. */
export function attachContact(appId: number, contactId: number): boolean {
  return db().prepare("UPDATE contacts SET application_id = ? WHERE id = ? AND application_id IS NULL").run(appId, contactId).changes > 0;
}
/** appId null = a network contact. `IS` matches both a number and NULL. */
export function saveContact(appId: number | null, c: ContactInput, contactId?: number): void {
  if (contactId)
    db()
      .prepare("UPDATE contacts SET name=?, role=?, company=?, email=?, phone=?, linkedin=?, notes=? WHERE id=? AND application_id IS ?")
      .run(c.name, c.role, c.company, c.email, c.phone, c.linkedin, c.notes, contactId, appId);
  else
    db()
      .prepare("INSERT INTO contacts (application_id, name, role, company, email, phone, linkedin, notes) VALUES (?,?,?,?,?,?,?,?)")
      .run(appId, c.name, c.role, c.company, c.email, c.phone, c.linkedin, c.notes);
}
export function deleteContact(appId: number | null, contactId: number): void {
  db().prepare("DELETE FROM contacts WHERE id = ? AND application_id IS ?").run(contactId, appId);
}

// ---------- interviews ----------
const rowToInterview = (r: Row): Interview => ({
  id: r.id as number,
  application_id: r.application_id as number,
  starts_at: r.starts_at as string,
  duration_min: r.duration_min as number,
  kind: r.kind as InterviewKind,
  location: r.location as string,
  notes: r.notes as string,
  outcome: r.outcome as string,
  created_at: r.created_at as string,
});
export type InterviewInput = Omit<Interview, "id" | "application_id" | "created_at">;

export function listInterviews(appId: number): Interview[] {
  return (db().prepare("SELECT * FROM interviews WHERE application_id = ? ORDER BY starts_at").all(appId) as Row[]).map(rowToInterview);
}
export function getInterview(id: number): Interview | null {
  const r = db().prepare("SELECT * FROM interviews WHERE id = ?").get(id) as Row | undefined;
  return r ? rowToInterview(r) : null;
}
export function upcomingInterviews(fromDate: string): Interview[] {
  return (db().prepare("SELECT * FROM interviews WHERE substr(starts_at, 1, 10) >= ? ORDER BY starts_at").all(fromDate) as Row[]).map(rowToInterview);
}
export function allInterviewStarts(): { application_id: number; starts_at: string }[] {
  return db().prepare("SELECT application_id, starts_at FROM interviews ORDER BY starts_at").all() as unknown as { application_id: number; starts_at: string }[];
}
export function saveInterview(appId: number, i: InterviewInput, interviewId?: number): number {
  if (interviewId) {
    db()
      .prepare("UPDATE interviews SET starts_at=?, duration_min=?, kind=?, location=?, notes=?, outcome=? WHERE id=? AND application_id=?")
      .run(i.starts_at, i.duration_min, i.kind, i.location, i.notes, i.outcome, interviewId, appId);
    return interviewId;
  }
  const r = db()
    .prepare("INSERT INTO interviews (application_id, starts_at, duration_min, kind, location, notes, outcome) VALUES (?,?,?,?,?,?,?)")
    .run(appId, i.starts_at, i.duration_min, i.kind, i.location, i.notes, i.outcome);
  return Number(r.lastInsertRowid);
}
export function deleteInterview(appId: number, interviewId: number): void {
  db().prepare("DELETE FROM interviews WHERE id = ? AND application_id = ?").run(interviewId, appId);
}

// ---------- reminders ----------
export type AppReminder = Reminder & { kind: string };
const rowToReminder = (r: Row): AppReminder => ({
  id: r.id as number,
  application_id: (r.application_id as number) ?? null,
  job_id: (r.job_id as number) ?? null,
  title: r.title as string,
  due_at: r.due_at as string,
  done: !!r.done,
  created_at: r.created_at as string,
  kind: (r.kind as string) ?? "custom",
});

export function listReminders(appId: number): AppReminder[] {
  schema();
  return (db().prepare("SELECT * FROM reminders WHERE application_id = ? ORDER BY done, due_at").all(appId) as Row[]).map(rowToReminder);
}
export function openReminders(): AppReminder[] {
  schema();
  return (db().prepare("SELECT * FROM reminders WHERE done = 0 ORDER BY due_at").all() as Row[]).map(rowToReminder);
}
export function addReminder(r: { application_id: number; title: string; due_at: string; kind?: string }): number {
  schema();
  const job = db().prepare("SELECT job_id FROM applications WHERE id = ?").get(r.application_id) as Row | undefined;
  const res = db()
    .prepare("INSERT INTO reminders (application_id, job_id, title, due_at, kind) VALUES (?,?,?,?,?)")
    .run(r.application_id, (job?.job_id as number) ?? null, r.title, r.due_at, r.kind ?? "custom");
  return Number(res.lastInsertRowid);
}
export function setReminderDone(appId: number, id: number, done: boolean): void {
  db().prepare("UPDATE reminders SET done = ? WHERE id = ? AND application_id = ?").run(done ? 1 : 0, id, appId);
}
export function deleteReminder(appId: number, id: number): void {
  db().prepare("DELETE FROM reminders WHERE id = ? AND application_id = ?").run(id, appId);
}
export function openFollowup(appId: number): AppReminder | null {
  schema();
  const r = db().prepare("SELECT * FROM reminders WHERE application_id = ? AND kind = 'followup' AND done = 0 LIMIT 1").get(appId) as Row | undefined;
  return r ? rowToReminder(r) : null;
}
export function completeFollowups(appId: number): void {
  schema();
  db().prepare("UPDATE reminders SET done = 1 WHERE application_id = ? AND kind = 'followup' AND done = 0").run(appId);
}

// ---------- calendar feed ----------
/** Tracked (not closed) applications with a posting deadline on or after `fromDate`. */
export function trackedDeadlines(fromDate: string): { application_id: number; title: string; company: string; deadline: string; url: string }[] {
  return db()
    .prepare(
      `SELECT a.id AS application_id, j.title, j.company, j.deadline, j.url FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE j.deadline IS NOT NULL AND substr(j.deadline, 1, 10) >= ? AND a.status NOT IN ('rejected','discarded','hired')
       ORDER BY j.deadline`,
    )
    .all(fromDate) as unknown as { application_id: number; title: string; company: string; deadline: string; url: string }[];
}

/** Title + company for each application id (for labels in feeds). */
export function appLabels(): Map<number, { title: string; company: string }> {
  const rows = db().prepare("SELECT a.id, j.title, j.company FROM applications a JOIN jobs j ON j.id = a.job_id").all() as Row[];
  return new Map(rows.map((r) => [r.id as number, { title: r.title as string, company: r.company as string }]));
}

// ---------- offer received ----------
/** The offer received for an application (stored as one JSON value; no schema). */
export function getOffer(appId: number): OfferRecord {
  return normalizeOffer(kvGet<unknown>(`offer:${appId}`, null));
}
export function setOffer(appId: number, o: OfferRecord): void {
  kvSet(`offer:${appId}`, o);
}
