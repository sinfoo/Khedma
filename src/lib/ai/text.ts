// Untrusted text going into prompts. Pure.
// Head+tail trimming and tag fencing adapted from squerne/open-career-skills (MIT, © 2026 JobMentis).

/** Long text keeps its head and its tail: eligibility, language and pay lines usually sit at the end of a posting. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.round(max * 0.65);
  return `${s.slice(0, head)}\n[...]\n${s.slice(s.length - (max - head))}`;
}

const TAGS = ["job_posting", "company_brief", "writing_sample", "candidate_cv"];
const TAG_RE = new RegExp(`<\\s*/?\\s*(${TAGS.join("|")})\\b[^>]*>`, "gi");

/** Untrusted text inside a tag it cannot close or fake: our own tag names are removed from it first. */
export function fence(tag: (typeof TAGS)[number], s: string): string {
  return `<${tag}>\n${s.replace(TAG_RE, "")}\n</${tag}>`;
}

/** Zero-width, bidi and soft-hyphen characters: invisible in the posting, but they can hide text from the reader. */
export function stripHidden(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁤﻿­]/g, "");
}
