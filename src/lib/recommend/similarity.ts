// FR/EN text similarity without a model: accent folding, light stemming, a synonym map and TF-IDF cosine.
// Pure and deterministic; used by the recommendation engine and tested directly.

const SYNONYMS: [string, string[]][] = [
  ["dev", ["developpeur", "developpeuse", "developer", "developpement", "development", "programmeur", "programmer", "codeur", "coder"]],
  ["engineer", ["ingenieur", "ingenieure", "engineering", "ingenierie", "ing"]],
  ["internship", ["stage", "stagiaire", "intern", "interne", "internships"]],
  ["pfe", ["pfe", "graduation", "final-year", "fin-etudes", "projet-fin"]],
  ["data", ["donnees", "donnee", "dataset", "datasets"]],
  ["software", ["logiciel", "logiciels", "logicielle"]],
  ["backend", ["back-end", "back", "serveur", "server-side"]],
  ["frontend", ["front-end", "front", "ui", "interface"]],
  ["fullstack", ["full-stack", "full"]],
  ["mobile", ["android", "ios", "smartphone", "application-mobile"]],
  ["ml", ["machine-learning", "apprentissage-automatique", "apprentissage", "ia", "ai", "intelligence-artificielle", "artificial-intelligence"]],
  ["embedded", ["embarque", "embarques", "embarquee", "firmware", "microcontroleur", "microcontroller"]],
  ["network", ["reseau", "reseaux", "networking", "networks"]],
  ["security", ["securite", "cybersecurite", "cybersecurity", "secure", "infosec"]],
  ["cloud", ["aws", "azure", "gcp", "nuage"]],
  ["devops", ["sre", "ci-cd", "cicd", "deploiement", "deployment"]],
  ["telecom", ["telecommunication", "telecommunications", "telecoms", "telephonie", "5g", "lte"]],
  ["electrical", ["electrique", "electricite", "electronique", "electronics", "electronic", "electrotechnique"]],
  ["mechanical", ["mecanique", "mechanics", "mecatronique", "mechatronics"]],
  ["industrial", ["industriel", "industrielle", "production", "manufacturing", "usine", "lean", "supply-chain", "logistique", "logistics"]],
  ["civil", ["genie-civil", "batiment", "construction", "structure", "structures", "btp"]],
  ["business", ["gestion", "management", "commerce", "marketing", "finance", "consulting", "conseil", "erp"]],
  ["db", ["database", "databases", "base-de-donnees", "bdd", "sql", "nosql"]],
  ["test", ["testing", "qa", "qualite", "quality", "tests"]],
  ["remote", ["teletravail", "a-distance", "hybride", "hybrid"]],
  ["junior", ["debutant", "debutante", "entry-level", "jeune-diplome", "graduate"]],
  ["project", ["projet", "projets", "projects"]],
  ["team", ["equipe", "equipes", "teams"]],
  ["skills", ["competences", "competence", "skill", "stack", "technologies", "technologie"]],
  ["experience", ["experiences", "exp"]],
];

const SYN = new Map<string, string>();
for (const [canon, alts] of SYNONYMS) {
  SYN.set(canon, canon); // canonical words skip stemming so "engineer" ≡ "ingénieur"
  for (const a of alts) SYN.set(a, canon);
}

const STOP = new Set(
  (
    "le la les de des du un une et ou en au aux pour par sur dans avec sans sous est sont etre ete avoir que qui quoi dont ce cette ces son sa ses leur leurs nous vous ils elles il elle on ne pas plus tres bien chez vers afin ainsi aussi tout tous toute toutes notre votre nos vos mais donc or ni car comme si " +
    "the a an and or of to in on for with without at by from is are was were be been being have has had do does did will would can could should may might this that these those it its we you they them our your their as not no yes than then there here into over under about also very more most such which who whom what when where how"
  ).split(" "),
);

/** Lowercase, strip accents, keep letters/digits/+#. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Stemming-lite: drop common FR/EN inflections (plural, feminine, -ment/-tion/-ing families). */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  let s = w;
  s = s.replace(/(issements|issement|ements|ement|ations|ation|isation|euses|euse|eurs|eur|ings|ing|ies|ers|er|es|s|e)$/, (m) => {
    // keep short stems meaningful ("spring" stays "spring", not "spr")
    return w.length - m.length >= 4 ? "" : m;
  });
  return s;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of fold(text).split(/[^a-z0-9+#.-]+/)) {
    const w = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (!w || w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const syn = SYN.get(w);
    if (syn) {
      out.push(syn);
      continue;
    }
    const st = stem(w);
    out.push(SYN.get(st) ?? st);
  }
  return out;
}

export type Vector = Map<string, number>;

export function termFreq(tokens: string[]): Vector {
  const v: Vector = new Map();
  for (const t of tokens) v.set(t, (v.get(t) ?? 0) + 1);
  // sublinear tf
  for (const [k, n] of v) v.set(k, 1 + Math.log(n));
  return v;
}

/** Inverse document frequency over a corpus of token lists (smoothed). */
export function idf(corpus: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of corpus) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = corpus.length || 1;
  const out = new Map<string, number>();
  for (const [t, d] of df) out.set(t, Math.log((n + 1) / (d + 1)) + 1);
  return out;
}

export function tfidf(tokens: string[], weights?: Map<string, number>): Vector {
  const v = termFreq(tokens);
  if (weights) for (const [k, n] of v) v.set(k, n * (weights.get(k) ?? 1));
  return v;
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Cosine similarity of two texts (0..1), synonyms folded so "développeur stage" ≈ "developer internship". */
export function similarity(a: string, b: string): number {
  return cosine(termFreq(tokenize(a)), termFreq(tokenize(b)));
}

/** Most frequent meaningful tokens of a text (canonical forms), highest first. */
export function topKeywords(text: string, n = 10): string[] {
  const v = new Map<string, number>();
  for (const t of tokenize(text)) if (t.length > 2) v.set(t, (v.get(t) ?? 0) + 1);
  return [...v.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
}
