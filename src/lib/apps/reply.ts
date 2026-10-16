// Reply classification (career-ops reply-watch): a pasted email / LinkedIn message →
// kind, suggested stage, extracted interview details. Deterministic FR/EN markers;
// the AI layer (src/lib/ai/reply.ts) refines it. The text is data, never instructions.
import type { AppState, InterviewKind } from "../types";

export const REPLY_KINDS = ["interview", "offer", "rejected", "responded", "noise"] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];
export const isReplyKind = (s: unknown): s is ReplyKind => typeof s === "string" && (REPLY_KINDS as readonly string[]).includes(s);

export interface Extracted {
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM */
  time: string | null;
  link: string | null;
  interviewer: string | null;
  round: InterviewKind | null;
}

export interface ReplyResult {
  kind: ReplyKind;
  suggested_stage: AppState | null;
  extracted: Extracted;
  /** 0–1 */
  confidence: number;
  /** Matched phrases, for the UI. */
  evidence: string[];
}

export const STAGE_FOR: Record<ReplyKind, AppState | null> = {
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
  responded: "responded",
  noise: null,
};

export const MAX_REPLY_CHARS = 2000;

const RULES: Record<Exclude<ReplyKind, "noise">, { re: RegExp; w: number }[]> = {
  rejected: [
    { re: /nous avons le regret|avons le regret de|au regret de vous|malheureusement|ne donnerons pas suite|ne pas donner suite|pas (?:été )?retenu|n['’]a pas été retenue?|candidature n['’]a pas|autre candidat|autres candidats|profil ne correspond|we regret|unfortunately|not (?:been )?selected|not move forward|will not be moving forward|decided to (?:move forward|proceed) with (?:other|another)|other candidates|not the right fit|unsuccessful|position has been filled|poste (?:a été|est) pourvu/i, w: 3 },
  ],
  offer: [
    { re: /offre d['’]emploi|offre de stage|proposition d['’]embauche|lettre d['’]offre|vous proposer (?:un|le) (?:poste|stage|contrat)|heureux de vous (?:proposer|annoncer)|plaisir de vous (?:proposer|annoncer)|offer letter|job offer|internship offer|pleased to offer|happy to offer|extend (?:you )?an offer|we would like to offer|offer of employment|contrat (?:de travail|de stage)|convention de stage/i, w: 3 },
    { re: /rémunération|gratification|salaire|salary|compensation|date de début|start date/i, w: 1 },
  ],
  interview: [
    { re: /entretien|convocation|convoqué|invitation à|vous rencontrer|échange téléphonique|visio|interview|schedule a (?:call|meeting|conversation)|invite you to|meet (?:with )?(?:you|the team)|phone screen|technical (?:test|assessment)|test technique|case study|étude de cas|next (?:step|round)|prochaine étape/i, w: 3 },
    { re: /calendly\.com|zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|cal\.com|hubspot\.com\/meetings/i, w: 3 },
    { re: /disponibilit(?:é|és|e)|availability|available|créneau|slot|when (?:would|are) you/i, w: 1 },
  ],
  responded: [
    { re: /bien reçu|accusons réception|avons (?:bien )?reçu|nous reviendrons vers vous|reviendrons vers vous|en cours d['’]étude|étudions votre|received your application|we have received|thank you for applying|under review|reviewing your|will get back to you|get back to you|merci pour votre candidature|merci de votre intérêt|thank you for your interest/i, w: 2 },
    { re: /pourriez-vous|could you (?:please )?(?:send|share|provide)|merci de (?:nous )?(?:envoyer|transmettre)|please (?:send|share|provide|complete|fill)|questionnaire|formulaire/i, w: 2 },
  ],
};

const NOISE_RE = /newsletter|unsubscribe|se désabonner|désinscri|job alert|alerte emploi|offres recommandées|recommended jobs|nouvelles offres|new jobs for you|webinar|promotion|no-?reply@.*(?:linkedin|indeed|glassdoor)/i;

const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, janv: 1, févr: 2, juil: 7, déc: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;

/** First recognisable date in the text, as YYYY-MM-DD. Years default to the reference date's year (next year if already past). */
export function extractDate(text: string, ref = new Date()): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    if (valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  }
  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|\d{2})\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    if (valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  }
  const dm = text.match(new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:\\s+(20\\d{2}))?\\b`, "i"));
  const md = text.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "i"));
  const hit = dm ? { d: Number(dm[1]), m: MONTHS[dm[2].toLowerCase()], y: dm[3] } : md ? { d: Number(md[2]), m: MONTHS[md[1].toLowerCase()], y: md[3] } : null;
  if (!hit || !hit.m) return null;
  let y = hit.y ? Number(hit.y) : ref.getFullYear();
  if (!hit.y && hit.m < ref.getMonth() + 1) y++; // "3 janvier" written in October means next year
  return valid(y, hit.m, hit.d) ? `${y}-${pad(hit.m)}-${pad(hit.d)}` : null;
}

/** First time of day as HH:MM ("14h30", "14:00", "2pm", "9h"). */
export function extractTime(text: string): string | null {
  const fr = text.match(/\b([01]?\d|2[0-3])\s?h\s?([0-5]\d)?\b/i);
  const hm = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s?(am|pm)?\b/i);
  const ampm = text.match(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i);
  let h: number | null = null;
  let m = 0;
  if (hm) {
    h = Number(hm[1]);
    m = Number(hm[2]);
    if (hm[3]) h = (h % 12) + (hm[3].toLowerCase() === "pm" ? 12 : 0);
  } else if (fr) {
    h = Number(fr[1]);
    m = Number(fr[2] ?? 0);
  } else if (ampm) {
    h = (Number(ampm[1]) % 12) + (ampm[2].toLowerCase() === "pm" ? 12 : 0);
  }
  return h === null ? null : `${pad(h)}:${pad(m)}`;
}

export function extractLink(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!m) return null;
  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return (urls.find((u) => /calendly|zoom\.us|meet\.google|teams\.microsoft|teams\.live|cal\.com|hubspot\.com\/meetings|webex|whereby/i.test(u)) ?? m[0]).replace(/[.,;:!?]+$/, "");
}

const NAME = String.raw`((?:M\.|Mme|Mr\.?|Ms\.?|Dr\.?)\s+)?([A-ZÀ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-Ý][\p{L}'’-]+){1,2})`;
export function extractInterviewer(text: string): string | null {
  const m = text.match(new RegExp(String.raw`\b(?:avec|with|par|by|entretien avec|interview with|meet(?:ing)? with|rencontrer)\s+${NAME}`, "u"));
  if (!m) return null;
  const name = `${m[1] ?? ""}${m[2]}`.trim();
  return /^(?:notre|our|the|le|la|les|une?)\b/i.test(name) ? null : name;
}

export function extractRound(text: string): InterviewKind | null {
  const t = text.toLowerCase();
  if (/\b(final|dernier entretien|dernière étape|last round)\b/.test(t)) return "final";
  if (/\b(sur site|on[- ]site|dans nos locaux|in our office|at our office|visite)\b/.test(t)) return "onsite";
  if (/\b(étude de cas|case study|business case|exercice|take[- ]home|test technique|technical (?:test|assessment)|coding (?:test|challenge)|codingame|hackerrank)\b/.test(t)) return "case";
  if (/\b(technique|technical|tech interview|développeur|engineering|system design|code review)\b/.test(t)) return "technical";
  if (/\b(rh|ressources humaines|hr|human resources|recruteur|recruiter|talent)\b/.test(t)) return "hr";
  if (/\b(téléphon|telephon|phone|appel|call|screen)\b/.test(t)) return "phone";
  return null;
}

/** Deterministic classification. */
export function classifyReply(raw: string, ref = new Date()): ReplyResult {
  const text = String(raw ?? "").slice(0, 8000);
  const scores: Record<ReplyKind, number> = { interview: 0, offer: 0, rejected: 0, responded: 0, noise: 0 };
  const evidence: string[] = [];
  for (const kind of Object.keys(RULES) as (keyof typeof RULES)[]) {
    for (const { re, w } of RULES[kind]) {
      const m = text.match(re);
      if (m) {
        scores[kind] += w;
        evidence.push(m[0]);
      }
    }
  }
  const noise = text.match(NOISE_RE);
  if (noise) {
    scores.noise += 3;
    evidence.push(noise[0]);
  }
  const extracted: Extracted = { date: extractDate(text, ref), time: extractTime(text), link: extractLink(text), interviewer: extractInterviewer(text), round: extractRound(text) };
  if (extracted.date && extracted.time) scores.interview += 1;

  // A rejection sentence beats interview vocabulary ("thank you for the interview, unfortunately…").
  if (scores.rejected >= 3) scores.interview = Math.min(scores.interview, 2);
  const ranked = (Object.keys(scores) as ReplyKind[]).sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0];
  const best = scores[top];
  const kind: ReplyKind = best === 0 ? "noise" : top;
  const second = scores[ranked[1]] ?? 0;
  const confidence = best === 0 ? 0.3 : Math.min(0.95, 0.45 + 0.1 * best - 0.08 * second);
  return { kind, suggested_stage: STAGE_FOR[kind], extracted, confidence: Math.round(confidence * 100) / 100, evidence: [...new Set(evidence)].slice(0, 6) };
}
