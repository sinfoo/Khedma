import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Zap } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getDebrief } from "@/lib/repo/coach";
import { PageHeader } from "@/components/kit";
import { EngineChip, fmtDate } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { DeleteDebrief } from "@/components/coach/debrief";

export const metadata: Metadata = { title: "Debrief" };

const GLYPH = { red: "🔴", yellow: "🟡", green: "✅" } as const;

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const r = Number.isInteger(id) && id > 0 ? getDebrief(id) : null;
  if (!r) notFound();
  const { t, locale } = await getDict();
  const d = t.coach2.debrief;
  const red = r.questions.filter((q) => q.rating === "red");

  return (
    <>
      <PageHeader
        eyebrow={`${d.rounds[r.round]} · ${fmtDate(r.created_at, locale)}`}
        title={r.company ? `${r.company} — ${r.role}` : d.heading}
        lead={[r.interviewer, d.outcomes[r.outcome], fmt(d.stats, { q: r.questions.length, r: red.length })].filter(Boolean).join(" · ")}
        back={{ href: "/app/coach/debrief", label: d.back }}
        actions={
          <>
            {r.application_id && <Link href={`/app/pipeline/${r.application_id}?tab=interviews`} className="btn btn-secondary btn-sm">{d.application}</Link>}
            <Link href="/app/coach/drill" className="btn btn-saffron btn-sm"><Zap size={14} aria-hidden="true" /> {d.openDrill}</Link>
            <DeleteDebrief id={r.id} />
          </>
        }
      />
      {r.competencies.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-1.5" aria-label={d.competencies}>
          {r.competencies.map((c) => <li key={c} className="chip">{c}</li>)}
        </ul>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <section className="card p-5 rise" style={{ ["--i" as string]: 1 }} aria-labelledby="fb-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="fb-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.feedback}</h2>
            <EngineChip engine={r.engine} t={t} />
          </div>
          <div className="prose-doc mt-3"><Markdown>{r.feedback}</Markdown></div>
        </section>
        <div className="space-y-5 rise" style={{ ["--i" as string]: 2 }}>
          <section className="card p-5" aria-labelledby="qs-h">
            <h2 id="qs-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.questions}</h2>
            <ol className="mt-3 space-y-3">
              {r.questions.map((q, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <p className="text-sm font-medium"><span aria-hidden="true">{GLYPH[q.rating]}</span> <span className="sr-only">{d.ratings[q.rating]}:</span> {q.question}</p>
                  {(q.competency || q.notes) && (
                    <p className="mt-0.5 text-xs text-muted">{[q.competency, q.notes].filter(Boolean).join(" · ")}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <section className="card p-5" aria-labelledby="gap-h">
            <h2 id="gap-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.gaps}</h2>
            {red.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">{red.map((q, i) => <li key={i}>{q.question}</li>)}</ul>
            ) : (
              <p className="mt-2 text-sm text-muted">{d.noGaps}</p>
            )}
          </section>
          {r.retracted.length > 0 && (
            <section className="card p-5" aria-labelledby="rt-h">
              <h2 id="rt-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.retracted}</h2>
              <ul className="mt-3 space-y-1 text-sm text-ink-2">{r.retracted.map((x, i) => <li key={i} className="line-through decoration-danger">{x}</li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
