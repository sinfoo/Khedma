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
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "today"
  | "discover"
  | "offers"
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

/** The loop, with the same four names on the landing page, the nav, Get started and onboarding. */
export type NavGroupKey = "find" | "choose" | "apply" | "follow";
/** Live counts the sidebar can show as a badge next to an item. */
export type NavBadgeKey = "offers" | "pipeline" | "calendar" | "coach" | "sources";

export interface NavItem {
  key: NavKey;
  href: string;
  Icon: LucideIcon;
  exact?: boolean;
  /** Single-key shortcut after pressing "g" (g o = offers). */
  g?: string;
  badge?: NavBadgeKey;
}

/**
 * The loop's four steps: find → choose → apply → follow up, Today first. Profile and Settings live in the sidebar
 * footer. Routes and shortcuts are unchanged.
 */
export const NAV_GROUPS: { key: NavGroupKey; items: NavItem[] }[] = [
  {
    key: "find",
    items: [
      { key: "today", href: "/app", Icon: Sun, exact: true, g: "t" },
      { key: "sources", href: "/app/sources", Icon: Radar, badge: "sources" },
      { key: "offers", href: "/app/jobs", Icon: Briefcase, g: "o", badge: "offers" },
    ],
  },
  {
    key: "choose",
    items: [
      { key: "discover", href: "/app/discover", Icon: Compass, g: "d" },
      { key: "companies", href: "/app/companies", Icon: Building2 },
      { key: "salaries", href: "/app/salaries", Icon: Coins },
      { key: "abroad", href: "/app/abroad", Icon: Globe2 },
      { key: "upskill", href: "/app/upskill", Icon: Sparkles, g: "k" },
      { key: "learn", href: "/app/learn", Icon: BookOpen, g: "l" },
    ],
  },
  {
    key: "apply",
    items: [
      { key: "pipeline", href: "/app/pipeline", Icon: KanbanSquare, g: "p", badge: "pipeline" },
      { key: "contacts", href: "/app/contacts", Icon: Users },
      { key: "coach", href: "/app/coach", Icon: MessagesSquare, g: "i", badge: "coach" },
    ],
  },
  {
    key: "follow",
    items: [
      { key: "calendar", href: "/app/calendar", Icon: CalendarDays, g: "c", badge: "calendar" },
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
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}
