import { db, getProfile, stats } from "./db";
import { getEngine } from "./ai";
import { getWeeklyGoal, weekAgenda, weeklyCounts } from "./repo/insights";
import { drillStates } from "./repo/coach";
import type { NavBadgeKey } from "@/components/shell/nav-items";

export interface ShellData {
  name: string;
  initials: string;
  /** 0–100, how complete the profile is for scoring. */
  strength: number;
  engine: { online: boolean; label: string; short: string };
  goal: { done: number; target: number };
  week: { due: number };
  badges: Partial<Record<NavBadgeKey, { n: number; tone: "accent" | "saffron" | "danger" | "muted" }>>;
}

const initialsOf = (name: string) =>
  (name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "K").toUpperCase();

export function profileStrength(p: ReturnType<typeof getProfile>): number {
  let n = 0;
  if (p.cv_md.trim().length >= 50) n += 40;
  if (p.skills.length > 0) n += 20;
  if (p.target_roles.length > 0) n += 20;
  if (p.target_locations.length > 0) n += 10;
  if (p.headline.trim()) n += 10;
  return n;
}

/** Everything the sidebar and top bar need, in one DB pass. */
export async function getShellData(): Promise<ShellData> {
  const profile = getProfile();
  const d = db();
  const now = new Date();
  const today = now.toLocaleDateString("sv");
  const count = (sql: string, ...args: string[]) => (d.prepare(sql).get(...args) as { n: number }).n;

  const [engine, s] = await Promise.all([getEngine(profile.settings), Promise.resolve(stats())]);
  const applied = (d.prepare("SELECT applied_at FROM applications WHERE applied_at IS NOT NULL").all() as { applied_at: string }[]).map((r) => r.applied_at);
  const done = weeklyCounts(applied, 1, now)[0];

  // Offers: good matches nobody acted on yet (not the scoring backlog, which is optional work).
  const matches = count(
    `SELECT COUNT(*) AS n FROM jobs j WHERE j.archived = 0 AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
     AND (j.deadline IS NULL OR substr(j.deadline, 1, 10) >= ?)
     AND (SELECT e.verdict FROM evaluations e WHERE e.job_id = j.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) IN ('apply_now', 'apply')`,
    today,
  );
  // Pipeline: tracked offers still to send, the step that needs the student.
  const toSend = s.byStatus.evaluated ?? 0;
  // The same list as Today's "This week" card, so the two always agree.
  const agenda = weekAgenda(now);
  const overdue = agenda.some((x) => x.overdue);
  let drills = 0;
  for (const st of drillStates().values()) if (st.due_at <= now.toISOString()) drills++;

  const label = engine.label.replace("claude:", "Claude ");
  return {
    name: profile.name,
    initials: initialsOf(profile.name),
    strength: profileStrength(profile),
    engine: { online: engine.online, label, short: engine.online ? label.split(/[\s·]/)[0] : "offline" },
    goal: { done, target: getWeeklyGoal() },
    week: { due: agenda.length },
    badges: {
      offers: { n: matches, tone: "accent" },
      pipeline: { n: toSend, tone: "saffron" },
      calendar: { n: agenda.length, tone: overdue ? "danger" : "accent" },
      coach: { n: drills, tone: "muted" },
    },
  };
}
