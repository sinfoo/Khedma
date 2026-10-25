// LinkedIn headline and "About" drafted only from facts already in the profile: nothing is invented or upgraded.
// The student copies them and edits on LinkedIn; Khedma never posts anything there. Pure.
import type { JobType, Locale, Profile } from "../types";
import type { ProfileExtra } from "./model";
import { countryName } from "../geo";

/** LinkedIn's headline limit. */
export const HEADLINE_MAX = 220;

const WANT: Record<Locale, Partial<Record<JobType, string>>> = {
  fr: { stage: "un stage", pfe: "un stage de fin d'études (PFE)", alternance: "une alternance", emploi: "un premier emploi", freelance: "des missions freelance" },
  en: { stage: "an internship", pfe: "an end-of-studies internship", alternance: "a work-study position", emploi: "a first job", freelance: "freelance work" },
};

const month = (ymd: string, locale: Locale) => {
  const [y, m] = ymd.split("-").map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric" }) : "";
};

export function linkedinDrafts(p: Pick<Profile, "skills" | "target_roles" | "target_types" | "headline">, x: Pick<ProfileExtra, "school" | "level" | "specialty" | "city" | "availability" | "places">, locale: Locale): { headline: string; about: string } {
  const fr = locale === "fr";
  const study = [x.level, x.specialty].filter(Boolean).join(fr ? " · " : ", ");
  const who = x.school ? (fr ? `Élève ingénieur${study ? ` (${study})` : ""} à ${x.school}` : `Engineering student${study ? ` (${study})` : ""} at ${x.school}`) : p.headline;
  const want = p.target_types.map((t) => WANT[locale][t]).filter(Boolean)[0];
  const role = p.target_roles[0];
  const from = x.availability.from ? month(x.availability.from, locale) : "";
  const seek = want ? (fr ? `Recherche ${want}${role ? ` (${role})` : ""}${from ? ` dès ${from}` : ""}` : `Looking for ${want}${role ? ` (${role})` : ""}${from ? ` from ${from}` : ""}`) : "";
  const skills = p.skills.slice(0, 4);
  const parts = [who, seek, skills.join(" · ")].filter(Boolean);
  let headline = parts.join(" | ");
  while (headline.length > HEADLINE_MAX && parts.length > 1) headline = (parts.pop(), parts.join(" | "));

  const places = x.places.countries.filter((c) => c !== "REMOTE").slice(0, 4).map((c) => countryName(c, fr ? "fr" : "en"));
  const about = [
    x.school ? (fr ? `Je suis élève ingénieur${study ? ` en ${study}` : ""} à ${x.school}${x.city ? `, basé(e) à ${x.city}` : ""}.` : `I am an engineering student${study ? ` in ${study}` : ""} at ${x.school}${x.city ? `, based in ${x.city}` : ""}.`) : "",
    skills.length ? (fr ? `Je travaille avec ${p.skills.slice(0, 6).join(", ")}.` : `I work with ${p.skills.slice(0, 6).join(", ")}.`) : "",
    seek ? `${seek}.${places.length ? (fr ? ` Pays visés : ${places.join(", ")}.` : ` Countries: ${places.join(", ")}.`) : ""}` : "",
    fr ? "Ouvert(e) aux échanges : écrivez-moi." : "Happy to talk: send me a message.",
  ].filter(Boolean).join(" ");
  return { headline, about };
}
