// Where an offer really lives (LinkedIn, Indeed, Keejob…) and search links when we only have a title.
import type { Job } from "./types";

const PLATFORMS: [RegExp, string][] = [
  [/linkedin\./, "LinkedIn"],
  [/indeed\./, "Indeed"],
  [/jobs\.ch/, "jobs.ch"],
  [/jobup\.ch/, "jobup"],
  [/glassdoor\./, "Glassdoor"],
  [/welcometothejungle|wttj/, "Welcome to the Jungle"],
  [/keejob\./, "Keejob"],
  [/tanitjobs\./, "Tanitjobs"],
  [/emploitunisie\./, "Emploitunisie"],
  [/farojob\./, "Farojob"],
  [/optioncarriere\./, "Optioncarriere"],
  [/greenhouse\.io/, "Greenhouse"],
  [/lever\.co/, "Lever"],
  [/ashbyhq\.com/, "Ashby"],
  [/workday|myworkdayjobs/, "Workday"],
  [/smartrecruiters\./, "SmartRecruiters"],
  [/bamboohr\./, "BambooHR"],
  [/teamtailor\./, "Teamtailor"],
  [/recruitee\./, "Recruitee"],
  [/jobteaser\./, "JobTeaser"],
  [/hellowork\.|regionsjob/, "HelloWork"],
  [/apec\.fr/, "Apec"],
  [/arbeitnow\.com/, "Arbeitnow"],
  [/englishjobs\.(de|fr)/, "EnglishJobs"],
  [/englishjobsearch\.ch/, "EnglishJobSearch.ch"],
  [/job-room\.ch/, "Job-Room"],
  [/jobbank\.gc\.ca|guichetemplois\.gc\.ca/, "Job Bank"],
  [/daijob\.com/, "Daijob"],
  [/wantedly\.com/, "Wantedly"],
  [/stepstone\./, "StepStone"],
  [/xing\.com/, "XING"],
  [/arbeitsagentur\.de/, "Bundesagentur für Arbeit"],
  [/ziprecruiter\./, "ZipRecruiter"],
  [/wellfound\.com|angel\.co/, "Wellfound"],
  [/francetravail\.fr|pole-emploi\.fr/, "France Travail"],
  [/workopolis\.com/, "Workopolis"],
  [/eluta\.ca/, "Eluta"],
  [/gaijinpot\.com/, "GaijinPot"],
  [/careercross\.com/, "CareerCross"],
  [/mynavi\.jp/, "Mynavi"],
  [/rikunabi\.com/, "Rikunabi"],
  [/stackoverflow\.com\/jobs/, "Stack Overflow"],
];

export const isRealUrl = (url: string) => /^https?:\/\//i.test(url) && !/\.local(\/|$)/i.test(url);

/** Human name of the site an offer URL points to. */
export function platformOf(url: string): string {
  if (!isRealUrl(url)) return "";
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  for (const [re, name] of PLATFORMS) if (re.test(host)) return name;
  const parts = host.replace(/^www\./, "").split(".");
  const core = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}

export interface PostingLinks {
  /** The real posting, if we have one. */
  primary: { url: string; platform: string } | null;
  /** Search the same role on major platforms (always available). */
  search: { platform: string; url: string }[];
}

export function postingLinks(job: Pick<Job, "url" | "title" | "company" | "location">): PostingLinks {
  const q = `${job.title} ${job.company}`.trim();
  const loc = (job.location || "Tunisia").split(",")[0].trim();
  const enc = encodeURIComponent;
  const search = [
    { platform: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(loc)}` },
    { platform: "Indeed", url: `https://tn.indeed.com/jobs?q=${enc(q)}&l=${enc(loc)}` },
    { platform: "Google Jobs", url: `https://www.google.com/search?q=${enc(q + " " + loc)}&ibp=htl;jobs` },
    { platform: "Keejob", url: `https://www.keejob.com/offres-emploi/?keywords=${enc(job.title)}` },
  ];
  return { primary: isRealUrl(job.url) ? { url: job.url, platform: platformOf(job.url) } : null, search };
}
