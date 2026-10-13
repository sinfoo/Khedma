import Link from "next/link";
import { Plus } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";
import { aggregate, DIMS, tipText } from "@/lib/coach/logic";
import type { CoachAnswer, CoachSession } from "@/lib/repo/coach";
import { Section } from "@/components/kit";
import { EngineChip, ScoreRing, fmtDate, scoreLabel } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { DimBars, DimRadar } from "@/components/coach/parts";
import { ReportActions } from "@/components/coach/report-actions";

function reportMarkdown(session: CoachSession, answers: CoachAnswer[], t: Dict, locale: Locale) {
  const c = t.coach2;
  const agg = aggregate(answers);
  const byIdx = new Map(answers.map((a) => [a.idx, a]));
  const lines = [
    `# ${c.report.heading} — ${session.title || c.tracks[session.track]}`,
    "",
    `${c.kinds[session.kind]} · ${c.langs[session.lang]} · ${fmtDate(session.created_at, locale)}`,
    "",
    `**${c.report.overall}:** ${agg.overall === null ? "—" : `${agg.overall.toFixed(1)}/5`}`,
    "",
    `| ${c.report.dimension} | ${c.report.average} |`,
    "|---|---|",
    ...DIMS.map((d) => `| ${c.dims[d]} | ${agg.dims[d].toFixed(1)} |`),
    "",
    `## ${c.report.improvements}`,
    ...(agg.improvements.length ? agg.improvements.map((tip, i) => `${i + 1}. ${tipText(tip, locale)}`) : [c.report.noImprovements]),
    "",
    `## ${c.report.answers}`,
  ];
  session.questions.forEach((q, i) => {
    const a = byIdx.get(i);
    lines.push("", `### ${i + 1}. ${q.text}`, "");
    if (!a || a.skipped) lines.push(`_${a?.skipped ? c.session.skipped : c.report.noAnswer}_`);
    else {
      lines.push(`**${c.session.score}:** ${a.overall?.toFixed(1) ?? "—"}/5`, "", ...a.answer.split("\n").map((l) => `> ${l}`), "", a.feedback);
    }
  });
  return lines.join("\n");
}

export function Report({ session, answers, t, locale }: { session: CoachSession; answers: CoachAnswer[]; t: Dict; locale: Locale }) {
  const c = t.coach2;
  const r = c.report;
  const agg = aggregate(answers);
  const byIdx = new Map(answers.map((a) => [a.idx, a]));
  const highlight = (label: string, idx: number | undefined, tone: string) => {
    const a = idx === undefined ? undefined : byIdx.get(idx);
    if (!a || idx === undefined || a.overall === null) return null;
    return (
      <a href={`#answer-${idx}`} className="card card-hover flex items-start gap-3 p-4">
        <ScoreRing value={a.overall} size={48} label={scoreLabel(t, a.overall)} />
        <span className="min-w-0">
          <span className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</span>
          <span className="mt-0.5 block text-sm font-medium leading-snug">{session.questions[idx]?.text}</span>
          <span className="mt-1 line-clamp-2 block text-xs text-muted">{a.answer}</span>
        </span>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 no-print">
        <Link href="/app/coach" className="btn btn-primary">
          <Plus size={16} aria-hidden="true" /> {r.again}
        </Link>
        <ReportActions sessionId={session.id} markdown={reportMarkdown(session, answers, t, locale)} filename={`khedma-interview-${session.id}.md`} />
      </div>

      {agg.overall === null ? (
        <Section i={1}>
          <p className="text-muted">{r.noScored}</p>
        </Section>
      ) : (
        <>
          <section className="card grid gap-6 p-5 rise md:grid-cols-[180px_1fr]" aria-labelledby="rep-overall" style={{ ["--i" as string]: 1 }}>
            <div className="flex flex-col items-center justify-center gap-2 text-center md:border-r md:border-line md:pr-6">
              <h2 id="rep-overall" className="text-sm font-semibold text-muted" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
                {r.overall}
              </h2>
              <ScoreRing value={agg.overall} size={104} label={scoreLabel(t, agg.overall)} />
              <p className="text-xs text-muted">{fmt(r.stats, { a: agg.answered, s: agg.skipped })}</p>
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{r.chart}</h2>
              <DimRadar scores={agg.dims} t={t} />
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {highlight(r.best, agg.best?.idx, "text-success")}
            {highlight(r.worst, agg.worst?.idx, "text-saffron")}
          </div>

          <Section id="rep-improve" title={r.improvements} i={2}>
            {agg.improvements.length ? (
              <ol className="space-y-2.5">
                {agg.improvements.map((tip, i) => (
                  <li key={tip.code} className="flex gap-3">
                    <span aria-hidden="true" className="display grid size-7 shrink-0 place-items-center rounded-lg bg-saffron-soft text-sm text-saffron">{i + 1}</span>
                    <span className="text-sm">
                      {tipText(tip, locale)}
                      <span className="block text-xs text-muted">{fmt(r.seenIn, { n: tip.n })}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">{r.noImprovements}</p>
            )}
          </Section>
        </>
      )}

      <section aria-labelledby="rep-all" className="space-y-4">
        <h2 id="rep-all" className="text-xl">{r.answers}</h2>
        <ol className="space-y-4">
          {session.questions.map((q, i) => {
            const a = byIdx.get(i);
            return (
              <li key={i} id={`answer-${i}`} className="card scroll-mt-24 p-5" style={{ breakInside: "avoid" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="mono">{i + 1}</span>
                      <span className="chip">{c.types[q.type]}</span>
                      {q.source === "posting" && <span className="chip chip-accent">{c.session.fromPosting}</span>}
                      {a && !a.skipped && a.seconds > 0 && <span className="mono">{fmt(r.duration, { s: a.seconds })}</span>}
                    </p>
                    <h3 className="text-base font-semibold leading-snug" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{q.text}</h3>
                  </div>
                  {a?.overall != null && <ScoreRing value={a.overall} size={44} label={scoreLabel(t, a.overall)} animate={false} />}
                </div>
                {!a || a.skipped ? (
                  <p className="mt-3 text-sm italic text-muted">{a?.skipped ? c.session.skipped : r.noAnswer}</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    <blockquote className="whitespace-pre-wrap rounded-xl bg-accent-soft px-4 py-3 text-sm">{a.answer}</blockquote>
                    {a.scores && <DimBars scores={a.scores} t={t} />}
                    {a.feedback && (
                      <div className="border-t border-line pt-3 text-sm">
                        {a.engine && <div className="mb-2"><EngineChip engine={a.engine} t={t} /></div>}
                        <Markdown>{a.feedback}</Markdown>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
