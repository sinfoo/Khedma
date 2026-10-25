// What the "Khedma Fill" browser extension (extension/) may put into an employer's application form: the
// profile's contact fields, plus, when the page belongs to an application, the answers saved for it and the
// letter. Nothing here is invented: empty fields stay empty.
import { getProfile, listApplications } from "./db";
import { getProfileExtra } from "./cv/profile-extra";
import { listAnswers } from "./apply/repo";
import { canonicalPostingUrl } from "./sources/url";

export interface FillData {
  name: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  city: string;
  school: string;
  linkedin: string;
  github: string;
  portfolio: string;
  /** The application this page belongs to, if any. */
  job: { title: string; company: string } | null;
  answers: { question: string; answer: string }[];
  /** The cover letter as plain text (Markdown marks removed), for a "cover letter" box. */
  letter: string;
}

/** "https://jobs.lever.co/acme/123/apply?x" and "https://jobs.lever.co/acme/123" are the same posting. */
const key = (u: string) => {
  // Keep the query when it names the posting (Taleo, SuccessFactors: "job?id=1" and "job?id=2" are two offers).
  const [base, query = ""] = u.split("#")[0].split("?");
  const id = new URLSearchParams(query);
  const named = ["id", "jobid", "job_id", "jobId", "requisitionId", "job"].map((k) => id.get(k)).find(Boolean);
  return canonicalPostingUrl(base).replace(/\/$/, "").toLowerCase() + (named ? `?id=${named.toLowerCase()}` : "");
};

/** The application whose posting is this page (the page is the posting or one of its sub-pages). */
export function applicationForPage(pageUrl: string) {
  const page = key(pageUrl);
  return listApplications().find((a) => {
    const job = key(a.job.url);
    return page === job || page.startsWith(`${job}/`);
  });
}

export function fillData(pageUrl: string): FillData {
  const p = getProfile();
  const x = getProfileExtra();
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  const app = pageUrl ? applicationForPage(pageUrl) : undefined;
  return {
    name: p.name.trim(),
    first: words[0] ?? "",
    last: words.slice(1).join(" "),
    email: p.email.trim(),
    phone: x.phone,
    city: x.city,
    school: x.school,
    linkedin: x.links.linkedin,
    github: x.links.github,
    portfolio: x.links.portfolio,
    job: app ? { title: app.job.title, company: app.job.company } : null,
    answers: app ? listAnswers(app.id).filter((a) => a.answer.trim()).map((a) => ({ question: a.question, answer: a.answer })) : [],
    letter: app?.cover_letter_md ? app.cover_letter_md.replace(/^#+\s*/gm, "").replace(/\*\*|__/g, "").trim() : "",
  };
}
