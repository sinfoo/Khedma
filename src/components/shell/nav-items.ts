import {
  Sun,
  Briefcase,
  KanbanSquare,
  CalendarDays,
  MessagesSquare,
  Sparkles,
  Coins,
  Globe2,
  BookOpen,
  UserRound,
  BarChart3,
  Radar,
  Settings,
  Compass,
  Building2,
  Users,
  FileBarChart,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "today"
  | "discover"
  | "offers"
  | "bourses"
  | "companies"
  | "contacts"
  | "reports"
  | "pipeline"
  | "calendar"
  | "coach"
  | "upskill"
  | "salaries"
  | "abroad"
  | "learn"
  | "profile"
  | "insights"
  | "sources"
  | "settings";

/** The student's workflow: find offers, choose, apply and track, prepare, review. "top" (Today) has no heading. */
export type NavGroupKey = "find" | "choose" | "apply" | "prepare" | "review";
/** Live counts the sidebar can show as a badge next to an item. */
export type NavBadgeKey = "offers" | "pipeline" | "calendar" | "coach" | "sources";

export interface NavItem {
  key: NavKey;
  href: string;
  Icon: LucideIcon;
  exact?: boolean;
  /** Another route prefix that belongs to this item (the apply flow is part of the pipeline). */
  also?: string;
  /** Single-key shortcut after pressing "g" (g o = offers). */
  g?: string;
  badge?: NavBadgeKey;
}

/**
 * Ordered along the workflow, daily pages first in each group: Today, then find -> choose -> apply and track ->
 * prepare -> review. Profile and Settings live in the sidebar footer. Routes and shortcuts are unchanged.
 */
export const NAV_GROUPS: { key: NavGroupKey | "top"; items: NavItem[] }[] = [
  { key: "top", items: [{ key: "today", href: "/app", Icon: Sun, exact: true, g: "t" }] },
  {
    key: "find",
    items: [
      { key: "offers", href: "/app/jobs", Icon: Briefcase, g: "o", badge: "offers" },
      { key: "bourses", href: "/app/bourses", Icon: GraduationCap },
      { key: "discover", href: "/app/discover", Icon: Compass, g: "d" },
      { key: "sources", href: "/app/sources", Icon: Radar, also: "/app/clip", badge: "sources" },
    ],
  },
  {
    key: "choose",
    items: [
      { key: "companies", href: "/app/companies", Icon: Building2 },
      { key: "salaries", href: "/app/salaries", Icon: Coins },
      { key: "abroad", href: "/app/abroad", Icon: Globe2 },
    ],
  },
  {
    key: "apply",
    items: [
      { key: "pipeline", href: "/app/pipeline", Icon: KanbanSquare, also: "/app/apply", g: "p", badge: "pipeline" },
      { key: "calendar", href: "/app/calendar", Icon: CalendarDays, g: "c", badge: "calendar" },
      { key: "contacts", href: "/app/contacts", Icon: Users },
    ],
  },
  {
    key: "prepare",
    items: [
      { key: "coach", href: "/app/coach", Icon: MessagesSquare, g: "i", badge: "coach" },
      { key: "upskill", href: "/app/upskill", Icon: Sparkles, g: "k" },
      { key: "learn", href: "/app/learn", Icon: BookOpen, g: "l" },
    ],
  },
  {
    key: "review",
    items: [
      { key: "insights", href: "/app/insights", Icon: BarChart3, g: "s" },
      { key: "reports", href: "/app/reports", Icon: FileBarChart },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { key: "profile", href: "/app/profile", Icon: UserRound, g: "u" },
  { key: "settings", href: "/app/settings", Icon: Settings },
];

export const NAV_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_ITEMS];

export function isActive(path: string, item: NavItem) {
  if (item.exact) return path === item.href;
  return [item.href, item.also].some((h) => !!h && (path === h || path.startsWith(h + "/")));
}
