// Turn structured engine output (reason/action/insight keys + vars) into sentences in the user's language.
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import type { Reason } from "@/lib/recommend/engine";
import type { Insight } from "@/lib/recommend/profile-model";

type Vars = Record<string, string | number>;

/** Field / level / job-type ids inside vars become labels. */
function localize(t: Dict, vars: Vars = {}): Vars {
  const d = t.discover2;
  const out: Vars = { ...vars };
  if (typeof vars.field === "string" && vars.field in d.fields) out.field = d.fields[vars.field as keyof typeof d.fields];
  if (typeof vars.level === "string" && vars.level in d.levels) out.level = d.levels[vars.level as keyof typeof d.levels];
  if (typeof vars.type === "string" && vars.type in t.jobTypes) out.type = t.jobTypes[vars.type as keyof typeof t.jobTypes];
  return out;
}

const pick = (table: Record<string, string>, key: string) => table[key] ?? key;

export const reasonText = (t: Dict, r: Reason) => fmt(pick(t.discover2.reasons, r.key), localize(t, r.vars));
export const actionText = (t: Dict, key: string, vars?: Vars) => fmt(pick(t.discover2.actions, key), localize(t, vars));
export const roleWhyText = (t: Dict, r: Reason) => fmt(pick(t.discover2.roles.why, r.key), localize(t, r.vars));
export const sourceWhyText = (t: Dict, r: Reason) => fmt(pick(t.discover2.sources.why, r.key), localize(t, r.vars));
export const insightText = (t: Dict, i: Insight) => i.text ?? fmt(pick(t.discover2.insights, i.key), localize(t, i.vars));
