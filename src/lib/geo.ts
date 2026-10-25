// Countries and Tunisian cities for "where do you want to apply", plus a location-text classifier.

export interface Country {
  code: string; // ISO 3166-1 alpha-2, or "REMOTE"
  flag: string;
  fr: string;
  en: string;
  /** Lowercase, accent-free substrings that identify the country in a free-text location. */
  aliases: string[];
  /** Major cities (lowercase, accent-free) that imply the country. */
  cities: string[];
  /** Keyword used on job boards when searching this country. */
  search: string;
}

export const COUNTRIES: Country[] = [
  { code: "TN", flag: "🇹🇳", fr: "Tunisie", en: "Tunisia", aliases: ["tunisie", "tunisia", "tunisian"], cities: ["tunis", "ariana", "lac 1", "lac 2", "berges du lac", "la marsa", "ben arous", "manouba", "sfax", "sousse", "monastir", "nabeul", "hammamet", "bizerte", "gabes", "kairouan", "gafsa", "mahdia", "beja", "jendouba", "kef", "medenine", "tataouine", "tozeur", "kebili", "zaghouan", "siliana", "sidi bouzid", "kasserine", "enfidha", "technopole", "ghazala", "charguia"], search: "Tunisia" },
  { code: "FR", flag: "🇫🇷", fr: "France", en: "France", aliases: ["france", "french", "ile-de-france", "idf"], cities: ["paris", "lyon", "marseille", "toulouse", "nantes", "lille", "bordeaux", "grenoble", "nice", "rennes", "strasbourg", "montpellier", "sophia"], search: "France" },
  { code: "DE", flag: "🇩🇪", fr: "Allemagne", en: "Germany", aliases: ["germany", "allemagne", "deutschland"], cities: ["berlin", "munich", "munchen", "hamburg", "frankfurt", "stuttgart", "cologne", "koln", "dusseldorf"], search: "Germany" },
  { code: "CA", flag: "🇨🇦", fr: "Canada", en: "Canada", aliases: ["canada", "quebec", "québec"], cities: ["montreal", "toronto", "ottawa", "vancouver", "quebec city"], search: "Canada" },
  { code: "BE", flag: "🇧🇪", fr: "Belgique", en: "Belgium", aliases: ["belgium", "belgique", "belgie"], cities: ["brussels", "bruxelles", "antwerp", "anvers", "ghent", "liege"], search: "Belgium" },
  { code: "CH", flag: "🇨🇭", fr: "Suisse", en: "Switzerland", aliases: ["switzerland", "suisse", "schweiz"], cities: ["geneva", "geneve", "zurich", "lausanne", "bern", "basel"], search: "Switzerland" },
  { code: "NL", flag: "🇳🇱", fr: "Pays-Bas", en: "Netherlands", aliases: ["netherlands", "pays-bas", "nederland", "holland"], cities: ["amsterdam", "rotterdam", "eindhoven", "utrecht", "the hague"], search: "Netherlands" },
  { code: "GB", flag: "🇬🇧", fr: "Royaume-Uni", en: "United Kingdom", aliases: ["united kingdom", "royaume-uni", "england", "scotland", "uk"], cities: ["london", "londres", "manchester", "edinburgh", "cambridge", "oxford"], search: "United Kingdom" },
  { code: "US", flag: "🇺🇸", fr: "États-Unis", en: "United States", aliases: ["united states", "etats-unis", "usa", "u.s."], cities: ["new york", "san francisco", "seattle", "austin", "boston", "chicago"], search: "United States" },
  { code: "AE", flag: "🇦🇪", fr: "Émirats arabes unis", en: "United Arab Emirates", aliases: ["united arab emirates", "emirats", "uae"], cities: ["dubai", "abu dhabi", "sharjah"], search: "United Arab Emirates" },
  { code: "QA", flag: "🇶🇦", fr: "Qatar", en: "Qatar", aliases: ["qatar"], cities: ["doha"], search: "Qatar" },
  { code: "SA", flag: "🇸🇦", fr: "Arabie saoudite", en: "Saudi Arabia", aliases: ["saudi", "arabie"], cities: ["riyadh", "jeddah", "dammam", "neom"], search: "Saudi Arabia" },
  { code: "MA", flag: "🇲🇦", fr: "Maroc", en: "Morocco", aliases: ["morocco", "maroc"], cities: ["casablanca", "rabat", "tangier", "tanger", "marrakech"], search: "Morocco" },
  { code: "DZ", flag: "🇩🇿", fr: "Algérie", en: "Algeria", aliases: ["algeria", "algerie"], cities: ["alger", "algiers", "oran"], search: "Algeria" },
  { code: "IT", flag: "🇮🇹", fr: "Italie", en: "Italy", aliases: ["italy", "italie", "italia"], cities: ["milan", "milano", "rome", "roma", "turin", "torino"], search: "Italy" },
  { code: "ES", flag: "🇪🇸", fr: "Espagne", en: "Spain", aliases: ["spain", "espagne", "espana"], cities: ["madrid", "barcelona", "barcelone", "valencia"], search: "Spain" },
  { code: "LU", flag: "🇱🇺", fr: "Luxembourg", en: "Luxembourg", aliases: ["luxembourg"], cities: [], search: "Luxembourg" },
  { code: "SE", flag: "🇸🇪", fr: "Suède", en: "Sweden", aliases: ["sweden", "suede"], cities: ["stockholm", "gothenburg", "goteborg", "malmo", "uppsala", "linkoping", "lund"], search: "Sweden" },
  { code: "NO", flag: "🇳🇴", fr: "Norvège", en: "Norway", aliases: ["norway", "norvege", "norge"], cities: ["oslo", "bergen", "trondheim", "stavanger"], search: "Norway" },
  { code: "DK", flag: "🇩🇰", fr: "Danemark", en: "Denmark", aliases: ["denmark", "danemark", "danmark"], cities: ["copenhagen", "copenhague", "kobenhavn", "københavn", "aarhus", "odense", "aalborg", "kgs. lyngby", "lyngby"], search: "Denmark" },
  { code: "FI", flag: "🇫🇮", fr: "Finlande", en: "Finland", aliases: ["finland", "finlande", "suomi"], cities: ["helsinki", "espoo", "tampere", "oulu", "turku"], search: "Finland" },
  { code: "IS", flag: "🇮🇸", fr: "Islande", en: "Iceland", aliases: ["iceland", "islande"], cities: ["reykjavik"], search: "Iceland" },
  { code: "IE", flag: "🇮🇪", fr: "Irlande", en: "Ireland", aliases: ["ireland", "irlande"], cities: ["dublin", "cork"], search: "Ireland" },
  { code: "PT", flag: "🇵🇹", fr: "Portugal", en: "Portugal", aliases: ["portugal"], cities: ["lisbon", "lisbonne", "lisboa", "porto", "braga", "coimbra", "aveiro"], search: "Portugal" },
  { code: "AT", flag: "🇦🇹", fr: "Autriche", en: "Austria", aliases: ["austria", "autriche", "osterreich"], cities: ["vienna", "wien", "graz", "linz", "salzburg", "innsbruck"], search: "Austria" },
  { code: "CZ", flag: "🇨🇿", fr: "Tchéquie", en: "Czechia", aliases: ["czechia", "czech", "tchequie", "tcheque", "cesko", "ceska republika"], cities: ["prague", "praha", "brno", "ostrava", "plzen"], search: "Czechia" },
  { code: "PL", flag: "🇵🇱", fr: "Pologne", en: "Poland", aliases: ["poland", "pologne", "polska"], cities: ["warsaw", "warszawa", "varsovie", "krakow", "cracovie", "wroclaw", "wrocław", "gdansk", "poznan", "katowice"], search: "Poland" },
  { code: "TR", flag: "🇹🇷", fr: "Turquie", en: "Türkiye", aliases: ["turkey", "turquie", "turkiye"], cities: ["istanbul", "ankara", "izmir"], search: "Turkey" },
  { code: "JP", flag: "🇯🇵", fr: "Japon", en: "Japan", aliases: ["japan", "japon"], cities: ["tokyo", "osaka"], search: "Japan" },
  { code: "KR", flag: "🇰🇷", fr: "Corée du Sud", en: "South Korea", aliases: ["korea", "coree"], cities: ["seoul"], search: "South Korea" },
  { code: "SG", flag: "🇸🇬", fr: "Singapour", en: "Singapore", aliases: ["singapore", "singapour"], cities: [], search: "Singapore" },
  { code: "AU", flag: "🇦🇺", fr: "Australie", en: "Australia", aliases: ["australia", "australie"], cities: ["sydney", "melbourne"], search: "Australia" },
];

export const REMOTE_CODE = "REMOTE";
export const TN_CITIES = ["Tunis", "Lac 1 / Lac 2", "Ariana", "La Marsa", "Ben Arous", "Sfax", "Sousse", "Monastir", "Nabeul", "Hammamet", "Bizerte", "Gabès", "Kairouan", "Gafsa", "Enfidha"];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code) ?? null;
export const countryName = (code: string, locale: "fr" | "en") => (code === REMOTE_CODE ? (locale === "fr" ? "Télétravail" : "Remote") : (countryByCode(code)?.[locale] ?? code));

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Best-guess ISO code for a free-text location ("Lac 2, Tunis" → "TN"), null if unknown. */
/** `a` as a whole word in `l` (both folded): "uk" is not in "ukraine", "usa" not in "busan". */
const word = (l: string, a: string) => new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(l);

export function countryOf(location: string): string | null {
  const l = fold(location);
  if (!l.trim()) return null;
  for (const c of COUNTRIES) if (c.aliases.some((a) => word(l, a))) return c.code;
  for (const c of COUNTRIES) if (c.cities.some((a) => word(l, a))) return c.code;
  const remote = /\b(remote|teletravail|télétravail|a distance|anywhere|worldwide)\b/.test(l);
  // "Remote - US", "Remote (U.S. only)": a remote job restricted to the US, not worldwide.
  if (remote && /(^|[^a-z])(us|u\.s\.a?\.?)([^a-z]|$)/.test(l)) return "US";
  return remote ? REMOTE_CODE : null;
}

/**
 * Does an offer's place match one of the profile's target places ("Tunisie", "Remote", "Sfax")? Free text first,
 * then by country, since boards often drop the country ("Sfax" is in Tunisia).
 */
export function inTargetPlaces(location: string, targets: string[]): boolean {
  const l = fold(location);
  if (targets.some((t) => t.trim() && l.includes(fold(t.trim())))) return true;
  const code = countryOf(location);
  return !!code && code !== REMOTE_CODE && targets.some((t) => countryOf(t) === code);
}

/** Does an offer fit the user's chosen places? Unknown locations pass; remote passes when allowed. */
export function fitsPlaces(opts: { location: string; remote: boolean }, places: { countries: string[]; remote: "yes" | "only" | "no" }): boolean {
  if (!places.countries.length && places.remote !== "only") return true;
  if (places.remote === "only") return opts.remote || countryOf(opts.location) === REMOTE_CODE;
  const code = countryOf(opts.location);
  if (code === REMOTE_CODE || (opts.remote && !code)) return places.remote !== "no";
  if (!code) return true;
  return places.countries.includes(code) || (opts.remote && places.remote !== "no");
}

/** Free-text locations other features already read (recommendations, search links). */
export function placesToLocations(p: { countries: string[]; cities: string[]; remote: "yes" | "only" | "no" }): string[] {
  const out: string[] = [];
  for (const c of p.cities) out.push(c);
  for (const code of p.countries) {
    const c = countryByCode(code);
    if (c && !(code === "TN" && p.cities.length)) out.push(c.fr);
  }
  if (p.remote !== "no") out.push("Remote");
  return out;
}
