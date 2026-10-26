// Course catalogs read from official open APIs. Each source maps its own answer to NewCourse. Server only.
import { getJson, sleep } from "../sources/http";
import { htmlToText } from "../sources/html";
import { extractSkills } from "../ai/heuristic";
import { classifyFields, parseDuration, type CertKind, type CourseLevel, type NewCourse, type PriceKind } from "./model";
import { MORE_SOURCES } from "./sources-more";

const short = (s: string) => htmlToText(s ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
const level = (s: string | undefined): CourseLevel | null => (s === "beginner" || s === "intermediate" || s === "advanced" ? s : null);
const course = (c: Omit<NewCourse, "fields" | "skills"> & { fields?: NewCourse["fields"] }): NewCourse => ({
  ...c,
  fields: c.fields?.length ? c.fields : classifyFields(c.title, c.description),
  skills: extractSkills(`${c.title}\n${c.description}`).slice(0, 8),
});

// ---------- Microsoft Learn: official catalog API (learning paths, courses, certifications), no key ----------
// https://learn.microsoft.com/training/support/catalog-api
const MS = "https://learn.microsoft.com/api/catalog/?locale=en-us&type=learningPaths,courses,certifications";
interface MsItem {
  uid: string;
  title: string;
  summary?: string;
  subtitle?: string;
  url: string;
  levels?: string[];
  duration_in_minutes?: number;
  duration_in_hours?: number;
  icon_url?: string;
  last_modified?: string;
  certification_type?: string;
}
export interface MsCatalog { learningPaths?: MsItem[]; courses?: MsItem[]; certifications?: MsItem[] }

export function mapMicrosoft(j: MsCatalog): NewCourse[] {
  // Learning paths are free with a completion badge; instructor-led courses are paid; certifications end in a proctored exam.
  const rows: [MsItem, PriceKind, CertKind][] = [
    ...(j.learningPaths ?? []).map((x): [MsItem, PriceKind, CertKind] => [x, "free", "completion"]),
    ...(j.courses ?? []).map((x): [MsItem, PriceKind, CertKind] => [x, "paid", "completion"]),
    ...(j.certifications ?? []).map((x): [MsItem, PriceKind, CertKind] => [x, "paid", "proctored"]),
  ];
  return rows
    .filter(([x]) => x.title && x.url)
    .map(([x, price, cert]) =>
      course({
        source: "microsoft",
        title: x.title,
        url: x.url.replace(/[?&]WT\.mc_id=[^&]*/, ""),
        provider: "Microsoft",
        description: short(x.summary ?? x.subtitle ?? ""),
        level: level(x.levels?.[0]),
        duration_min: x.duration_in_minutes ?? (x.duration_in_hours ? x.duration_in_hours * 60 : null),
        languages: ["en"],
        price,
        cert,
        image: x.icon_url ?? null,
        updated_at: x.last_modified?.slice(0, 10) ?? null,
        expires_at: null,
      }),
    );
}

export async function fetchMicrosoft(): Promise<{ courses: NewCourse[]; error?: string }> {
  const { data, error } = await getJson<MsCatalog>(MS, { timeoutMs: 60_000 });
  return data ? { courses: mapMicrosoft(data) } : { courses: [], error };
}

// ---------- FUN-MOOC: French university MOOCs (Richie API), certificates sometimes paid ----------
interface FunRun { languages?: string[]; offer?: string; certificate_offer?: string | null; start?: string; end?: string; enrollment_end?: string }
interface FunItem {
  absolute_url: string;
  title: string;
  introduction?: string;
  duration?: string;
  effort?: string;
  cover_image?: { src?: string };
  organization_highlighted?: string | { title?: string };
  course_runs?: FunRun[];
  offer?: string;
  certificate_offer?: string | null;
}
export interface FunPage { objects: FunItem[]; meta?: { total_count?: number } }

export function mapFunMooc(page: FunPage): NewCourse[] {
  return page.objects
    .filter((x) => x.title && x.absolute_url)
    .map((x) => {
      const run = x.course_runs?.[0];
      const org = typeof x.organization_highlighted === "string" ? x.organization_highlighted : x.organization_highlighted?.title;
      const certOffer = run?.certificate_offer ?? x.certificate_offer;
      return course({
        source: "funmooc",
        title: x.title,
        url: `https://www.fun-mooc.fr${x.absolute_url}`,
        provider: org || "FUN-MOOC",
        description: short(x.introduction ?? ""),
        level: null,
        duration_min: parseDuration(x.effort) ?? parseDuration(x.duration),
        languages: run?.languages?.length ? run.languages : ["fr"],
        price: (run?.offer ?? x.offer) === "paid" ? "paid" : certOffer === "paid" ? "freemium" : "free",
        cert: certOffer === "paid" ? "paid" : certOffer === "free" ? "completion" : "none",
        image: x.cover_image?.src ?? null,
        updated_at: run?.start?.slice(0, 10) ?? null,
        // A session that closed enrolment is not a course one can join now.
        expires_at: run?.enrollment_end?.slice(0, 10) ?? null,
      });
    });
}

export async function fetchFunMooc(): Promise<{ courses: NewCourse[]; error?: string }> {
  const out: NewCourse[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const { data, error } = await getJson<FunPage>(`https://www.fun-mooc.fr/api/v1.0/courses/?limit=100&offset=${offset}`, { timeoutMs: 30_000 });
    if (!data) return { courses: out, error };
    out.push(...mapFunMooc(data));
    if (data.objects.length < 100) break;
    await sleep(500);
  }
  return { courses: out };
}

/**
 * Every fetched catalog, by source id (display names in directory.ts). Coursera is not here: its API host's
 * robots.txt disallows /api/ for every bot, so it is a search link in the directory, like Udemy.
 */
export const COURSE_SOURCES: Record<string, () => Promise<{ courses: NewCourse[]; error?: string }>> = {
  microsoft: fetchMicrosoft,
  funmooc: fetchFunMooc,
  ...MORE_SOURCES,
};
