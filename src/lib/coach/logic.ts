// Pure coach logic: question selection, offline answer scoring, spaced repetition,
// story strength and report aggregation. No DB, no network: safe for tests and the client.
import type { BankQuestion, Lang, Level, QType, Track } from "./bank";
import { TRACKS } from "./bank";

export const KINDS = ["hr", "technical", "mixed"] as const;
export type Kind = (typeof KINDS)[number];
export const LENGTHS = [5, 8, 12] as const;
export const DIMS = ["structure", "relevance", "specificity", "communication"] as const;
export type Dim = (typeof DIMS)[number];
export type Scores = Record<Dim, number>;

/** A question as asked in a session, already resolved to the session language. */
export interface SessionQuestion {
  id: string;
  text: string;
  type: QType;
  hints: string[];
  source: "bank" | "posting";
}

// ---------- small helpers ----------
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp15 = (n: number) => round1(Math.min(5, Math.max(1, n)));
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const STOP = new Set(
  "the and you your with for are was were that this from have has had will would what when where which who how why about into than then them they their there our ours his her its not but can could should must just also very more most some such only over other each your le la les des une un pour dans vous nous avec sur est sont du au aux ou chez cette notre votre etre etes comme mais plus tres tout tous toute toutes faire fait leur leurs ses son sa qui que quoi quel quelle quels quelles dont donc car alors avez avons ont sans entre apres avant pendant depuis vers peut peux faut ainsi aussi bien cela ceci elle elles ils lui moi toi".split(
    " ",
  ),
);
/** Content words, accent-folded, 4+ letters, reduced to a 6-char stem so "conflits" ~ "conflit". */
export function stems(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, 6));
}

/** Deterministic PRNG for tests and reproducible shuffles. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- track inference ----------
const TRACK_HINTS: [Track, RegExp][] = [
  ["embedded", /embarqu|embedded|firmware|stm32|esp32|arduino|microcontr|rtos|iot|fpga|automobile|automotive|can bus|électronique|electronic/i],
  ["netsec", /réseau|network|cyber|sécurité|security|soc\b|pentest|firewall|pare-feu|cisco|ccna|telecom|télécom/i],
  ["data", /data|machine learning|deep learning|\bml\b|\bia\b|\bai\b|nlp|vision|données|analyst|scien/i],
  ["pfe", /\bpfe\b|projet de fin|final[- ]year|end[- ]of[- ]studies/i],
  ["stage", /stage d'été|summer|été|stage ouvrier|technicien/i],
];
/** Best generic track for a posting (title first, then description). */
export function inferTrack(title: string, description = "", type?: string): Track {
  for (const text of [title, description]) for (const [t, re] of TRACK_HINTS) if (re.test(text)) return t;
  if (type === "pfe") return "pfe";
  if (type === "stage") return "stage";
  return "junior";
}
export const isTrack = (x: unknown): x is Track => TRACKS.includes(x as Track);

// ---------- question selection ----------
const SOFT: QType[] = ["behavioral", "motivation", "situational", "culture"];

export interface SelectOpts {
  track: Track;
  kind: Kind;
  level: Level;
  count: number;
  /** Ids to avoid (asked recently). Used only while enough fresh questions remain. */
  exclude?: ReadonlySet<string>;
  rand?: () => number;
}

/**
 * Pick `count` distinct questions. Constraints are relaxed step by step when the pool is too small:
 * exact level → any level up to the chosen one → any level → any track (same types).
 * HR and mixed sessions open with the "tell me about yourself" question when it is available.
 */
export function selectQuestions(bank: readonly BankQuestion[], o: SelectOpts): BankQuestion[] {
  const rand = o.rand ?? Math.random;
  const want = Math.max(1, Math.min(30, Math.floor(o.count)));
  const nTech = o.kind === "technical" ? want : o.kind === "hr" ? 0 : Math.floor(want / 2);
  const picked: BankQuestion[] = [];
  const used = new Set<string>();

  const take = (types: QType[], n: number) => {
    const tiers: ((q: BankQuestion) => boolean)[] = [
      (q) => q.tracks.includes(o.track) && q.level === o.level,
      (q) => q.tracks.includes(o.track) && q.level <= o.level,
      (q) => q.tracks.includes(o.track),
      () => true,
    ];
    let got = 0;
    for (const avoidRecent of [true, false]) {
      for (const tier of tiers) {
        if (got >= n) return;
        const pool = shuffle(
          bank.filter((q) => types.includes(q.type) && !used.has(q.id) && tier(q) && !(avoidRecent && o.exclude?.has(q.id))),
          rand,
        );
        for (const q of pool) {
          if (got >= n) break;
          used.add(q.id);
          picked.push(q);
          got++;
        }
      }
    }
  };

  if (o.kind !== "technical") {
    const opener = bank.find((q) => q.id === "intro-pitch");
    if (opener) {
      used.add(opener.id);
      picked.push(opener);
    }
  }
  const nSoft = want - nTech - picked.length;
  // Interleave for mixed sessions: soft and technical alternate after the opener.
  const soft: BankQuestion[] = [];
  const tech: BankQuestion[] = [];
  const before = picked.length;
  take(SOFT, Math.max(0, nSoft));
  soft.push(...picked.splice(before));
  take(["technical"], nTech);
  tech.push(...picked.splice(before));
  while (soft.length || tech.length) {
    if (soft.length) picked.push(soft.shift()!);
    if (tech.length) picked.push(tech.shift()!);
  }
  return picked.slice(0, want);
}

export function toSessionQuestion(q: BankQuestion, lang: Lang): SessionQuestion {
  return { id: q.id, text: q[lang], type: q.type, hints: q.hints[lang], source: "bank" };
}

// ---------- offline answer scoring ----------
export type TipCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "add_situation"
  | "add_task"
  | "add_action"
  | "add_result"
  | "use_i"
  | "add_numbers"
  | "fillers"
  | "hedging"
  | "long_sentences"
  | "add_example"
  | "add_tradeoff"
  | "add_definition"
  | "cover_hint"
  | "link_posting"
  | "add_steps";
export interface Tip {
  code: TipCode;
  detail?: string;
}

export interface AnswerSignals {
  words: number;
  sentences: number;
  star: { s: boolean; t: boolean; a: boolean; r: boolean };
  numbers: number;
  skills: string[];
  actionVerbs: number;
  iCount: number;
  weCount: number;
  fillers: string[];
  hedges: number;
  covered: string[];
  missed: string[];
  postingHits: string[];
}

export interface AnswerScore {
  scores: Scores;
  overall: number;
  signals: AnswerSignals;
  tips: Tip[];
}

const RE = {
  s: /\b(situation|contexte?|context|lors d[eu']|pendant (?:mon|ma|mes|notre|le|la)|quand j['’]?(?:étais|etais)|when i was|while i was|during (?:my|our|a|the)|at (?:my|the) (?:internship|company|school|university)|en (?:première|deuxième|troisième|1re|2e|3e) année|in my (?:first|second|third|final) year|dans le cadre|as part of|l['’]année dernière|last (?:year|summer)|à l['’]enit|at enit|club|hackathon|stage|internship|projet|project)\b/iu,
  t: /\b(tâche|tache|mission|objectif|but était|goal|task|my role|mon rôle|je devais|nous devions|j['’]avais pour|i had to|i needed to|i was (?:asked|responsible|in charge)|j['’]étais (?:chargé|responsable)|challenge|défi|il fallait|we had to|the aim|l['’]enjeu|problème|problem)\b/iu,
  r: /(\b(résultat|resultat|result|as a result|grâce à|grace a|ce qui a permis|permis de|abouti|outcome|impact|reduced|increased|improved|réduit|augmenté|amélioré|gagné|saved|économisé|validé|livré|delivered|finalement|au final|in the end|j['’]ai appris|i learned|i learnt|leçon|lesson|note de|grade|classé|ranked|won|gagné|accepted|adopté|adopted)\b|\d+\s?%)/iu,
  // "j'ai conçu", "je lui ai expliqué", "j'ai mis en place": first person + past participle
  actionFr: /(?<![\p{L}])j(?:['’]|e (?:lui |leur |les |l['’]))ai\s+(?:\p{L}+\s+)?\p{L}{3,}(?:é|i|u|is|it|ert)s?(?![\p{L}])/giu,
  actionEn:
    /\bi\s+(?:\w+\s+)?(designed|built|implemented|developed|set up|organized|organised|proposed|analyzed|analysed|tested|fixed|automated|created|optimized|negotiated|presented|deployed|wrote|coded|refactored|migrated|coordinated|trained|solved|measured|led|decided|contacted|identified|prioritized|planned|integrated|documented|learned|configured|programmed|launched|reduced|improved|simplified|explained|asked|split|wired|debugged|benchmarked|interviewed)\b/giu,
  iFr: /\b(je|j['’]|moi|mon|ma|mes)\b/giu,
  iEn: /\b(i|me|my|i['’]m|i['’]ve)\b/giu,
  weFr: /\b(on|nous|notre|nos)\b/giu,
  weEn: /\b(we|our|us|we['’]ve)\b/giu,
  number: /\b\d+(?:[.,]\d+)?\s?(?:%|k|dt|tnd|ms|s|h|mb|go|gb|x)?\b/giu,
  fillers: /\b(euh+|heu+|bah|ben|genre|en fait|du coup|voilà|tu vois|quoi\b|um+|uh+|erm|like,|you know|basically|actually|kind of|sort of|i mean)\b/giu,
  hedges: /\b(je pense que peut-être|peut-être|un peu|j['’]essaie|je crois|i guess|i think maybe|maybe|perhaps|probably|sort of|i hope)\b/giu,
  definition: /\b(c['’]est|désigne|consiste|signifie|permet de|is a|is an|means|refers to|is the|are the|est un|est une|sont des)\b/iu,
  example: /\b(par exemple|exemple|for example|for instance|e\.g\.|such as|comme|like when|imaginons|imagine|dans mon projet|in my project|j['’]ai utilisé|i used)\b/iu,
  tradeoff: /\b(mais|cependant|en revanche|par contre|inconvénient|avantage|compromis|alors que|tandis que|dépend|however|but|whereas|trade-?off|drawback|advantage|downside|on the other hand|depends|instead|plutôt que|rather than|versus|vs)\b/iu,
  steps: /\b(d['’]abord|premièrement|ensuite|puis|enfin|finalement|first|firstly|then|next|after that|finally|step|étape|1[.)]|2[.)])/giu,
};

const RANGES: Record<QType, [number, number]> = {
  behavioral: [80, 260],
  situational: [60, 220],
  technical: [40, 220],
  motivation: [50, 200],
  culture: [40, 180],
};

const count = (re: RegExp, s: string) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;

/**
 * Offline rubric. Each dimension is 1–5 from concrete text signals:
 * structure = STAR markers (behavioral) / definition-example-trade-off (technical) / ordered steps (situational);
 * relevance = coverage of the question's hint keywords and the posting's skills;
 * specificity = numbers, named tools, first-person action verbs; communication = length, fillers, hedging, sentence length.
 * ponytail: keyword heuristics, a local model scores better; this is the offline floor.
 */
export function scoreAnswer(input: {
  answer: string;
  question: Pick<SessionQuestion, "text" | "type" | "hints">;
  postingSkills?: string[];
  skillsIn?: (text: string) => string[];
}): AnswerScore {
  const answer = input.answer.trim();
  const type = input.question.type;
  const words = answer ? answer.split(/\s+/).length : 0;
  const sentences = Math.max(1, answer.split(/[.!?…]+(?:\s|$)|\n+/).filter((s) => s.trim()).length);
  const skills = input.skillsIn ? input.skillsIn(answer) : [];
  const star = { s: RE.s.test(answer), t: RE.t.test(answer), a: false, r: RE.r.test(answer) };
  const actionVerbs = count(RE.actionFr, answer) + count(RE.actionEn, answer);
  star.a = actionVerbs > 0 || /\baction\b/i.test(answer);
  const numbers = count(RE.number, answer);
  const iCount = count(RE.iFr, answer) + count(RE.iEn, answer);
  const weCount = count(RE.weFr, answer) + count(RE.weEn, answer);
  const fillers = answer.match(new RegExp(RE.fillers.source, "giu"))?.map((f) => f.toLowerCase().replace(/,$/, "")) ?? [];
  const hedges = count(RE.hedges, answer);

  // relevance: hint coverage (each hint counts once) + posting skills mentioned
  const ans = new Set(stems(answer));
  const covered: string[] = [];
  const missed: string[] = [];
  for (const h of input.question.hints) {
    const hs = stems(h).filter((w) => w.length >= 4);
    (hs.some((w) => ans.has(w)) ? covered : missed).push(h);
  }
  const qStems = [...new Set(stems(input.question.text))];
  const qHit = qStems.length ? qStems.filter((w) => ans.has(w)).length / qStems.length : 0;
  const postingHits = (input.postingSkills ?? []).filter((s) => skills.some((x) => x.toLowerCase() === s.toLowerCase()));
  const hintRatio = input.question.hints.length ? covered.length / input.question.hints.length : qHit;

  const signals: AnswerSignals = { words, sentences, star, numbers, skills, actionVerbs, iCount, weCount, fillers, hedges, covered, missed, postingHits };

  if (words < 5) {
    return {
      scores: { structure: 1, relevance: 1, specificity: 1, communication: 1 },
      overall: 1,
      signals,
      tips: [{ code: "empty" }],
    };
  }

  // structure
  let structure: number;
  const stepCount = count(RE.steps, answer);
  const hasDef = RE.definition.test(answer);
  const hasEx = RE.example.test(answer);
  const hasTrade = RE.tradeoff.test(answer);
  if (type === "technical") {
    structure = 1.4 + (hasDef ? 1.2 : 0) + (hasEx ? 1.2 : 0) + (hasTrade ? 1.2 : 0) + Math.min(0.6, stepCount * 0.3);
  } else if (type === "behavioral") {
    structure = 1 + (star.s ? 1 : 0) + (star.t ? 0.8 : 0) + (star.a ? 1.2 : 0) + (star.r ? 1 : 0);
  } else if (type === "situational") {
    structure = 1.2 + Math.min(2.4, stepCount * 0.8) + (star.a || /\bje (?:ferais|commencerais|demanderais|vérifierais|proposerais)|\bi would\b/i.test(answer) ? 0.8 : 0) + (star.r ? 0.6 : 0);
  } else {
    // motivation / culture: a clear thread (because / so / ordered points) and a closing
    const connectors = count(/\b(parce que|car|donc|c['’]est pourquoi|ainsi|because|so|therefore|that's why|which is why)\b/giu, answer);
    structure = 1.4 + Math.min(1.8, connectors * 0.6) + Math.min(1, stepCount * 0.5) + (star.r || hasEx ? 0.8 : 0);
  }
  if (sentences < 2 && words > 60) structure -= 0.6;

  // relevance
  let relevance = 1 + 4 * Math.min(1, hintRatio * 1.3 + qHit * 0.3) + Math.min(0.6, postingHits.length * 0.3);
  if (words < 20) relevance = Math.min(relevance, 2.5);

  // specificity
  let specificity =
    1 + Math.min(1.5, numbers * 0.6) + Math.min(1.4, skills.length * 0.5) + Math.min(1.2, actionVerbs * 0.4) + (hasEx ? 0.4 : 0);
  if (/\b(des choses|plein de trucs|beaucoup de choses|etc\.?|stuff|things like that|and so on|tout ça)\b/i.test(answer)) specificity -= 0.5;

  // communication
  const [lo, hi] = RANGES[type];
  let communication = words < lo ? 1 + 4 * (words / lo) : words > hi ? 5 - Math.min(2.5, (words - hi) / 80) : 5;
  const fillerRate = (fillers.length / words) * 100;
  communication -= Math.min(2, fillerRate * 0.6);
  communication -= Math.min(1, hedges * 0.3);
  const avgSentence = words / sentences;
  if (avgSentence > 32) communication -= 0.8;

  const scores: Scores = {
    structure: clamp15(structure),
    relevance: clamp15(relevance),
    specificity: clamp15(specificity),
    communication: clamp15(communication),
  };
  const overall = round1((scores.structure + scores.relevance + scores.specificity + scores.communication) / 4);

  // tips, most useful first
  const tips: Tip[] = [];
  if (words < lo * 0.6) tips.push({ code: "too_short" });
  if (fillers.length >= 2) tips.push({ code: "fillers", detail: [...new Set(fillers)].slice(0, 3).join(", ") });
  if (type === "behavioral") {
    const star: Tip[] = [];
    if (!signals.star.s) star.push({ code: "add_situation" });
    if (!signals.star.t) star.push({ code: "add_task" });
    if (!signals.star.a) star.push({ code: "add_action" });
    if (!signals.star.r) star.push({ code: "add_result" });
    tips.push(...star.slice(0, 2));
    if (weCount > Math.max(2, iCount * 1.5)) tips.push({ code: "use_i" });
  }
  if (type === "technical") {
    if (!hasDef) tips.push({ code: "add_definition" });
    if (!hasEx) tips.push({ code: "add_example" });
    if (!hasTrade) tips.push({ code: "add_tradeoff" });
  }
  if (type === "situational" && stepCount < 2) tips.push({ code: "add_steps" });
  if (missed.length && hintRatio < 0.75) tips.push({ code: "cover_hint", detail: missed[0] });
  if ((input.postingSkills?.length ?? 0) > 0 && postingHits.length === 0 && type !== "culture")
    tips.push({ code: "link_posting", detail: input.postingSkills!.slice(0, 3).join(", ") });
  if (numbers === 0 && type !== "technical") tips.push({ code: "add_numbers" });
  if (hedges >= 2) tips.push({ code: "hedging" });
  if (avgSentence > 32) tips.push({ code: "long_sentences" });
  if (words > hi + 60) tips.push({ code: "too_long" });

  return { scores, overall, signals, tips: tips.slice(0, 6) };
}

const TIP_TEXT: Record<TipCode, Record<Lang, string>> = {
  empty: { en: "Give a real answer, even a short one: two or three full sentences are a minimum.", fr: "Donnez une vraie réponse, même courte : deux ou trois phrases complètes au minimum." },
  too_short: { en: "Develop more: aim for 45 seconds to 2 minutes when spoken.", fr: "Développez davantage : visez 45 secondes à 2 minutes à l'oral." },
  too_long: { en: "Cut it down: keep one example and the result, drop the side details.", fr: "Raccourcissez : gardez un exemple et le résultat, supprimez les détails annexes." },
  add_situation: { en: "Open with the context in one sentence: where, when, which project.", fr: "Commencez par le contexte en une phrase : où, quand, quel projet." },
  add_task: { en: "State your goal or responsibility clearly (\"I had to…\").", fr: "Énoncez clairement votre objectif ou votre responsabilité (« Je devais… »)." },
  add_action: { en: "Describe what you did yourself, with action verbs: \"I designed…, I tested…\".", fr: "Décrivez ce que vous avez fait vous-même, avec des verbes d'action : « J'ai conçu…, j'ai testé… »." },
  add_result: { en: "Finish with the result and what you learned; a number makes it memorable.", fr: "Terminez par le résultat et ce que vous avez appris ; un chiffre le rend mémorable." },
  use_i: { en: "Say \"I\" more than \"we\": the recruiter is assessing your contribution.", fr: "Dites « je » plus que « on/nous » : le recruteur évalue votre contribution." },
  add_numbers: { en: "Add one concrete figure: team size, duration, users, time saved, grade.", fr: "Ajoutez un chiffre concret : taille de l'équipe, durée, utilisateurs, temps gagné, note." },
  fillers: { en: "Remove filler words ({d}); a short pause sounds more confident.", fr: "Supprimez les mots de remplissage ({d}) ; une courte pause paraît plus assurée." },
  hedging: { en: "Be more assertive: replace \"maybe / I think\" with direct statements.", fr: "Soyez plus affirmatif : remplacez « peut-être / je pense » par des phrases directes." },
  long_sentences: { en: "Use shorter sentences: one idea per sentence.", fr: "Faites des phrases plus courtes : une idée par phrase." },
  add_example: { en: "Illustrate with a concrete example, ideally from one of your projects.", fr: "Illustrez avec un exemple concret, idéalement tiré d'un de vos projets." },
  add_tradeoff: { en: "Mention a limit or trade-off (\"but…\", \"it depends on…\"): it shows depth.", fr: "Mentionnez une limite ou un compromis (« mais… », « cela dépend de… ») : cela montre la maîtrise." },
  add_definition: { en: "Start with a crisp one-sentence definition before the details.", fr: "Commencez par une définition claire en une phrase avant les détails." },
  cover_hint: { en: "You did not address: {d}.", fr: "Point non abordé : {d}." },
  link_posting: { en: "Connect your answer to the posting's skills ({d}).", fr: "Reliez votre réponse aux compétences de l'offre ({d})." },
  add_steps: { en: "Lay out your approach as ordered steps: first…, then…, finally….", fr: "Présentez votre démarche en étapes ordonnées : d'abord…, ensuite…, enfin…." },
};

export function tipText(tip: Tip, lang: Lang): string {
  return TIP_TEXT[tip.code][lang].replace("{d}", tip.detail ?? "");
}

// ---------- STAR stories ----------
export interface StoryInput {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  skills: string[];
}
export type StoryGap = "title" | "situation" | "task" | "action" | "result" | "action_i" | "result_number" | "tags";

/** 0–100 heuristic: every STAR part present and developed, first-person actions, a measurable result, tags. */
export function storyStrength(input: StoryInput): { score: number; gaps: StoryGap[] } {
  // [placeholders] left by the polish step are not content yet.
  const strip = (x: string) => x.replace(/\[[^\]]*\]/g, " ");
  const s = { ...input, situation: strip(input.situation), task: strip(input.task), action: strip(input.action), result: strip(input.result) };
  const gaps: StoryGap[] = [];
  let score = 0;
  if (s.title.trim().length >= 3) score += 5;
  else gaps.push("title");
  for (const k of ["situation", "task", "action", "result"] as const) {
    const n = s[k].trim().split(/\s+/).filter(Boolean).length;
    score += Math.min(15, n * 1.5);
    if (n < 6) gaps.push(k);
  }
  if (count(RE.actionFr, s.action) + count(RE.actionEn, s.action) > 0) score += 10;
  else gaps.push("action_i");
  if (/\d/.test(s.result)) score += 15;
  else gaps.push("result_number");
  if (s.tags.length + s.skills.length > 0) score += 10;
  else gaps.push("tags");
  return { score: Math.round(Math.min(100, score)), gaps };
}

/** Best matching story for a question (keyword overlap), or null under a minimal threshold. */
export function matchStory<T extends StoryInput & { id: number }>(stories: readonly T[], q: Pick<SessionQuestion, "text" | "hints" | "type">): T | null {
  if (q.type !== "behavioral" && q.type !== "situational") return null;
  const qs = new Set(stems(`${q.text} ${q.hints.join(" ")}`));
  let best: T | null = null;
  let bestScore = 0;
  for (const s of stories) {
    const tagHits = [...s.tags, ...s.skills].filter((t) => stems(t).some((w) => qs.has(w))).length * 2;
    const body = new Set(stems(`${s.title} ${s.situation} ${s.task} ${s.action} ${s.result}`));
    const hits = [...body].filter((w) => qs.has(w)).length + tagHits;
    if (hits > bestScore) {
      bestScore = hits;
      best = s;
    }
  }
  return bestScore >= 2 ? best : null;
}

// ---------- spaced repetition (Leitner boxes 1..5) ----------
export type DrillGrade = "knew" | "partial" | "no";
export interface DrillState {
  question_id: string;
  box: number;
  due_at: string;
  reviews: number;
}
const BOX_MINUTES = [0, 10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 16];

export function nextDrillState(prev: DrillState | null, questionId: string, grade: DrillGrade, now: Date): DrillState {
  const box = grade === "knew" ? Math.min(5, (prev?.box ?? 0) + 1) : grade === "partial" ? Math.max(1, Math.min(prev?.box ?? 1, 2)) : 1;
  const due = new Date(now.getTime() + BOX_MINUTES[box] * 60_000);
  return { question_id: questionId, box, due_at: due.toISOString(), reviews: (prev?.reviews ?? 0) + 1 };
}

/** Due cards first (oldest due first, lowest box first), then unseen cards, then the soonest upcoming. */
export function orderDrill<T extends { id: string }>(cards: readonly T[], states: ReadonlyMap<string, DrillState>, now: Date, n: number): T[] {
  const t = now.getTime();
  const due: T[] = [];
  const fresh: T[] = [];
  const later: T[] = [];
  for (const c of cards) {
    const s = states.get(c.id);
    if (!s) fresh.push(c);
    else if (Date.parse(s.due_at) <= t) due.push(c);
    else later.push(c);
  }
  const byDue = (a: T, b: T) => {
    const sa = states.get(a.id)!;
    const sb = states.get(b.id)!;
    return sa.box - sb.box || Date.parse(sa.due_at) - Date.parse(sb.due_at);
  };
  due.sort(byDue);
  later.sort((a, b) => Date.parse(states.get(a.id)!.due_at) - Date.parse(states.get(b.id)!.due_at));
  return [...due, ...fresh, ...later].slice(0, n);
}

// ---------- report aggregation ----------
export interface ScoredAnswer {
  idx: number;
  skipped: boolean;
  scores: Scores | null;
  overall: number | null;
  tips: Tip[];
}

export function aggregate(answers: readonly ScoredAnswer[]) {
  const scored = answers.filter((a) => !a.skipped && a.scores && a.overall !== null);
  const dims = Object.fromEntries(
    DIMS.map((d) => [d, scored.length ? round1(scored.reduce((s, a) => s + a.scores![d], 0) / scored.length) : 0]),
  ) as Scores;
  const overall = scored.length ? round1(scored.reduce((s, a) => s + a.overall!, 0) / scored.length) : null;
  const sorted = scored.slice().sort((a, b) => b.overall! - a.overall! || a.idx - b.idx);
  const counts = new Map<TipCode, { n: number; tip: Tip }>();
  for (const a of scored) for (const t of a.tips) {
    if (t.code === "cover_hint" || t.code === "link_posting") continue; // question-specific
    const c = counts.get(t.code);
    counts.set(t.code, { n: (c?.n ?? 0) + 1, tip: c?.tip ?? t });
  }
  const improvements = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 3).map((x) => ({ ...x.tip, n: x.n }));
  return {
    overall,
    dims,
    answered: scored.length,
    skipped: answers.filter((a) => a.skipped).length,
    best: sorted[0] ?? null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    improvements,
  };
}
