import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Cloud,
  CodeXml,
  Cog,
  FlaskConical,
  Gamepad2,
  Globe,
  Landmark,
  Languages,
  MessagesSquare,
  MousePointerClick,
  Network,
  Palette,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { FieldKey } from "@/lib/learn/model";

/** Each field's icon and hue: the course covers, the field chips and the cards all read from here. Client-safe. */
export const FIELD_STYLE: Record<FieldKey, { Icon: LucideIcon; hue: number }> = {
  languages: { Icon: Languages, hue: 330 },
  programming: { Icon: CodeXml, hue: 222 },
  web: { Icon: Globe, hue: 198 },
  mobile: { Icon: Smartphone, hue: 262 },
  data: { Icon: BarChart3, hue: 160 },
  ai: { Icon: BrainCircuit, hue: 284 },
  cloud: { Icon: Cloud, hue: 205 },
  security: { Icon: ShieldCheck, hue: 2 },
  networking: { Icon: Network, hue: 178 },
  design: { Icon: Palette, hue: 312 },
  ux: { Icon: MousePointerClick, hue: 24 },
  gamedev: { Icon: Gamepad2, hue: 132 },
  business: { Icon: Briefcase, hue: 40 },
  finance: { Icon: Landmark, hue: 88 },
  engineering: { Icon: Cog, hue: 244 },
  science: { Icon: FlaskConical, hue: 52 },
  soft: { Icon: MessagesSquare, hue: 12 },
};

/** A course with no recognised field still gets a cover, in a quiet blue. */
export const DEFAULT_STYLE = { Icon: BookOpen, hue: 215 };

export const fieldStyle = (fields: readonly FieldKey[]) => (fields[0] ? FIELD_STYLE[fields[0]] : DEFAULT_STYLE);

/** CSS custom property carrying the hue; `.lc-*` classes in globals.css turn it into tints that work in both themes. */
export const hueVar = (hue: number) => ({ ["--h" as string]: hue }) as React.CSSProperties;
