import type { Profile } from "@/lib/types";
import { getProfileExtra } from "./profile-extra";

/**
 * True when the user has not set up anything yet (no name, no CV) and has not
 * finished or skipped the welcome wizard. The dashboard redirects to /app/welcome on true.
 */
export function needsOnboarding(profile: Pick<Profile, "name" | "cv_md">, done = getProfileExtra().onboarding.done): boolean {
  return !done && !profile.name.trim() && !profile.cv_md.trim();
}
