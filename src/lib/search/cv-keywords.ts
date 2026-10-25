// Search keywords read from the CV itself: the roles the candidate has held or claims (title line, headline,
// experience entries), strongest first, then the CV's most used skills. Pure.

interface RoleDef {
  /** The board query (boards phrase-match it; tiers.ts adds the FR/EN synonyms). */
  query: string;
  /** The role as a target role, for the profile. */
  label: string;
  re: RegExp;
}

// A role is a job title, never a tool: "Flutter" or "Power BI" in a skills list says nothing about the role.
const ROLES: RoleDef[] = [
  { query: "ui/ux designer", label: "UI/UX Designer", re: /\bui\s*[/&+-]?\s*ux\b|\bux\s*[/&+-]?\s*ui\b|\bux designer|\bui designer|designer (ui|ux)\b|user experience|exp[ée]rience utilisateur/i },
  { query: "product designer", label: "Product Designer", re: /product design/i },
  { query: "graphic designer", label: "Graphic Designer", re: /graphi(c|que)\b[^.\n]{0,24}design|designer graphique|graphiste|design graphique/i },
  { query: "motion designer", label: "Motion Designer", re: /motion\b[^.\n]{0,12}design/i },
  { query: "full stack", label: "Développeur Full Stack", re: /full[\s-]?stack/i },
  { query: "front-end", label: "Développeur Front-End", re: /front[\s-]?end/i },
  { query: "back-end", label: "Développeur Back-End", re: /back[\s-]?end/i },
  { query: "développeur mobile", label: "Développeur Mobile", re: /d[ée]veloppeu(r|se)[^.\n]{0,20}mobile|mobile developer|mobile (app(lication)? )?develop|d[ée]veloppement (d'applications? )?mobile/i },
  { query: "développeur web", label: "Développeur Web", re: /d[ée]veloppeu(r|se) web|web developer|d[ée]veloppement web/i },
  { query: "data scientist", label: "Data Scientist", re: /data scien/i },
  { query: "data engineer", label: "Data Engineer", re: /data engineer|ing[ée]nieur (des )?donn[ée]es/i },
  { query: "data analyst", label: "Data Analyst", re: /data analy|analyste (de )?donn[ée]es|analyse de donn[ée]es/i },
  { query: "machine learning", label: "Ingénieur Machine Learning", re: /machine learning|deep learning|\bml engineer|intelligence artificielle/i },
  { query: "devops", label: "Ingénieur DevOps", re: /devops/i },
  { query: "cybersécurité", label: "Ingénieur Cybersécurité", re: /cyber|s[ée]curit[ée] (informatique|des syst)|pentest|\bsoc\b/i },
  { query: "réseaux", label: "Ingénieur Réseaux", re: /r[ée]seaux? (et|&) t[ée]l[ée]com|network engineer|ing[ée]nieur r[ée]seau|\bccna\b/i },
  { query: "embarqué", label: "Ingénieur Systèmes Embarqués", re: /embarqu[ée]|embedded|firmware/i },
  { query: "qa", label: "Ingénieur QA / Test", re: /\bqa\b|quality assurance|testeur|test automation|automatisation des tests/i },
  { query: "business developer", label: "Business Developer", re: /business develop|sales development|d[ée]veloppement commercial/i },
  { query: "marketing digital", label: "Marketing Digital", re: /marketing (digital|num[ée]rique)|digital marketing|growth/i },
  { query: "chef de projet", label: "Chef de Projet", re: /chef de projet|project manager|product owner|scrum master/i },
  { query: "software engineer", label: "Ingénieur Logiciel", re: /software engineer|ing[ée]nieur logiciel|d[ée]veloppeu(r|se) logiciel|g[ée]nie logiciel/i },
];

/** Tools nearly every CV lists: as board queries they match any job. */
export const EVERYDAY_TOOLS: ReadonlySet<string> = new Set(["git", "github", "gitlab", "jira", "trello", "notion", "slack", "office", "microsoft office", "word", "excel", "powerpoint", "windows", "linux", "vs code", "vscode", "google workspace"]);

export interface CvKeywords {
  /** Board queries, at most 6: roles first, then skills. */
  keywords: string[];
  /** Target roles for the profile, strongest first. */
  roles: string[];
}

/**
 * Roles score by where they appear: the title lines (name block, headline) count 5, experience entry lines 3,
 * any other line 1. A role must score at least 2 so one passing mention ("notions de DevOps") is not a target.
 */
export function cvKeywords(cvText: string, headline = "", skills: string[] = []): CvKeywords {
  const lines = (headline ? [headline] : []).concat(cvText.split(/\r?\n/));
  const score = new Map<RoleDef, number>();
  let inEntries = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/[*_#>`]/g, " ").trim();
    if (!line) return;
    // Sections are # / ## headings; ### lines are entries inside them.
    if (/^#{1,2}\s/.test(raw.trim())) inEntries = /exp[ée]rience|stages?\b|internship|emploi|employment|projets?|projects?/i.test(raw);
    // A list ("Figma, React, Flutter, …") or a sentence only mentions things: weight 1 wherever it sits.
    const mention = (line.match(/,/g) ?? []).length >= 3 || line.length > 90;
    const isTitle = !mention && i < (headline ? 5 : 4);
    // An entry line names the employer and the role ("**Vermeg** · Stagiaire développeuse"), not a bullet.
    const isEntry = !mention && inEntries && !/^\s*[-•*]\s/.test(raw);
    const w = isTitle ? 5 : isEntry ? 3 : 1;
    const hit = ROLES.filter((r) => r.re.test(line));
    for (const r of hit) score.set(r, (score.get(r) ?? 0) + w);
  });
  const ranked = [...score.entries()].filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 4);
  const taken = new Set(ranked.flatMap((r) => r.query.toLowerCase().split(/[\s/-]+/)));
  // "c" or "r" as a board query matches everything, so do everyday tools; skills a role already says add nothing.
  const extra = skills.filter((s) => s.length >= 2 && !taken.has(s.toLowerCase()) && !EVERYDAY_TOOLS.has(s.toLowerCase()));
  const keywords = [...new Set([...ranked.map((r) => r.query), ...extra.map((s) => s.toLowerCase())])].slice(0, 6);
  return { keywords, roles: ranked.map((r) => r.label) };
}
