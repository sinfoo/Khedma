import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile, kvGet, listJobs } from "@/lib/db";
import { getUpskillProgress, skillMatrix } from "@/lib/repo/insights";
import type { UpskillPlan } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/kit";
import { UpskillBoard, type PlanView } from "@/components/insights/upskill-board";
import { EscoCard } from "@/components/insights/esco-card";

export const metadata: Metadata = { title: "Skills" };

// Hosts we trust to stay up. Model-suggested links outside this list are dropped.
const TRUSTED = [
  "developer.mozilla.org", "freecodecamp.org", "roadmap.sh", "openclassrooms.com", "coursera.org", "edx.org", "youtube.com",
  "docs.python.org", "typescriptlang.org", "react.dev", "nextjs.org", "vuejs.org", "angular.dev", "nodejs.org", "dev.java", "spring.io",
  "cppreference.com", "learn.microsoft.com", "go.dev", "rust-lang.org", "kotlinlang.org", "flutter.dev", "developer.android.com",
  "postgresql.org", "mysql.com", "mongodb.com", "redis.io", "docker.com", "kubernetes.io", "hashicorp.com", "ansible.com", "git-scm.com",
  "scikit-learn.org", "pytorch.org", "tensorflow.org", "pandas.pydata.org", "numpy.org", "apache.org", "djangoproject.com",
  "palletsprojects.com", "tiangolo.com", "graphql.org", "arduino.cc", "raspberrypi.com", "scrumguides.org", "gitlab.com",
];
const trusted = (url: string) => {
  try {
    const h = new URL(url).hostname;
    return url.startsWith("https://") && TRUSTED.some((t) => h === t || h.endsWith(`.${t}`));
  } catch {
    return false;
  }
};

// roadmap.sh guides that exist for these skills.
const ROADMAPS: Record<string, string> = {
  javascript: "javascript", typescript: "typescript", react: "react", "next.js": "nextjs", vue: "vue", angular: "angular", "node.js": "nodejs",
  python: "python", java: "java", "spring boot": "spring-boot", "c++": "cpp", golang: "golang", rust: "rust", kotlin: "kotlin", flutter: "flutter",
  android: "android", sql: "sql", postgresql: "postgresql-dba", mongodb: "mongodb", redis: "redis", docker: "docker", kubernetes: "kubernetes",
  terraform: "terraform", linux: "linux", git: "git-github", aws: "aws", devops: "devops", "machine learning": "machine-learning",
  cybersecurity: "cyber-security", graphql: "graphql", html: "frontend", css: "frontend",
};
const MDN: Record<string, string> = {
  html: "https://developer.mozilla.org/docs/Learn_web_development/Core/Structuring_content",
  css: "https://developer.mozilla.org/docs/Learn_web_development/Core/Styling_basics",
  javascript: "https://developer.mozilla.org/docs/Learn_web_development/Core/Scripting",
};

function curated(skill: string, fr: boolean) {
  const k = skill.toLowerCase();
  const q = encodeURIComponent(skill);
  return [
    ...(ROADMAPS[k] ? [{ title: `roadmap.sh — ${skill}`, url: `https://roadmap.sh/${ROADMAPS[k]}` }] : []),
    ...(MDN[k] ? [{ title: "MDN", url: MDN[k] }] : []),
    { title: "freeCodeCamp", url: `https://www.freecodecamp.org/news/search/?query=${q}` },
    { title: fr ? "OpenClassrooms (catalogue)" : "OpenClassrooms (catalog)", url: "https://openclassrooms.com/fr/courses" },
    { title: "Coursera", url: `https://www.coursera.org/search?query=${q}` },
    { title: "YouTube", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill} tutorial`)}` },
  ];
}

export default async function UpskillPage() {
  const { t, locale } = await getDict();
  const m = t.insights2.skills;
  const profile = getProfile();
  // Demand comes from offers that matter: tracked or scored (not "skip"); unscored noise only while little is scored.
  const open = listJobs().filter((j) => !j.evaluation || j.evaluation.verdict !== "skip");
  const relevant = open.filter((j) => j.application || j.evaluation);
  const jobs = relevant.length >= 5 ? relevant : open;
  const matrix = skillMatrix(jobs);
  const stored = kvGet<UpskillPlan | null>("upskill_plan", null);
  const progress = getUpskillProgress();
  const have = new Set(profile.skills.map((s) => s.toLowerCase()));

  const plan: PlanView | null = stored
    ? {
        engine: stored.engine,
        items: stored.plan.map((p) => {
          const seen = new Set<string>();
          const resources = [...p.resources.filter((r) => trusted(r.url)), ...curated(p.skill, locale === "fr")].filter((r) => !seen.has(r.url) && !!seen.add(r.url)).slice(0, 6);
          return {
            skill: p.skill,
            priority: p.priority,
            why: p.why,
            steps: p.steps,
            done: progress[p.skill.toLowerCase()] ?? [],
            acquired: have.has(p.skill.toLowerCase()) || matrix.rows.some((r) => r.skill === p.skill && r.have),
            resources,
          };
        }),
      }
    : null;

  return (
    <>
      <PageHeader title={m.title} lead={jobs.length ? fmt(m.lead2, { n: jobs.length }) : m.lead} />
      {matrix.rows.length === 0 ? (
        <EmptyState icon={<GraduationCap size={22} aria-hidden="true" />} title={m.emptyTitle} hint={m.emptyHint}>
          <Link href="/app/jobs" className="btn btn-primary">{t.nav.jobs}</Link>
          <Link href="/app/profile" className="btn btn-secondary">{t.nav.profile}</Link>
        </EmptyState>
      ) : (
        <UpskillBoard matrix={matrix} plan={plan} />
      )}
      <Suspense fallback={<div className="skeleton mt-5 h-40 rounded-[14px]" aria-hidden="true" />}>
        <EscoCard t={t} lang={locale === "fr" ? "fr" : "en"} roles={profile.target_roles} cvText={`${profile.cv_md}
${profile.skills.join(", ")}`} />
      </Suspense>
    </>
  );
}
