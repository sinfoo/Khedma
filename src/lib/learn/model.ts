// Learn: courses from open catalogs and a directory of providers. Pure and client-safe (no db, no fetch).

/** What a course costs to follow. "freemium": free to follow or audit, the certificate is paid. */
export const PRICE_KINDS = ["free", "freemium", "paid", "coupon"] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

/** What a learner gets at the end. "credit": university credit (ECTS). "proctored": a supervised exam. */
export const CERT_KINDS = ["none", "completion", "paid", "proctored", "credit"] as const;
export type CertKind = (typeof CERT_KINDS)[number];

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type CourseLevel = (typeof LEVELS)[number];

export interface Course {
  id: number;
  source: string;
  title: string;
  url: string;
  /** Who teaches it: the university, company or platform. */
  provider: string;
  description: string;
  fields: FieldKey[];
  skills: string[];
  level: CourseLevel | null;
  duration_min: number | null;
  /** ISO 639-1 codes ("en", "fr"). */
  languages: string[];
  price: PriceKind;
  cert: CertKind;
  image: string | null;
  updated_at: string | null;
  /** Coupons only: when the free offer is assumed gone. */
  expires_at: string | null;
}

export type NewCourse = Omit<Course, "id">;

// ---------- fields: every kind of thing a student may want to learn ----------
// Keywords are matched on folded text (lowercase, no accents) as whole words or word starts.
export const FIELDS = {
  languages: ["english", "anglais", "french", "francais", "german", "allemand", "deutsch", "spanish", "espagnol", "italian", "italien", "arabic", "arabe", "chinese", "chinois", "mandarin", "japanese", "japonais", "korean", "coreen", "turkish", "turc", "portuguese", "portugais", "russian", "russe", "ielts", "toefl", "toeic", "delf", "dalf", "goethe", "grammar", "grammaire", "vocabulary", "vocabulaire", "pronunciation", "language learning", "langue etrangere", "fle"],
  programming: ["programming", "programmation", "python", "java", "javascript", "typescript", "c++", "c#", "golang", "rust", "kotlin", "swift", "algorithm", "algorithmique", "data structure", "structures de donnees", "coding", "software engineering", "genie logiciel", "object-oriented", "oop", "git", "functional programming", "compiler"],
  web: ["web development", "developpement web", "html", "css", "react", "angular", "vue", "node.js", "nodejs", "front-end", "frontend", "back-end", "backend", "full stack", "fullstack", "django", "flask", "spring", "laravel", "php", "next.js", "web design", "api"],
  mobile: ["android", "ios", "flutter", "react native", "mobile app", "application mobile", "swiftui", "jetpack compose"],
  data: ["data analysis", "analyse de donnees", "data science", "science des donnees", "sql", "excel", "power bi", "tableau", "statistics", "statistiques", "pandas", "data visualization", "visualisation", "big data", "spark", "data engineering", "databases", "bases de donnees", "analytics"],
  ai: ["machine learning", "apprentissage automatique", "deep learning", "apprentissage profond", "artificial intelligence", "intelligence artificielle", "neural network", "reseaux de neurones", "nlp", "computer vision", "vision par ordinateur", "generative ai", "ia generative", "llm", "large language model", "transformers", "pytorch", "tensorflow", "reinforcement learning", "prompt engineering", "cuda", "gpu", "rag", "ai agents"],
  cloud: ["cloud", "aws", "azure", "google cloud", "gcp", "devops", "docker", "kubernetes", "terraform", "serverless", "ci/cd", "linux", "sysadmin", "site reliability"],
  security: ["cybersecurity", "cybersecurite", "security", "securite", "ethical hacking", "penetration testing", "pentest", "cryptography", "cryptographie", "forensics", "soc", "malware", "network security", "zero trust"],
  networking: ["networking", "reseaux", "network", "ccna", "tcp/ip", "routing", "routage", "switching", "wireless", "5g", "telecommunications", "telecom", "iot", "internet of things"],
  design: ["graphic design", "design graphique", "photoshop", "illustrator", "indesign", "canva", "typography", "typographie", "branding", "logo", "visual design", "color theory", "motion design", "after effects", "video editing", "montage video", "photography", "photographie", "drawing", "dessin"],
  ux: ["ux", "ui", "user experience", "experience utilisateur", "user interface", "interface utilisateur", "figma", "prototyping", "prototypage", "usability", "design thinking", "interaction design", "accessibility", "accessibilite"],
  gamedev: ["game development", "developpement de jeux", "game design", "unity", "unreal", "godot", "3d", "blender", "modeling", "modelisation", "animation", "maya", "game engine", "shader", "virtual reality", "realite virtuelle", "augmented reality"],
  business: ["business", "management", "gestion", "marketing", "digital marketing", "marketing digital", "seo", "sales", "vente", "entrepreneurship", "entrepreneuriat", "startup", "project management", "gestion de projet", "agile", "scrum", "product management", "strategy", "strategie", "leadership", "human resources", "ressources humaines", "supply chain", "logistique", "e-commerce"],
  finance: ["finance", "accounting", "comptabilite", "economics", "economie", "investment", "investissement", "banking", "banque", "fintech", "financial", "audit", "taxation", "fiscalite"],
  engineering: ["mechanical", "mecanique", "electrical", "electrique", "electronics", "electronique", "civil engineering", "genie civil", "embedded", "embarque", "robotics", "robotique", "autocad", "solidworks", "catia", "matlab", "simulink", "control systems", "automatique", "plc", "automate", "manufacturing", "fabrication", "energy", "energie", "renewable", "materials", "materiaux", "thermodynamics", "thermodynamique", "signal processing", "traitement du signal", "fpga", "vhdl", "arduino", "industry 4.0"],
  science: ["mathematics", "mathematiques", "maths", "calculus", "algebra", "algebre", "linear algebra", "probability", "probabilites", "physics", "physique", "chemistry", "chimie", "biology", "biologie", "quantum", "quantique", "optimization", "optimisation", "numerical methods", "analyse numerique", "health", "sante", "medicine", "medecine", "climate", "climat", "environment", "environnement"],
  soft: ["communication", "public speaking", "prise de parole", "writing", "redaction", "negotiation", "negociation", "teamwork", "travail en equipe", "time management", "gestion du temps", "critical thinking", "esprit critique", "interview", "entretien", "career", "carriere", "resume", "cv", "productivity", "productivite", "emotional intelligence", "creativity", "creativite", "personal development", "developpement personnel"],
} as const;
export type FieldKey = keyof typeof FIELDS;
export const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FIELD_RE = FIELD_KEYS.map((k) => [k, new RegExp(`(^|[^a-z0-9])(${FIELDS[k].map(esc).join("|")})(?![a-z0-9])`)] as const);

/** Fields a course belongs to, from its title (weighted) and description. The title alone decides when it matches. */
export function classifyFields(title: string, description = ""): FieldKey[] {
  const t = fold(title);
  const fromTitle = FIELD_RE.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (fromTitle.length) return fromTitle.slice(0, 3);
  const d = fold(description.slice(0, 600));
  return FIELD_RE.filter(([, re]) => re.test(d)).map(([k]) => k).slice(0, 2);
}

/** "2 hours 30 minutes", "1h30", "6 semaines", "24 heures", "90 min" -> minutes; weeks count 3 h each. */
export function parseDuration(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = fold(s);
  let min = 0;
  const num = (re: RegExp) => Number(re.exec(t)?.[1]?.replace(",", ".") ?? 0);
  min += num(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hours?|heures?|hrs?)/) * 60;
  min += num(/(\d+)\s*(?:min|minutes?)/);
  if (!min) min += num(/(\d+(?:[.,]\d+)?)\s*(?:weeks?|semaines?)/) * 180;
  if (!min) min += num(/(\d+(?:[.,]\d+)?)\s*(?:months?|mois)/) * 720;
  return min ? Math.round(min) : null;
}

/**
 * A course's search text for the database's LIKE search: accent-free words, each preceded by a space, so a query
 * word matches the start of a word (" unity" finds Unity, not "community").
 */
export const courseHaystack = (c: Pick<NewCourse, "title" | "provider" | "description" | "skills">) =>
  ` ${fold(`${c.title} ${c.provider} ${c.skills.join(" ")} ${c.description.slice(0, 400)}`).replace(/[^a-z0-9+#]+/g, " ").trim()} `;
/** LIKE pattern for one search word: a word start, or the whole word for 3 letters or fewer ("ai" is not "aid"). */
export const wordPattern = (w: string) => (w.length <= 3 ? `% ${w} %` : `% ${w}%`);
/** A query word in the same form as the haystack ("C++" stays "c++", "node.js" becomes "node js"). */
export const searchWords = (q: string) => fold(q).replace(/[^a-z0-9+#]+/g, " ").split(" ").filter((w) => w.length >= 2 || /[+#]/.test(w));
