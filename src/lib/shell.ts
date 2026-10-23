import { db, getProfile, stats } from "./db";
import { getEngine } from "./ai";
import { getWeeklyGoal, weeklyCounts } from "./repo/insights";
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
  const today = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const count = (sql: string, ...args: string[]) => (d.prepare(sql).get(...args) as { n: number }).n;

  const [engine, s] = await Promise.all([getEngine(profile.settings), Promise.resolve(stats())]);
  const applied = (d.prepare("SELECT applied_at FROM applications WHERE applied_at IS NOT NULL").all() as { applied_at: string }[]).map((r) => r.applied_at);
  const done = weeklyCounts(applied, 1, now)[0];

  const unscored = count("SELECT COUNT(*) AS n FROM jobs WHERE archived = 0 AND id NOT IN (SELECT job_id FROM evaluations)");
  const active = ["applied", "responded", "interview", "offer"].reduce((acc, k) => acc + (s.byStatus[k as keyof typeof s.byStatus] ?? 0), 0);
  const overdue = count("SELECT COUNT(*) AS n FROM reminders WHERE done = 0 AND substr(due_at,1,10) < ?", today);
  const dueSoon =
    count("SELECT COUNT(*) AS n FROM reminders WHERE done = 0 AND substr(due_at,1,10) BETWEEN ? AND ?", today, in7) +
    count("SELECT COUNT(*) AS n FROM interviews WHERE substr(starts_at,1,10) BETWEEN ? AND ?", today, in7) +
    count(
      "SELECT COUNT(*) AS n FROM jobs j LEFT JOIN applications a ON a.job_id = j.id WHERE j.archived = 0 AND j.deadline BETWEEN ? AND ? AND (a.id IS NULL OR a.status = 'evaluated')",
      today,
      in7,
    );
  let drills = 0;
  for (const st of drillStates().values()) if (st.due_at <= now.toISOString()) drills++;

  const label = engine.label.replace("claude:", "Claude ");
  return {
    name: profile.name,
    initials: initialsOf(profile.name),
    strength: profileStrength(profile),
    engine: { online: engine.online, label, short: engine.online ? label.split(/[\s·]/)[0] : "offline" },
    goal: { done, target: getWeeklyGoal() },
    week: { due: dueSoon + overdue },
    badges: {
      offers: { n: unscored, tone: "saffron" },
      pipeline: { n: active, tone: "accent" },
      calendar: { n: dueSoon + overdue, tone: overdue ? "danger" : "accent" },
      coach: { n: drills, tone: "muted" },
    },
  };
}
