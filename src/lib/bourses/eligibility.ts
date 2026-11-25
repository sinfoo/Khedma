// Who may apply: ISO codes and nationality groups, resolved for Tunisia and for any other code.
import type { NationalityGroup } from "./types";
import type { Bourse } from "./model";

const set = (codes: string) => new Set(codes.split(" "));

const AFRICA = set("DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW");
const MENA = set("DZ BH DJ EG IQ IR JO KW LB LY MA MR OM PS QA SA SD SY TN AE YE");
const MAGHREB = set("DZ LY MA MR TN");
/** Full members of the Organisation internationale de la Francophonie. */
const FRANCOPHONIE = set("AL AD AM BE BJ BG BF BI KH CM CA CV CF TD KM CG CD CI DJ DM EG GQ FR GA GR GN GW HT LA LB LU MG ML MA MU MR MD MC NE MK RO RW LC ST SN SC CH TG TN VU VN");
/** EU, EEA and Switzerland: scholarship rules that say "non-EU" mean applicants from outside this area. */
const EU_AREA = set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO CH");
/**
 * ponytail: "developing" is everything outside this high-income list, which matches how most programmes use the
 * word. A programme that follows the exact OECD DAC list should name its countries in the catalogue instead.
 */
const HIGH_INCOME = new Set([...EU_AREA, ...set("GB US CA AU NZ JP KR SG IL HK TW AE QA KW SA BH OM BN MC AD SM")]);

const GROUPS: Record<Exclude<NationalityGroup, "*">, (code: string) => boolean> = {
  africa: (c) => AFRICA.has(c),
  mena: (c) => MENA.has(c),
  maghreb: (c) => MAGHREB.has(c),
  francophonie: (c) => FRANCOPHONIE.has(c),
  "non-eu": (c) => !EU_AREA.has(c),
  developing: (c) => !HIGH_INCOME.has(c),
};

/** Is the country `code` in `group`? Unknown group names match nobody. */
export function inGroup(code: string, group: string): boolean {
  if (group === "*") return true;
  return GROUPS[group as keyof typeof GROUPS]?.(code.toUpperCase()) ?? false;
}

/** The first entry of `list` that lets `nationality` apply: "*", the country code itself, or a group. */
export function eligibleVia(list: readonly string[], nationality: string): string | null {
  const nat = nationality.toUpperCase();
  return list.find((e) => e === "*" || e.toUpperCase() === nat) ?? list.find((e) => inGroup(nat, e)) ?? null;
}

export interface Eligibility {
  /** null when the source does not say who may apply (live calls). */
  eligible: boolean | null;
  /** "*", an ISO code, a group, or "verified" when only the hand-checked Tunisia flag says yes. */
  via: string | null;
}

/** For Tunisia the hand-checked `tunisiaEligible` flag wins over the list; other nationalities read the list. */
export function eligibility(b: Pick<Bourse, "eligibleNationalities" | "tunisiaEligible">, nationality: string): Eligibility {
  const via = b.eligibleNationalities ? eligibleVia(b.eligibleNationalities, nationality) : null;
  if (nationality.toUpperCase() === "TN" && b.tunisiaEligible !== null) return { eligible: b.tunisiaEligible, via: b.tunisiaEligible ? (via ?? "verified") : null };
  if (!b.eligibleNationalities) return { eligible: null, via: null };
  return { eligible: via !== null, via };
}
