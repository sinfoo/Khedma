// Offline, deterministic fallbacks. No network, no randomness.
import type { Evaluation, InterviewPrep, Job, Locale, Profile, SkillGap, UpskillPlan } from "../types";

// ---------- skills ----------
// "Canonical|alias|alias". Aliases chosen to avoid plain English/French words
// (no bare "Go", "Spring", "Express", "REST", "Vite", "Shell").
const SKILLS = [
  // languages
  "Python", "Java", "C++|CPP", "C#|C sharp", "C", "JavaScript|JS", "TypeScript|TS", "PHP", "Ruby", "Golang|Go lang",
  "Rust", "Kotlin", "Swift", "Scala", "MATLAB", "VHDL", "Verilog", "Assembly language|Assembleur|ASM",
  "Bash|Shell scripting|scripts shell", "PowerShell", "Dart", "Perl", "Lua", "SQL", "PL/SQL", "Fortran", "Julia", "Haskell",
  "Objective-C", "Solidity",
  // web
  "HTML", "CSS", "Sass|SCSS", "Tailwind|TailwindCSS|Tailwind CSS", "Bootstrap", "React|React.js|ReactJS", "Next.js|NextJS",
  "Vue|Vue.js|VueJS", "Nuxt|Nuxt.js", "Angular|AngularJS", "Svelte", "Redux", "jQuery", "Webpack",
  "REST API|RESTful|API REST|APIs REST|REST APIs", "GraphQL", "WebSocket|WebSockets", "OAuth", "JWT",
  // backend
  "Node.js|NodeJS|Node JS", "Express.js|ExpressJS", "NestJS|Nest.js", "Django", "Flask", "FastAPI",
  "Spring Boot|Spring Framework|Spring MVC", "Hibernate", ".NET|dotnet|.NET Core", "ASP.NET", "Laravel", "Symfony",
  "Ruby on Rails|Rails", "gRPC", "Microservices|Micro-services", "Kafka|Apache Kafka", "RabbitMQ",
  // mobile
  "Android", "iOS", "Flutter", "React Native", "SwiftUI", "Jetpack Compose", "Xamarin", "Ionic",
  // databases
  "MySQL", "PostgreSQL|Postgres", "SQLite", "MongoDB|Mongo", "Redis", "Oracle|Oracle Database|Oracle DB",
  "SQL Server|MSSQL", "Elasticsearch", "Cassandra", "DynamoDB", "Firebase", "Neo4j", "NoSQL", "MariaDB", "Supabase",
  // cloud / devops
  "AWS|Amazon Web Services", "Azure|Microsoft Azure", "GCP|Google Cloud", "Docker", "Kubernetes|k8s", "Terraform",
  "Ansible", "Jenkins", "GitLab CI|GitLab", "GitHub Actions", "CI/CD", "Linux", "Nginx", "Prometheus", "Grafana", "Helm",
  "Serverless", "OpenShift", "DevOps", "SRE",
  // tools
  "Git", "GitHub", "Jira", "Confluence", "Postman", "Figma", "Maven", "Gradle", "npm", "Jupyter", "Excel|Microsoft Excel",
  "Power BI", "Tableau", "SAP", "Unity|Unity3D", "Unreal Engine", "AutoCAD", "SolidWorks", "CATIA", "LabVIEW", "Simulink",
  // data / ML
  "Machine Learning|apprentissage automatique", "Deep Learning|apprentissage profond",
  "NLP|Natural Language Processing|traitement du langage naturel", "Computer Vision|vision par ordinateur", "TensorFlow",
  "PyTorch", "Keras", "scikit-learn|sklearn", "Pandas", "NumPy", "OpenCV", "Apache Spark|PySpark|Spark SQL", "Hadoop",
  "Airflow", "dbt", "Data Science|science des données", "Data Engineering", "Big Data", "ETL", "LLM|LLMs",
  "Generative AI|GenAI|IA générative", "Hugging Face", "MLOps", "Statistics|statistiques",
  "Data Analysis|analyse de données|analyse des données", "Reinforcement Learning",
  // embedded
  "Embedded Systems|systèmes embarqués|embedded", "Embedded C", "RTOS|FreeRTOS", "Arduino", "Raspberry Pi", "STM32",
  "ARM Cortex|Cortex-M", "FPGA", "PCB|PCB design", "Microcontrollers|microcontrôleurs|microcontroller|microcontrôleur",
  "IoT|Internet of Things|objets connectés", "CAN bus|bus CAN", "I2C", "SPI", "UART", "Signal Processing|traitement du signal",
  "Control Systems|automatique industrielle|asservissement|systèmes de contrôle", "PLC|automate programmable|automates programmables",
  "Robotics|robotique", "ROS|ROS2|ROS 2", "Qt", "Yocto", "Embedded Linux|Linux embarqué", "Firmware", "Bluetooth|BLE",
  "Zigbee", "LoRa|LoRaWAN", "MQTT",
  // networking / security
  "TCP/IP", "Networking|réseaux informatiques|administration réseau", "Cisco|CCNA", "VPN", "Firewall|pare-feu",
  "Cybersecurity|cybersécurité|sécurité informatique", "Penetration Testing|pentest", "Cryptography|cryptographie",
  "Wireshark", "OSPF", "BGP", "VoIP", "5G", "LTE", "SDN", "Active Directory", "Windows Server", "VMware",
  "Virtualization|virtualisation",
  // methodologies / soft skills
  "Agile|Agilité", "Scrum", "Kanban", "TDD", "Clean Code", "Design Patterns", "UML", "OOP|POO|Object-Oriented|orienté objet",
  "Project Management|gestion de projet", "Teamwork|travail d'équipe|esprit d'équipe", "Communication",
  "Problem Solving|résolution de problèmes", "Autonomy|autonomie", "Leadership", "Rigor|rigueur",
  "Adaptability|adaptabilité", "Curiosity|curiosité", "English|anglais", "French|français", "German|allemand",
  "Arabic|arabe", "Technical Writing|rédaction technique", "Time Management|gestion du temps",
  "Critical Thinking|esprit critique", "Creativity|créativité", "Lean Manufacturing|Lean Six Sigma|Six Sigma",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// Boundaries that tolerate symbols: "C" must not match inside "C++", ".NET" may start with a dot.
const SKILL_RE: { name: string; re: RegExp }[] = SKILLS.map((entry) => {
  const alts = entry.split("|");
  return {
    name: alts[0],
    re: new RegExp(`(?<![\\p{L}\\p{N}+#.])(?:${alts.map(esc).join("|")})(?![\\p{L}\\p{N}+#])`, "iu"),
  };
});

/** Canonical skill names found in text, ordered by first occurrence. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  return SKILL_RE.map((s) => ({ name: s.name, at: text.search(s.re) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.name);
}

// ---------- language ----------
// `\b` is ASCII-only: "à", "être" and "ingénieur" need Unicode letter edges.
const words = (list: string) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, "giu");
const FR_STOP = words("le|la|les|des|et|une|un|de|du|en|à|pour|dans|vous|nous|avec|sur|est|sont|au|aux|ou|chez|cette|notre|votre|être|stage|stagiaire|poste|ingénieur|candidature|entreprise|expérience|compétences");
const EN_STOP = words("the|and|you|with|for|our|are|will|that|this|from|have|we|your|to|of|in|is|be|internship|intern|engineer|role|team|skills|experience|requirements");

/** "fr" or "en" by common words; a tie (title-only text, "Full Stack Developer") returns `fallback`. */
export function detectLanguage(text: string, fallback: Locale = "en"): Locale {
  const fr = (text.match(FR_STOP) ?? []).length;
  const en = (text.match(EN_STOP) ?? []).length;
  return fr === en ? fallback : fr > en ? "fr" : "en";
}

/** Language a letter should be written in: the posting's, when there is enough text to tell. */
export function postingLocale(job: Pick<Job, "description">, fallback: Locale): Locale {
  return job.description.trim().length >= 200 ? detectLanguage(job.description) : fallback;
}

// ---------- shared helpers ----------
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.min(5, Math.max(1, n));
const score = (n: number) => round1(clamp(n));
const lower = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean));
const tokens = (s: string) =>
  s.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((t) => t.length > 2);

const jobText = (job: Job) => `${job.title}\n${job.tags.join(", ")}\n${job.description}`;

/** Profile skill set: declared skills (as written) plus anything recognised in them or the CV. */
function profileSkillSet(profile: Profile): Set<string> {
  return lower([...profile.skills, ...extractSkills(`${profile.skills.join(", ")}\n${profile.cv_md}`)]);
}

function splitSkills(job: Job, profile: Profile) {
  const have = profileSkillSet(profile);
  const jobSkills = extractSkills(jobText(job));
  const matched = jobSkills.filter((s) => have.has(s.toLowerCase()));
  const missing = jobSkills.filter((s) => !have.has(s.toLowerCase()));
  return { jobSkills, matched, missing };
}

export function verdictFor(global: number): Evaluation["verdict"] {
  return global >= 4.5 ? "apply_now" : global >= 4 ? "apply" : global >= 3.5 ? "maybe" : "skip";
}

const VERDICT_RANK: Record<Evaluation["verdict"], number> = { skip: 0, maybe: 1, apply: 2, apply_now: 3 };
/** The more cautious of two verdicts: a model may be stricter than its own score, never kinder. */
export function cautiousVerdict(a: Evaluation["verdict"], b: Evaluation["verdict"]): Evaluation["verdict"] {
  return VERDICT_RANK[a] <= VERDICT_RANK[b] ? a : b;
}

const INTERNSHIP: Job["type"][] = ["stage", "pfe", "alternance"];

// ---------- evaluate ----------
export function heuristicEvaluate(job: Job, profile: Profile): Omit<Evaluation, "id" | "created_at" | "job_id"> {
  const text = jobText(job);
  const lc = text.toLowerCase();
  const lang = detectLanguage(job.description);
  const fr = lang === "fr";
  const { jobSkills, matched, missing } = splitSkills(job, profile);

  // match
  const ratio = jobSkills.length ? matched.length / jobSkills.length : 0.5;
  const match = score(1 + 4 * Math.min(1, ratio * 1.25));

  // target
  const titleTok = new Set(tokens(job.title));
  const roleScore = profile.target_roles.length
    ? Math.max(0, ...profile.target_roles.map((r) => {
        const t = tokens(r);
        return t.length ? t.filter((x) => titleTok.has(x)).length / t.length : 0;
      }))
    : 0.5;
  const typeOk = profile.target_types.length === 0 || profile.target_types.includes(job.type) ? 1 : 0;
  const loc = job.location.toLowerCase();
  const locOk =
    job.remote || profile.target_locations.length === 0 || profile.target_locations.some((l) => loc.includes(l.toLowerCase()))
      ? 1
      : 0;
  const target = score(1 + 4 * (0.5 * roleScore + 0.3 * typeOk + 0.2 * locOk));

  // growth
  const growthWords = [
    /mentor/, /formation/, /training/, /\blearn/, /apprendre|apprentissage/, /junior/, /encadr/, /\bpfe\b/,
    /\bstage\b|internship|\bintern\b/, /débutant|entry[- ]level|graduate|jeune diplômé/, /tutorat|tutor/,
  ];
  const seniorHit = /senior|lead\b|\b([5-9]|1\d)\s*\+?\s*(ans|années|years)/i.test(lc);
  const growth = score(3 + 0.5 * growthWords.filter((w) => w.test(lc)).length - (seniorHit ? 1.5 : 0));

  // culture
  let culture = 3;
  if (/remote|télétravail|hybride|hybrid|on[- ]site|présentiel/.test(lc)) culture += 0.5;
  if (/équipe de \d+|team of \d+/.test(lc)) culture += 0.3;
  if (/startup|start-up/.test(lc)) culture += 0.3;
  if (/agile|scrum/.test(lc)) culture += 0.3;
  if (/on[- ]call|astreinte/.test(lc)) culture -= 0.5;
  if (/pression|pressure|fast[- ]paced|rythme soutenu/.test(lc)) culture -= 0.5;

  // red flags
  const flags: string[] = [];
  let red = 5;
  const flag = (penalty: number, frMsg: string, enMsg: string) => {
    red -= penalty;
    flags.push(fr ? frMsg : enMsg);
  };
  if (/non[- ]rémunér|unpaid|sans rémunération|bénévol/.test(lc)) flag(1.5, "Stage non rémunéré", "Unpaid position");
  if (/\burgent\b|immédiat|\basap\b/.test(lc)) flag(0.5, "Recrutement « urgent »", "Marked as urgent hiring");
  if (!job.company.trim() || /confidential|confidentiel|anonyme|undisclosed|^n\/a$/i.test(job.company))
    flag(1, "Entreprise non identifiée", "Company not identified");
  if (INTERNSHIP.includes(job.type)) {
    const years = [...lc.matchAll(/(^|[^+\d])(\d{1,2})\s*\+?\s*(ans|années|years|yrs)\b/g)].map((m) => Number(m[2]));
    if (years.some((y) => y >= 3)) flag(1, "Exige 3+ ans d'expérience pour un stage", "Requires 3+ years of experience for an internship");
  }
  if (/frais (de |d')(dossier|inscription|candidature)|payer pour postuler|pay to apply|application fee|registration fee/.test(lc))
    flag(2, "Frais demandés au candidat", "Candidate asked to pay a fee");
  if (job.description.trim().length < 200) flag(1, "Description trop courte", "Description too short");
  if (/@(gmail|yahoo|hotmail|outlook)\./.test(lc)) flag(0.5, "Contact via adresse e-mail personnelle", "Contact through a personal email address");
  const red_flags = score(red);
  const cultureScore = score(culture);

  const global = score(0.35 * match + 0.25 * target + 0.15 * growth + 0.1 * cultureScore + 0.15 * red_flags);
  const verdict = verdictFor(global);

  const summary = fr
    ? `${matched.length}/${jobSkills.length} compétences demandées sont couvertes par votre profil (${matched.slice(0, 3).join(", ") || "aucune"}). ` +
      (flags.length ? `Points d'attention : ${flags.length}.` : "Aucun signal d'alerte détecté.")
    : `${matched.length}/${jobSkills.length} required skills are covered by your profile (${matched.slice(0, 3).join(", ") || "none"}). ` +
      (flags.length ? `Points of attention: ${flags.length}.` : "No red flags detected.");

  return {
    global,
    match,
    target,
    growth,
    culture: cultureScore,
    red_flags,
    strengths: matched.slice(0, 6),
    gaps: missing.slice(0, 6),
    flags,
    verdict,
    summary,
    engine: "heuristic",
  };
}

// ---------- tailored CV ----------
export function heuristicTailorCv(job: Job, profile: Profile, locale: Locale): string {
  const cv = profile.cv_md.trim();
  if (!cv) return "";
  const matched = splitSkills(job, profile).matched.slice(0, 5);
  const fr = locale === "fr";
  const skillsTxt = matched.length ? matched.join(", ") : fr ? "[compétences clés]" : "[key skills]";
  const summary = fr
    ? `## Profil\n\n${profile.headline ? profile.headline + ". " : ""}Compétences en lien avec le poste : ${skillsTxt}.\n`
    : `## Summary\n\n${profile.headline ? profile.headline + ". " : ""}Skills relevant to this role: ${skillsTxt}.\n`;

  // Split into "## " sections; keep the preamble (name / contact) first.
  const parts = cv.split(/^(?=## )/m);
  const preamble = parts[0].startsWith("## ") ? "" : parts.shift() ?? "";
  const i = parts.findIndex((s) => /^## .*(skills|compétences|competences|technolog|stack)/i.test(s) && matched.some((m) => s.toLowerCase().includes(m.toLowerCase())));
  if (i > 0) parts.unshift(...parts.splice(i, 1));
  return [preamble.trim(), summary.trim(), ...parts.map((p) => p.trim())].filter(Boolean).join("\n\n") + "\n";
}

// ---------- cover letter ----------
export function heuristicCoverLetter(job: Job, profile: Profile, locale: Locale): string {
  const matched = splitSkills(job, profile).matched.slice(0, 5);
  const name = profile.name || (locale === "fr" ? "[Prénom Nom]" : "[Full name]");
  const headline = profile.headline || (locale === "fr" ? "élève ingénieur à l'ENIT" : "engineering student at ENIT");
  const skills = matched.length ? matched.join(", ") : locale === "fr" ? "[compétences principales]" : "[main skills]";
  const type = job.type === "emploi" ? (locale === "fr" ? "poste" : "position") : job.type === "pfe" ? "PFE" : locale === "fr" ? "stage" : "internship";

  if (locale === "fr") {
    return `${name}
${profile.email || "[e-mail]"}

[Date]

${job.company}
${job.location || "[Adresse]"}

Objet : Candidature, ${job.title}

[Madame, Monsieur],

Actuellement ${headline}, je vous adresse ma candidature pour le ${type} de ${job.title} au sein de ${job.company}.

Votre offre a retenu mon attention car elle fait appel à des compétences que j'ai développées au cours de ma formation : ${skills}. [Une phrase sur un projet ou cours concret issu de votre CV.]

Rejoindre ${job.company} me permettrait de mettre ces compétences au service de vos projets tout en continuant à progresser dans un cadre professionnel exigeant. [Une phrase sur ce qui vous attire dans l'entreprise.]

Je me tiens à votre disposition pour un entretien afin de vous présenter plus en détail mon parcours et ma motivation.

Je vous prie d'agréer, [Madame, Monsieur], l'expression de mes salutations distinguées.

${name}
`;
  }
  return `${name}
${profile.email || "[email]"}

[Date]

${job.company}
${job.location || "[Address]"}

Subject: Application, ${job.title}

[Dear Hiring Team],

As a ${headline}, I am writing to apply for the ${job.title} ${type} at ${job.company}.

Your posting caught my attention because it calls for skills I have built during my studies: ${skills}. [One sentence about a concrete project or course from your CV.]

Joining ${job.company} would let me put these skills to work on your projects while continuing to grow in a demanding professional environment. [One sentence about what attracts you to the company.]

I would welcome the opportunity to discuss my background and motivation in an interview.

Yours sincerely,

${name}
`;
}

// ---------- interview prep ----------
/** Project-like headings and bullets from the CV, for STAR scaffolds. */
function cvProjectTitles(cv: string): string[] {
  const out: string[] = [];
  let inProjects = false;
  for (const line of cv.split("\n")) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      inProjects = /projet|project|exp[ée]rience|stage|internship/i.test(h2[1]);
      continue;
    }
    if (!inProjects) continue;
    const m = line.match(/^###\s+(.+)|^[-*]\s+\**([^*:–-]{4,80})/);
    const title = (m?.[1] ?? m?.[2])?.replace(/[*_`#]/g, "").trim();
    if (title) out.push(title.slice(0, 80));
  }
  return out;
}

export function heuristicInterviewPrep(job: Job, profile: Profile, locale: Locale): InterviewPrep {
  const fr = locale === "fr";
  const { jobSkills, matched } = splitSkills(job, profile);
  const top = jobSkills.slice(0, 5);

  const skillQ = top.map((s) =>
    fr
      ? { question: `Parlez-moi d'un projet où vous avez utilisé ${s}.`, why: `${s} figure dans l'offre.`, approach: "Choisissez un projet de votre CV, décrivez le contexte, votre rôle et le résultat concret." }
      : { question: `Tell me about a project where you used ${s}.`, why: `${s} is listed in the posting.`, approach: "Pick a project from your CV; describe the context, your role and the concrete outcome." },
  );
  const generic = fr
    ? [
        { question: "Présentez-vous en deux minutes.", why: "Question d'ouverture quasi systématique.", approach: "Formation, 1–2 projets marquants, pourquoi ce poste." },
        { question: `Pourquoi ${job.company} et pourquoi ce poste ?`, why: "Mesure votre motivation et votre préparation.", approach: "Citez un élément précis de l'offre ou de l'entreprise." },
        { question: "Décrivez un problème technique difficile et comment vous l'avez résolu.", why: "Évalue votre démarche de résolution de problèmes.", approach: "Méthode STAR : situation, tâche, action, résultat." },
        { question: "Comment travaillez-vous en équipe ?", why: "Travail collaboratif attendu.", approach: "Exemple concret de projet de groupe, votre rôle, un désaccord géré." },
        { question: "Quelles sont vos disponibilités et vos attentes ?", why: "Question logistique de fin d'entretien.", approach: "Dates précises, rester factuel." },
      ]
    : [
        { question: "Tell me about yourself in two minutes.", why: "Near-universal opening question.", approach: "Education, 1–2 standout projects, why this role." },
        { question: `Why ${job.company} and why this role?`, why: "Tests motivation and preparation.", approach: "Quote something specific from the posting or the company." },
        { question: "Describe a hard technical problem and how you solved it.", why: "Assesses your problem-solving process.", approach: "STAR: situation, task, action, result." },
        { question: "How do you work in a team?", why: "Collaboration is expected.", approach: "Concrete group project, your role, a disagreement you handled." },
        { question: "What is your availability and what are your expectations?", why: "Logistics question at the end.", approach: "Exact dates, stay factual." },
      ];
  const likely_questions = [...skillQ, ...generic].slice(0, 8);

  const titles = cvProjectTitles(profile.cv_md);
  const star_stories = [0, 1, 2].map((i) => ({
    title: titles[i] ?? (fr ? `[Projet ${i + 1}]` : `[Project ${i + 1}]`),
    situation: "",
    task: "",
    action: "",
    result: "",
  }));

  const pitch = fr
    ? `${profile.headline || "Élève ingénieur à l'ENIT"}, je postule au poste de ${job.title} chez ${job.company}. ${matched.length ? `Mes compétences en ${matched.slice(0, 3).join(", ")} correspondent directement aux besoins du poste.` : "[Une phrase reliant votre parcours au poste.]"}`
    : `${profile.headline || "Engineering student at ENIT"}, applying for the ${job.title} role at ${job.company}. ${matched.length ? `My skills in ${matched.slice(0, 3).join(", ")} map directly to the needs of the role.` : "[One sentence linking your background to the role.]"}`;

  const questions_to_ask = fr
    ? [
        "À quoi ressemble une semaine type sur ce poste ?",
        "Comment se passe l'encadrement et l'intégration des nouveaux arrivants ?",
        `Quels sont les principaux projets de l'équipe chez ${job.company} cette année ?`,
        "Quels outils et quelle organisation utilisez-vous au quotidien ?",
        "Quelles sont les prochaines étapes du processus de recrutement ?",
      ]
    : [
        "What does a typical week look like in this role?",
        "How are new joiners mentored and onboarded?",
        `What are the team's main projects at ${job.company} this year?`,
        "Which tools and ways of working do you use day to day?",
        "What are the next steps in the hiring process?",
      ];

  return { pitch, likely_questions, star_stories, questions_to_ask, engine: "heuristic" };
}

// ---------- skill gaps / upskill ----------
export function computeSkillGaps(jobs: (Job & { evaluation?: { global: number } | null })[], profile: Profile): SkillGap[] {
  const have = profileSkillSet(profile);
  const map = new Map<string, SkillGap>();
  for (const job of jobs) {
    // ponytail: unscored offers count as a middling fit (0.6); scored ones by their 1-5 score.
    const w = job.evaluation ? Math.min(1, Math.max(0.2, job.evaluation.global / 5)) : 0.6;
    for (const s of extractSkills(jobText(job))) {
      const g = map.get(s) ?? { skill: s, demand: 0, weight: 0, have: have.has(s.toLowerCase()), jobs: [] };
      g.demand++;
      g.weight += w;
      g.jobs.push(job.id);
      map.set(s, g);
    }
  }
  for (const g of map.values()) g.weight = Math.round(g.weight * 10) / 10;
  return [...map.values()].sort((a, b) => b.weight - a.weight || b.demand - a.demand || Number(a.have) - Number(b.have) || a.skill.localeCompare(b.skill));
}

// Official docs for common skills; everything else gets course-search links.
const DOCS: Record<string, string> = {
  python: "https://docs.python.org/3/tutorial/",
  javascript: "https://developer.mozilla.org/docs/Web/JavaScript",
  typescript: "https://www.typescriptlang.org/docs/",
  html: "https://developer.mozilla.org/docs/Web/HTML",
  css: "https://developer.mozilla.org/docs/Web/CSS",
  react: "https://react.dev/learn",
  "next.js": "https://nextjs.org/docs",
  vue: "https://vuejs.org/guide/",
  angular: "https://angular.dev/overview",
  "node.js": "https://nodejs.org/en/learn",
  java: "https://dev.java/learn/",
  "spring boot": "https://spring.io/guides",
  "c++": "https://en.cppreference.com/w/",
  "c#": "https://learn.microsoft.com/dotnet/csharp/",
  ".net": "https://learn.microsoft.com/dotnet/",
  golang: "https://go.dev/doc/",
  rust: "https://doc.rust-lang.org/book/",
  kotlin: "https://kotlinlang.org/docs/home.html",
  flutter: "https://docs.flutter.dev/",
  android: "https://developer.android.com/courses",
  sql: "https://www.postgresql.org/docs/current/tutorial.html",
  postgresql: "https://www.postgresql.org/docs/current/tutorial.html",
  mysql: "https://dev.mysql.com/doc/",
  mongodb: "https://www.mongodb.com/docs/manual/tutorial/getting-started/",
  redis: "https://redis.io/docs/latest/",
  docker: "https://docs.docker.com/get-started/",
  kubernetes: "https://kubernetes.io/docs/tutorials/",
  terraform: "https://developer.hashicorp.com/terraform/tutorials",
  ansible: "https://docs.ansible.com/",
  aws: "https://skillbuilder.aws/",
  azure: "https://learn.microsoft.com/training/azure/",
  gcp: "https://cloud.google.com/docs/get-started",
  linux: "https://linuxjourney.com/",
  git: "https://git-scm.com/book/en/v2",
  "ci/cd": "https://docs.gitlab.com/ee/ci/",
  devops: "https://roadmap.sh/devops",
  "machine learning": "https://scikit-learn.org/stable/user_guide.html",
  "deep learning": "https://www.deeplearningbook.org/",
  pytorch: "https://pytorch.org/tutorials/",
  tensorflow: "https://www.tensorflow.org/tutorials",
  pandas: "https://pandas.pydata.org/docs/user_guide/",
  numpy: "https://numpy.org/doc/stable/user/",
  "apache spark": "https://spark.apache.org/docs/latest/",
  django: "https://docs.djangoproject.com/en/stable/intro/tutorial01/",
  flask: "https://flask.palletsprojects.com/en/stable/tutorial/",
  fastapi: "https://fastapi.tiangolo.com/tutorial/",
  graphql: "https://graphql.org/learn/",
  "embedded systems": "https://roadmap.sh/embedded",
  stm32: "https://www.st.com/content/st_com/en/support/learning/stm32-education.html",
  arduino: "https://docs.arduino.cc/learn/",
  "raspberry pi": "https://www.raspberrypi.com/documentation/",
  matlab: "https://matlab.mathworks.com/",
  "tcp/ip": "https://developer.mozilla.org/docs/Web/HTTP/Overview",
  cybersecurity: "https://roadmap.sh/cyber-security",
  agile: "https://scrumguides.org/",
  scrum: "https://scrumguides.org/",
};

export function heuristicUpskillPlan(gaps: SkillGap[], locale: Locale): UpskillPlan {
  const fr = locale === "fr";
  const top = gaps.filter((g) => !g.have).slice(0, 6);
  const plan = top.map((g, i) => {
    const priority = (i < 2 ? 1 : i < 4 ? 2 : 3) as 1 | 2 | 3;
    const q = encodeURIComponent(g.skill);
    const official = DOCS[g.skill.toLowerCase()];
    const resources = [
      ...(official ? [{ title: fr ? "Documentation officielle" : "Official documentation", url: official }] : []),
      { title: "freeCodeCamp", url: `https://www.freecodecamp.org/news/search/?query=${q}` },
      { title: "Coursera", url: `https://www.coursera.org/search?query=${q}` },
      { title: "edX", url: `https://www.edx.org/search?q=${q}` },
    ].slice(0, 3);
    return {
      skill: g.skill,
      priority,
      why: fr
        ? `Demandé dans ${g.demand} offre${g.demand > 1 ? "s" : ""} ciblée${g.demand > 1 ? "s" : ""} et absent de votre profil.`
        : `Requested in ${g.demand} target job${g.demand > 1 ? "s" : ""} and missing from your profile.`,
      steps: fr
        ? [
            `Suivre le tutoriel officiel de ${g.skill} (2–4 h).`,
            `Réaliser un mini-projet qui utilise ${g.skill} et le publier sur GitHub.`,
            `Ajouter ${g.skill} à votre CV avec un lien vers ce projet.`,
          ]
        : [
            `Work through the official ${g.skill} tutorial (2–4 h).`,
            `Build a small project that uses ${g.skill} and publish it on GitHub.`,
            `Add ${g.skill} to your CV with a link to that project.`,
          ],
      resources,
    };
  });
  return { gaps, plan, engine: "heuristic", created_at: new Date().toISOString() };
}
