"use server";

import { revalidatePath } from "next/cache";
import { importClipped } from "@/lib/clip";

/** Offers handed over by the clipper bookmarklet (see /app/clip). */
export async function importClip(payload: unknown) {
  const r = importClipped((payload ?? {}) as Parameters<typeof importClipped>[0]);
  if (r.ok && r.added) revalidatePath("/app", "layout");
  return r;
}
