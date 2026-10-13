import {
  Sun,
  Briefcase,
  KanbanSquare,
  CalendarDays,
  MessagesSquare,
  Sparkles,
  Coins,
  UserRound,
  BarChart3,
  Rss,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "today"
  | "offers"
  | "pipeline"
  | "calendar"
  | "coach"
  | "upskill"
  | "salaries"
  | "profile"
  | "insights"
  | "sources"
  | "settings";

export interface NavItem {
  key: NavKey;
  href: string;
  Icon: LucideIcon;
  exact?: boolean;
  /** Single-key shortcut after pressing "g" (g o = offers). */
  g?: string;
}

export const NAV_GROUPS: { key: "work" | "prepare" | "you" | "system"; items: NavItem[] }[] = [
  {
    key: "work",
    items: [
      { key: "today", href: "/app", Icon: Sun, exact: true, g: "t" },
      { key: "offers", href: "/app/jobs", Icon: Briefcase, g: "o" },
      { key: "pipeline", href: "/app/pipeline", Icon: KanbanSquare, g: "p" },
      { key: "calendar", href: "/app/calendar", Icon: CalendarDays, g: "c" },
    ],
  },
  {
    key: "prepare",
    items: [
      { key: "coach", href: "/app/coach", Icon: MessagesSquare, g: "i" },
      { key: "upskill", href: "/app/upskill", Icon: Sparkles, g: "k" },
      { key: "salaries", href: "/app/salaries", Icon: Coins },
    ],
  },
  {
    key: "you",
    items: [
      { key: "profile", href: "/app/profile", Icon: UserRound, g: "u" },
      { key: "insights", href: "/app/insights", Icon: BarChart3, g: "s" },
    ],
  },
  {
    key: "system",
    items: [
      { key: "sources", href: "/app/sources", Icon: Rss },
      { key: "settings", href: "/app/settings", Icon: Settings },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(path: string, item: NavItem) {
  return item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
}
