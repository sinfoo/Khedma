// Company name normalisation: "VERMEG Tunisie SARL" and "Vermeg" are the same employer.

const NOISE =
  /\b(sarl|suarl|sa|sas|sasu|sprl|inc|ltd|llc|plc|gmbh|ag|corp|corporation|co|company|group|groupe|holding|tunisie|tunisia|tn|international|intl|ltée|ltee)\b/g;

/** Known Tunisian / French employers that appear under several names. normalized -> canonical key. */
const ALIASES: Record<string, string> = {
  "vermeg tunisie": "vermeg",
  "vermeg solutions": "vermeg",
  "telnet holding": "telnet",
  "telnet technologies": "telnet",
  "sofrecom tunisie": "sofrecom",
  "sofrecom services": "sofrecom",
  "proxym it": "proxym",
  "proxym group": "proxym",
  "actia engineering services": "actia",
  "actia es": "actia",
  "focus corporation": "focus",
  "ooredoo tunisie": "ooredoo",
  "orange tunisie": "orange",
  "tunisie telecom": "tunisie telecom",
  "telecom tunisie": "tunisie telecom",
  "capgemini engineering": "capgemini",
  "sopra hr software": "sopra steria",
  "sopra steria tunisie": "sopra steria",
  "cgi tunisie": "cgi",
  "linedata tunisie": "linedata",
  "ebsys ltd": "ebsys",
  "st microelectronics": "stmicroelectronics",
  "stm": "stmicroelectronics",
  "expensya tunisie": "expensya",
  "instadeep ltd": "instadeep",
  "wevioo group": "wevioo",
  "talan tunisie": "talan",
  "bfi group": "bfi",
  "medianet tunisie": "medianet",
  "bee solutions": "bee",
  "satoripop tunisie": "satoripop",
  "clevory": "clevory training",
};

/** Preferred display spelling for canonical keys. */
const DISPLAY: Record<string, string> = {
  vermeg: "VERMEG",
  telnet: "Telnet Holding",
  sofrecom: "Sofrecom",
  proxym: "Proxym",
  actia: "ACTIA Engineering Services",
  focus: "Focus Corporation",
  ooredoo: "Ooredoo",
  orange: "Orange Tunisie",
  "tunisie telecom": "Tunisie Telecom",
  capgemini: "Capgemini",
  "sopra steria": "Sopra Steria",
  cgi: "CGI",
  linedata: "Linedata",
  ebsys: "eBSYS",
  stmicroelectronics: "STMicroelectronics",
  expensya: "Expensya",
  instadeep: "InstaDeep",
  wevioo: "Wevioo",
  talan: "Talan",
  bfi: "BFI",
  medianet: "Medianet",
  satoripop: "Satoripop",
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Canonical lowercase key for grouping. "" for empty/noise-only names. */
export function normalizeCompany(name: string): string {
  const base = strip(name);
  if (ALIASES[base]) return ALIASES[base];
  const key = base.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  return ALIASES[key] ?? key;
}

/** URL-safe slug derived from the canonical key. */
export function companySlug(name: string): string {
  return normalizeCompany(name).replace(/\s+/g, "-").slice(0, 80);
}

/** Nicest display spelling: alias table first, else the name as written (trimmed). */
export function canonicalName(name: string): string {
  return DISPLAY[normalizeCompany(name)] ?? name.trim().replace(/\s+/g, " ");
}
