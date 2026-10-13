// Is a posting still open? Fetch its page and classify from the HTTP status and "closed" markers in the text.
import { getJob } from "@/lib/db";
import { htmlToText } from "@/lib/sources/html";
import { mapLimit } from "@/lib/sources/http";
import { politeFetch } from "./robots";
import { saveCheck, type JobCheck, type Liveness } from "./index";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ");

// Matched against folded page text (lowercase, no accents).
export const CLOSED_MARKERS: RegExp[] = [
  /no longer accepting applications/,
  /(job|position|posting|listing|role|offer|opportunity|vacancy) (is )?no longer (available|open|active|accepting)/,
  /(position|job|role|vacancy) has (been|already been) filled/,
  /this (job|position|posting|listing|vacancy) (is|has been) (closed|filled|removed|expired)/,
  /\bjob (closed|expired)\b/,
  /(posting|listing|job|offer) has expired/,
  /job you are looking for is no longer open/,
  /sorry, this (job|position) (is|has)/,
  /applications? (are|is) (now )?closed/,
  /\bthis (job|position) is not available\b/,
  /(cette|l') ?offre (d'emploi |de stage )?n'est plus (disponible|en ligne|active|valide|d'actualite)/,
  /(cette|l')? ?annonce n'est plus (disponible|en ligne|active)/,
  /(cette |l')?offre (a expire|est expiree|expiree|cloturee|est cloturee|est close)/,
  /(ce )?poste (a (deja )?ete|est( deja)?) pourvu/,
  /candidatures? (sont|est) (closes?|fermees?|cloturees?)/,
  /offre que vous (recherchez|cherchez) n'(existe|est) plus/,
  /(plus|pas) de candidatures? (acceptees?|possibles?)/,
];

export interface Classified {
  status: Liveness;
  reason: string;
}

/** Pure classifier: HTTP status + page HTML/text -> open / closed / unknown. */
export function classifyLiveness(httpStatus: number, html: string): Classified {
  if (httpStatus === 404 || httpStatus === 410) return { status: "closed", reason: `HTTP ${httpStatus}` };
  if (httpStatus === 0) return { status: "unknown", reason: "unreachable" };
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500) return { status: "unknown", reason: `HTTP ${httpStatus}` };
  if (httpStatus >= 300) return { status: "unknown", reason: `HTTP ${httpStatus}` };
  const text = fold(htmlToText(html));
  if (text.length < 80) return { status: "unknown", reason: "empty page" };
  for (const re of CLOSED_MARKERS) {
    const m = re.exec(text);
    if (m) return { status: "closed", reason: `“${m[0].slice(0, 60)}”` };
  }
  return { status: "open", reason: `HTTP ${httpStatus}` };
}

export async function checkUrl(url: string): Promise<Classified & { http_status: number | null }> {
  if (!/^https?:\/\//i.test(url)) return { status: "unknown", reason: "no public URL", http_status: null };
  const f = await politeFetch(url);
  if (f.blocked) return { status: "unknown", reason: f.error ?? "blocked", http_status: null };
  if (f.status === 0) return { status: "unknown", reason: f.error ?? "unreachable", http_status: null };
  return { ...classifyLiveness(f.status, f.html), http_status: f.status };
}

/** Check a batch of offers (3 in flight, 250ms gap) and persist each result. Unknown ids are skipped. */
export async function checkJobs(ids: number[]): Promise<JobCheck[]> {
  const jobs = ids.map((id) => getJob(id)).filter((j): j is NonNullable<typeof j> => !!j);
  const results = await mapLimit(
    jobs,
    3,
    async (job) => {
      const r = await checkUrl(job.url);
      return saveCheck({ job_id: job.id, status: r.status, http_status: r.http_status, reason: r.reason });
    },
    250,
  );
  return results;
}
