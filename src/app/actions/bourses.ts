"use server";

import { revalidatePath } from "next/cache";
import { isDocKey } from "@/lib/bourses/checklist";
import { cleanCriteria } from "@/lib/bourses/criteria";
import { TRACK_STATUSES, type TrackStatus } from "@/lib/bourses/model";
import { findBourse, getTracking, rememberCriteria as storeCriteria, track, untrack } from "@/lib/bourses/store";

export type BourseResult = { ok: true } | { ok: false; error: "not_found" | "invalid" };

const NOT_FOUND: BourseResult = { ok: false, error: "not_found" };
const INVALID: BourseResult = { ok: false, error: "invalid" };

/** A programme slug or "call-<n>" that exists in the catalogue, in the stored calls, or in the student's tracking. */
const known = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 120 && (!!findBourse(id) || !!getTracking(id));

function done(): BourseResult {
  revalidatePath("/app/bourses");
  revalidatePath("/app/bourses/[id]", "page");
  return { ok: true };
}

/** Start following a scholarship (status "saved"). Saving twice changes nothing. */
export async function saveBourse(id: string): Promise<BourseResult> {
  if (typeof id !== "string" || id.length > 120 || !findBourse(id)) return NOT_FOUND;
  if (!getTracking(id)) track(id);
  return done();
}

export async function setBourseStatus(id: string, status: TrackStatus): Promise<BourseResult> {
  if (!known(id)) return NOT_FOUND;
  if (!(TRACK_STATUSES as readonly unknown[]).includes(status)) return INVALID;
  track(id, { status });
  return done();
}

/** Tick or untick one document of the checklist. */
export async function tickBourseDoc(id: string, key: string, ready: boolean): Promise<BourseResult> {
  if (!known(id)) return NOT_FOUND;
  if (!isDocKey(key) || typeof ready !== "boolean") return INVALID;
  track(id, { checklist: { ...getTracking(id)?.checklist, [key]: ready } });
  return done();
}

export async function setBourseNotes(id: string, notes: string): Promise<BourseResult> {
  if (!known(id)) return NOT_FOUND;
  if (typeof notes !== "string" || notes.length > 5000) return INVALID;
  track(id, { notes: notes.trim() });
  return done();
}

/** Stop following: the tracking row, its notes and ticks are deleted (the page asks first). */
export async function removeBourse(id: string): Promise<BourseResult> {
  if (typeof id !== "string" || !getTracking(id)) return NOT_FOUND;
  untrack(id);
  return done();
}

/** Remember the search so the next visit starts from it. Unknown values are dropped, never stored. */
export async function rememberCriteria(raw: unknown): Promise<BourseResult> {
  storeCriteria(cleanCriteria(raw));
  revalidatePath("/app/bourses");
  return { ok: true };
}
