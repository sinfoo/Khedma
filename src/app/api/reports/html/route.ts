import type { NextRequest } from "next/server";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { filterApps, loadReportsData, ownerName, parseRange, weeklyDigest } from "@/lib/reports/repo";
import { reportHtml, reportMarkdown, type ReportData } from "@/lib/reports/html";
import { localDate, toLocalDay, CALIBRATION_MIN_N } from "@/lib/reports/digest";
import type { AppState, JobType } from "@/lib/types";

const FUNNEL: AppState[] = ["applied", "responded", "interview", "offer", "hired"];

/** Self-contained printable report. ?range=week:YYYY-MM-DD|30|90|all, ?format=html|md */
export async function GET(req: NextRequest) {
  const { t, locale } = await getDict();
  const r = t.apply2.reports;
  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp.get("range"));
  const format = sp.get("format") === "md" ? "md" : "html";
  const data = loadReportsData();
  const apps = filterApps(data.apps, range);
  const digest = weeklyDigest(range.week ?? localDate(new Date()), data);
  const o = t.apply2.outcome.outcomes;
  const date = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T00:00` : s).toLocaleDateString(locale === "fr" ? "fr-TN" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

  const sent = apps.filter((a) => a.applied_at || FUNNEL.includes(a.status));
  const responded = sent.filter((a) => ["responded", "interview", "offer", "hired", "rejected"].includes(a.status) || a.outcome === "rejected");
  const scores = apps.map((a) => a.score).filter((s): s is number => s !== null);
  const appIds = new Set(apps.map((a) => a.id));
  const label = new Map(apps.map((a) => [a.id, a.job]));
  const interviews = data.interviews
    .filter((i) => appIds.has(i.application_id) && (!range.from || (toLocalDay(i.starts_at)! >= range.from && toLocalDay(i.starts_at)! <= range.to!)))
    .map((i) => ({ when: date(i.starts_at), kind: t.apps2.interviews.kinds[i.kind as keyof typeof t.apps2.interviews.kinds] ?? i.kind, title: label.get(i.application_id)!.title, company: label.get(i.application_id)!.company, outcome: i.outcome }));

  const subtitle =
    range.kind === "week" ? fmt(r.report.range.week, { from: date(range.from), to: date(range.to) }) : range.kind === "days" ? fmt(r.report.range.days, { n: sp.get("range")! }) : r.report.range.all;
  const rd: ReportData = {
    title: r.report.title,
    subtitle,
    generated: fmt(r.report.generated, { d: date(new Date().toISOString()) }),
    owner: ownerName(),
    kpis: [
      { label: r.report.kpi.apps, value: apps.length },
      { label: r.report.kpi.applied, value: sent.length },
      { label: r.report.kpi.responseRate, value: sent.length ? `${Math.round((responded.length / sent.length) * 100)}%` : "—" },
      { label: r.report.kpi.interviews, value: interviews.length },
      { label: r.report.kpi.offers, value: apps.filter((a) => a.status === "offer" || a.status === "hired" || a.outcome === "offer").length },
      { label: r.report.kpi.avgScore, value: scores.length ? (scores.reduce((s, x) => s + x, 0) / scores.length).toFixed(1) : "—", hint: r.report.indicative },
    ],
    funnel: [{ label: t.states.evaluated, count: apps.length }, ...FUNNEL.map((s, i) => ({ label: t.states[s], count: apps.filter((a) => FUNNEL.indexOf(a.status) >= i).length }))],
    rows: apps.map((a) => ({
      id: a.id,
      title: a.job.title,
      company: a.job.company,
      type: t.jobTypes[a.type as JobType] ?? a.type,
      status: a.status,
      statusLabel: t.states[a.status],
      score: a.score,
      verdict: a.verdict ? t.verdicts[a.verdict as keyof typeof t.verdicts] : "",
      created_at: a.created_at,
      applied_at: a.applied_at ? date(a.applied_at) : null,
      deadline: a.job.deadline ? date(a.job.deadline) : null,
      channel: a.channel ?? "",
      outcome: a.outcome ? o[a.outcome] : "",
      lesson: a.lesson,
    })),
    interviews,
    lessons: apps.filter((a) => a.lesson.trim()).map((a) => ({ title: a.job.title, company: a.job.company, outcome: a.outcome ? o[a.outcome] : "", lesson: a.lesson })),
    focus: [
      ...digest.focus.map((f) => fmt(r.focusKeys[f.key], f.vars)),
      ...digest.silent.map((s) => `${t.insights2.calib.silent}: ${s.company} — ${s.title} (${fmt(t.insights2.calib.silentDays, { n: s.days })})`),
      ...(digest.calibration.n ? [`${t.insights2.calib.title}: ${fmt(t.insights2.calib.verdicts[digest.calibration.verdict], { min: CALIBRATION_MIN_N })} · ${fmt(t.insights2.calib.basedOn, { n: digest.calibration.n })}`] : []),
    ],
    labels: {
      kpis: r.report.kpis,
      funnel: r.report.funnel,
      applications: r.report.applications,
      interviews: r.report.interviews,
      lessons: r.report.lessons,
      focus: r.report.focus,
      none: r.none,
      col: r.col,
      footer: r.report.footer,
    },
  };
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "md") {
    return new Response(reportMarkdown(rd), {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="khedma-report-${stamp}.md"`, "cache-control": "no-store" },
    });
  }
  return new Response(reportHtml(rd), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

