"use server";

import { revalidatePath } from "next/cache";
import { refreshCatalog } from "@/lib/learn/store";
import { COURSE_SOURCES } from "@/lib/learn/sources";

/** Re-read every course catalog in the background (one refresh at a time); the page shows progress on reload. */
export async function refreshLearn(): Promise<void> {
  void refreshCatalog(Object.keys(COURSE_SOURCES)).catch(() => {});
  revalidatePath("/app/learn");
}
