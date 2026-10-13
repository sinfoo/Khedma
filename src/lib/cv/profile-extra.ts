import { db, migrate } from "@/lib/db";
import { normalizeExtra, type ProfileExtra } from "./model";

export type { ProfileExtra } from "./model";

function ensure() {
  migrate("profile:001-extra", "ALTER TABLE profile ADD COLUMN extra TEXT NOT NULL DEFAULT '{}'");
}

export function getProfileExtra(): ProfileExtra {
  ensure();
  const r = db().prepare("SELECT extra FROM profile WHERE id = 1").get() as { extra?: string } | undefined;
  let raw: unknown = {};
  try {
    raw = JSON.parse(r?.extra || "{}");
  } catch {
    raw = {};
  }
  return normalizeExtra(raw);
}

/** Shallow-merge a patch (nested objects replaced whole) and store the sanitized result. */
export function updateProfileExtra(patch: Partial<ProfileExtra>): ProfileExtra {
  const next = normalizeExtra({ ...getProfileExtra(), ...patch });
  db().prepare("UPDATE profile SET extra = ? WHERE id = 1").run(JSON.stringify(next));
  return next;
}
