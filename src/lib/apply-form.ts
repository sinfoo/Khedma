// "What will this application ask?" Reads the employer's real form from its job system before the student opens it.
// Endpoints and field rules ported from freehire's applyform package (MIT). Demographic/EEO, hidden, info and consent
// fields are dropped: they are not questions to prepare.
import { kvGet, kvSet } from "./db";
import { htmlToText } from "./sources/html";
import { getJson } from "./sources/http";

export type FieldKind = "text" | "textarea" | "select" | "multiselect" | "boolean" | "file" | "date" | "number";
export interface FormQuestion {
  label: string;
  required: boolean;
  kind: FieldKind | null;
  options?: string[];
}
export interface ApplyForm {
  provider: "Greenhouse" | "Ashby" | "Workable" | "Recruitee";
  /** Identity and documents every form asks for (name, e-mail, CV…). */
  basics: FormQuestion[];
  /** The employer's own questions, the ones worth preparing. */
  questions: FormQuestion[];
}

const clean = (s: string | undefined) => htmlToText(s ?? "").replace(/\s*[✱*]\s*$/, "").trim();
const CONSENT = /consent|gdpr|rgpd|privacy|confidentialit/i;

// ---------- Greenhouse ----------
const GH_KIND: Record<string, FieldKind> = { input_text: "text", textarea: "textarea", input_file: "file", multi_value_single_select: "select", multi_value_multi_select: "multiselect" };
const GH_BASICS = new Set(["first_name", "last_name", "email", "phone", "resume", "resume_text", "cover_letter", "cover_letter_text", "location", "longitude", "latitude"]);
interface GhPayload { questions?: { label?: string; required?: boolean; fields?: { name?: string; type?: string; values?: { label?: string }[] }[] }[] }
export function parseGreenhouse(j: GhPayload): ApplyForm {
  const form: ApplyForm = { provider: "Greenhouse", basics: [], questions: [] };
  for (const q of j.questions ?? []) {
    const fields = (q.fields ?? []).filter((f) => f.type !== "input_hidden");
    const label = clean(q.label);
    if (!fields.length || !label) continue;
    // One question can carry an upload and a paste box (resume + resume_text): the first visible field decides.
    const f = fields[0];
    const item: FormQuestion = { label, required: !!q.required, kind: GH_KIND[f.type ?? ""] ?? null, options: f.values?.map((v) => clean(v.label)).filter(Boolean) };
    if (fields.some((x) => GH_BASICS.has(x.name ?? ""))) form.basics.push(item);
    else if (!CONSENT.test(label)) form.questions.push(item);
  }
  return form;
}

// ---------- Ashby ----------
const ASHBY_KIND: Record<string, FieldKind> = { String: "text", Email: "text", Phone: "text", LongText: "textarea", ValueSelect: "select", MultiValueSelect: "multiselect", Boolean: "boolean", File: "file", Date: "date", Number: "number" };
interface AshbyForm { data?: { jobPosting?: { applicationForm?: { sections?: { isHidden?: boolean | null; fieldEntries?: { isRequired?: boolean; isHidden?: boolean | null; field?: { path?: string; title?: string; type?: string; selectableValues?: { label?: string }[] } }[] }[] } } | null } }
export function parseAshby(j: AshbyForm): ApplyForm | null {
  const sections = j.data?.jobPosting?.applicationForm?.sections;
  if (!sections) return null;
  const form: ApplyForm = { provider: "Ashby", basics: [], questions: [] };
  for (const s of sections) {
    if (s.isHidden) continue;
    for (const e of s.fieldEntries ?? []) {
      const f = e.field;
      const label = clean(f?.title);
      if (e.isHidden || !f || !label) continue;
      const item: FormQuestion = { label, required: !!e.isRequired, kind: ASHBY_KIND[f.type ?? ""] ?? null, options: f.selectableValues?.map((v) => clean(v.label)).filter(Boolean) };
      if (f.path?.startsWith("_systemfield_")) form.basics.push(item);
      else if (!CONSENT.test(label)) form.questions.push(item);
    }
  }
  return form;
}
const ASHBY_QUERY =
  "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { applicationForm { sections { title isHidden fieldEntries { id isRequired isHidden field } } } } }";

// ---------- Workable ----------
const WK_KIND: Record<string, FieldKind> = { text: "text", email: "text", phone: "text", paragraph: "textarea", date: "date", number: "number", boolean: "boolean", file: "file", dropdown: "select", multiple: "multiselect" };
interface WkField { id?: string; label?: string; type?: string; required?: boolean; options?: { name?: string; value?: string }[]; fields?: unknown[] }
export function parseWorkable(sections: { fields?: WkField[] }[]): ApplyForm {
  const form: ApplyForm = { provider: "Workable", basics: [], questions: [] };
  for (const s of sections) {
    for (const f of s.fields ?? []) {
      const label = clean(f.label);
      if (!label) continue;
      // Workable inverts options: `value` is the label shown, `name` what it submits. Groups (education…) stay whole.
      const item: FormQuestion = { label, required: !!f.required, kind: f.fields ? null : (WK_KIND[f.type ?? ""] ?? null), options: f.options?.map((o) => clean(o.value)).filter(Boolean) };
      if (f.id?.startsWith("QA_")) {
        if (!CONSENT.test(label)) form.questions.push(item);
      } else form.basics.push(item);
    }
  }
  return form;
}

// ---------- Recruitee ----------
const RC_KIND: Record<string, FieldKind> = { string: "text", text: "textarea", single_choice: "select", multi_choice: "multiselect", boolean: "boolean", legal: "boolean", file: "file", date: "date", number: "number", salary: "number" };
interface RcOffer { options_cv?: string; options_cover_letter?: string; options_phone?: string; options_photo?: string; open_questions?: { position?: number; required?: boolean; kind?: string; body?: string; open_question_options?: { body?: string }[] }[] }
export function parseRecruitee(o: RcOffer, labels: { name: string; email: string; cv: string; letter: string; phone: string; photo: string }): ApplyForm {
  const basics: FormQuestion[] = [
    { label: labels.name, required: true, kind: "text" },
    { label: labels.email, required: true, kind: "text" },
  ];
  for (const [opt, label, kind] of [[o.options_cv, labels.cv, "file"], [o.options_cover_letter, labels.letter, "file"], [o.options_phone, labels.phone, "text"], [o.options_photo, labels.photo, "file"]] as const)
    if (opt && opt !== "off") basics.push({ label, required: opt === "required", kind });
  const questions = [...(o.open_questions ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((q) => q.kind !== "infobox" && q.kind !== "video")
    .map((q) => ({ label: clean(q.body), required: !!q.required, kind: RC_KIND[q.kind ?? ""] ?? null, options: q.open_question_options?.map((x) => clean(x.body)).filter(Boolean) }))
    .filter((q) => q.label && !CONSENT.test(q.label));
  return { provider: "Recruitee", basics, questions };
}

// ---------- fetch by posting URL ----------
const GH_URL = /(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i;
const ASHBY_URL = /jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/i;
const WK_URL = /apply\.workable\.com\/(?:[^/?#]+\/)?j\/([0-9A-Za-z]+)/i;
const RC_URL = /\/\/([a-z0-9-]+)\.recruitee\.com\/o\/([^/?#]+)/i;

/** True when Khedma can read this posting's form. */
export const formReadable = (url: string) => [GH_URL, ASHBY_URL, WK_URL, RC_URL].some((re) => re.test(url));

async function fetchForm(url: string, labels: Parameters<typeof parseRecruitee>[1]): Promise<ApplyForm | null> {
  let m: RegExpExecArray | null;
  if ((m = GH_URL.exec(url))) {
    // questions=true is required: without it Greenhouse answers 200 with no form.
    const { data } = await getJson<GhPayload>(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}?questions=true`);
    return data ? parseGreenhouse(data) : null;
  }
  if ((m = ASHBY_URL.exec(url))) {
    const body = JSON.stringify({ operationName: "ApiJobPosting", query: ASHBY_QUERY, variables: { organizationHostedJobsPageName: decodeURIComponent(m[1]), jobPostingId: m[2] } });
    const { data } = await getJson<AshbyForm>("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", { body });
    return data ? parseAshby(data) : null;
  }
  if ((m = WK_URL.exec(url))) {
    const { data } = await getJson<{ fields?: WkField[] }[]>(`https://apply.workable.com/api/v1/jobs/${m[1]}/form`);
    return Array.isArray(data) ? parseWorkable(data) : null;
  }
  if ((m = RC_URL.exec(url))) {
    const { data } = await getJson<{ offer?: RcOffer }>(`https://${m[1]}.recruitee.com/api/offers/${m[2]}`);
    return data?.offer ? parseRecruitee(data.offer, labels) : null;
  }
  return null;
}

const DAY = 86_400_000;
/** Cached for a day (6 h when the system did not answer) so opening the workspace never hammers the employer. */
export async function getApplyForm(url: string, labels: Parameters<typeof parseRecruitee>[1]): Promise<ApplyForm | null> {
  if (!formReadable(url)) return null;
  const key = `applyform:${url}`;
  const hit = kvGet<{ at: number; form: ApplyForm | null } | null>(key, null);
  if (hit && Date.now() - hit.at < (hit.form ? DAY : DAY / 4)) return hit.form;
  const form = await fetchForm(url, labels).catch((e) => {
    console.warn("[apply-form]", url, (e as Error).message);
    return null;
  });
  kvSet(key, { at: Date.now(), form });
  return form;
}
