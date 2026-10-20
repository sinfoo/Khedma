import type { Locale } from "../types";
import { longDate, type DocFacts } from "../ai/placeholders";
import { getProfileExtra } from "../cv/profile-extra";
import { listContacts } from "../repo/apps";

/** What a sendable letter needs that the CV doesn't say: today's date, the contact saved for this application, availability. */
export function docFacts(applicationId: number, locale: Locale): DocFacts {
  const av = getProfileExtra().availability;
  const day = (s: string) => longDate(new Date(`${s}T12:00:00`), locale);
  const availability =
    av.from && av.to
      ? locale === "fr" ? `du ${day(av.from)} au ${day(av.to)}` : `from ${day(av.from)} to ${day(av.to)}`
      : av.from ? (locale === "fr" ? `à partir du ${day(av.from)}` : `from ${day(av.from)}`) : null;
  return { date: longDate(new Date(), locale), recipient: listContacts(applicationId).find((c) => c.name.trim())?.name.trim() ?? null, availability };
}
