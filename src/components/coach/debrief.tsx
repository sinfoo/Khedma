"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { DEBRIEF_ROUNDS, RATINGS, type DebriefRound, type Rating } from "@/lib/ai/debrief";
import { parseTranscript, ratingFor, scoreAnswer, type SessionQuestion } from "@/lib/coach/logic";
import { deleteDebriefAction, saveDebrief } from "@/app/actions/coach";

export interface DebriefAppOption {
  id: number;
  title: string;
  company: string;
  interviews: { id: number; starts_at: string; kind: string }[];
}

interface Q {
  question: string;
  rating: Rating;
  notes: string;
  competency: string;
}

// ponytail: keyword guess of the question type; the rubric only needs it to pick STAR vs definition/example checks
const guessType = (q: string): SessionQuestion["type"] =>
  /tell me about a time|give (?:me )?an example|describe a situation|racontez|un exemple|décrivez une situation|une fois où/i.test(q)
    ? "behavioral"
    : /what is|what's the difference|explain|how does|how would you implement|qu['’]est-ce|différence|expliquez|comment fonctionne|comment implémenter/i.test(q)
      ? "technical"
      : /what would you do|que feriez-vous|imagine/i.test(q)
        ? "situational"
        : "motivation";

const RATING_UI: Record<Rating, { glyph: string; cls: string }> = {
  red: { glyph: "🔴", cls: "has-[:checked]:border-danger has-[:checked]:bg-danger-soft" },
  yellow: { glyph: "🟡", cls: "has-[:checked]:border-saffron has-[:checked]:bg-saffron-soft" },
  green: { glyph: "✅", cls: "has-[:checked]:border-success has-[:checked]:bg-success-soft" },
};

export function DebriefForm({ apps, preselect, round: initialRound }: { apps: DebriefAppOption[]; preselect: number | null; round: DebriefRound | null }) {
  const { t } = useT();
  const d = t.coach2.debrief;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [appId, setAppId] = useState<number | "">(preselect ?? "");
  const [interviewId, setInterviewId] = useState<number | "">("");
  const [round, setRound] = useState<DebriefRound | "">(initialRound ?? "");
  const [interviewer, setInterviewer] = useState("");
  const [outcome, setOutcome] = useState<"pending" | "forward" | "rejected">("pending");
  const [competencies, setCompetencies] = useState("");
  const [qs, setQs] = useState<Q[]>([{ question: "", rating: "yellow", notes: "", competency: "" }]);
  const [retracted, setRetracted] = useState<string[]>([]);
  const [transcript, setTranscript] = useState("");

  const importTranscript = () => {
    const turns = parseTranscript(transcript).slice(0, 20);
    if (!turns.length) return toast.error(d.importNone);
    setQs(
      turns.map(({ question, answer }) => {
        const r = scoreAnswer({ answer, question: { text: question, type: guessType(question), hints: [] } });
        return { question: question.slice(0, 400), rating: ratingFor(r.overall), notes: `${fmt(d.score, { s: r.overall.toFixed(1) })} — ${answer}`.slice(0, 1500), competency: "" };
      }),
    );
    toast.success(fmt(d.imported, { n: turns.length }));
  };
  const app = apps.find((a) => a.id === appId);
  const valid = !!round && qs.some((q) => q.question.trim());

  const setQ = (i: number, patch: Partial<Q>) => setQs((xs) => xs.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return toast.error(d.invalid);
    start(async () => {
      const r = await saveDebrief({
        application: appId || null,
        interview: interviewId || null,
        round,
        interviewer,
        outcome,
        competencies: competencies.split(",").map((s) => s.trim()).filter(Boolean),
        questions: qs.filter((q) => q.question.trim()),
        retracted: retracted.map((s) => s.trim()).filter(Boolean),
      });
      if (!r.id) return toast.error(t.common.error, d.invalid);
      toast.success(d.saved, r.drilled ? fmt(d.drilled, { n: r.drilled }) : undefined);
      router.push(`/app/coach/debrief/${r.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
      <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-label={d.heading}>
        <div>
          <label className="label" htmlFor="db-app">{d.application}</label>
          <select
            id="db-app"
            className="input"
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value ? Number(e.target.value) : "");
              setInterviewId("");
            }}
          >
            <option value="">{d.noApplication}</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.company} — {a.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="db-iv">{d.interview}</label>
          <select id="db-iv" className="input" value={interviewId} disabled={!app?.interviews.length} onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : "";
            setInterviewId(id);
            const iv = app?.interviews.find((x) => x.id === id);
            if (iv && DEBRIEF_ROUNDS.includes(iv.kind as DebriefRound)) setRound(iv.kind as DebriefRound);
          }}>
            <option value="">{d.noInterview}</option>
            {app?.interviews.map((iv) => (
              <option key={iv.id} value={iv.id}>{iv.starts_at.replace("T", " ")} · {t.apps2.interviews.kinds[iv.kind as keyof typeof t.apps2.interviews.kinds] ?? iv.kind}</option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">{d.round} <span aria-hidden="true" className="text-danger">*</span></legend>
          <div className="flex flex-wrap gap-1.5">
            {DEBRIEF_ROUNDS.map((r) => (
              <label key={r} className="chip cursor-pointer !px-3 !py-1 text-sm has-[:checked]:chip-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid]">
                <input type="radio" name="round" value={r} className="sr-only" checked={round === r} onChange={() => setRound(r)} required />
                {d.rounds[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="db-who">{d.interviewer}</label>
          <input id="db-who" className="input" maxLength={120} value={interviewer} onChange={(e) => setInterviewer(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="db-out">{d.outcome}</label>
          <select id="db-out" className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            {(["pending", "forward", "rejected"] as const).map((o) => <option key={o} value={o}>{d.outcomes[o]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="db-comp">{d.competencies}</label>
          <input id="db-comp" className="input" maxLength={300} value={competencies} onChange={(e) => setCompetencies(e.target.value)} aria-describedby="db-comp-h" />
          <p id="db-comp-h" className="hint mt-1">{d.competenciesHint}</p>
        </div>
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer font-medium">{d.transcript}</summary>
        <p id="db-tr-h" className="hint mt-2">{d.transcriptHint}</p>
        <label className="sr-only" htmlFor="db-tr">{d.transcript}</label>
        <textarea id="db-tr" className="input mt-3 !min-h-40" maxLength={30000} value={transcript} placeholder={d.transcriptPh} aria-describedby="db-tr-h" onChange={(e) => setTranscript(e.target.value)} />
        <button type="button" className="btn btn-secondary btn-sm mt-3" disabled={!transcript.trim()} onClick={importTranscript}>
          {d.importTranscript}
        </button>
      </details>

      <section aria-labelledby="db-q-h">
        <h2 id="db-q-h" className="mb-3 text-lg">{d.questions}</h2>
        <ol className="space-y-3">
          {qs.map((q, i) => (
            <li key={i} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="mono mt-2 text-xs text-muted tabular">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <label className="label" htmlFor={`q-${i}`}>{fmt(d.question, { n: i + 1 })}</label>
                    <input id={`q-${i}`} className="input" maxLength={400} value={q.question} placeholder={d.questionPh} onChange={(e) => setQ(i, { question: e.target.value })} />
                  </div>
                  <fieldset>
                    <legend className="label">{d.rating}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {RATINGS.map((r) => (
                        <label key={r} className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm transition-colors hover:border-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] has-[:focus-visible]:[outline-style:solid] ${RATING_UI[r].cls}`}>
                          <input type="radio" name={`rating-${i}`} value={r} className="sr-only" checked={q.rating === r} onChange={() => setQ(i, { rating: r })} />
                          <span aria-hidden="true">{RATING_UI[r].glyph}</span> {d.ratings[r]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                    <div>
                      <label className="label" htmlFor={`n-${i}`}>{d.notes}</label>
                      <textarea id={`n-${i}`} className="input !min-h-20" maxLength={1500} value={q.notes} onChange={(e) => setQ(i, { notes: e.target.value })} />
                    </div>
                    <div>
                      <label className="label" htmlFor={`c-${i}`}>{d.competency}</label>
                      <input id={`c-${i}`} className="input" maxLength={40} value={q.competency} onChange={(e) => setQ(i, { competency: e.target.value })} />
                    </div>
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={fmt(d.removeQuestion, { n: i + 1 })} disabled={qs.length === 1} onClick={() => setQs((xs) => xs.filter((_, k) => k !== i))}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-secondary btn-sm mt-3" disabled={qs.length >= 20} onClick={() => setQs((xs) => [...xs, { question: "", rating: "yellow", notes: "", competency: "" }])}>
          <Plus size={14} aria-hidden="true" /> {d.addQuestion}
        </button>
      </section>

      <section className="card p-5" aria-labelledby="db-r-h">
        <h2 id="db-r-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{d.retracted}</h2>
        <p className="hint mt-1">{d.retractedHint}</p>
        <ul className="mt-3 space-y-2">
          {retracted.map((r, i) => (
            <li key={i} className="flex gap-2">
              <label className="sr-only" htmlFor={`rt-${i}`}>{d.retracted} {i + 1}</label>
              <input id={`rt-${i}`} className="input" maxLength={200} value={r} placeholder={d.retractedPh} onChange={(e) => setRetracted((xs) => xs.map((x, k) => (k === i ? e.target.value : x)))} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`${t.common.delete} ${i + 1}`} onClick={() => setRetracted((xs) => xs.filter((_, k) => k !== i))}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={retracted.length >= 10} onClick={() => setRetracted((xs) => [...xs, ""])}>
          <Plus size={14} aria-hidden="true" /> {d.addRetracted}
        </button>
      </section>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending || !valid} aria-busy={pending}>
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {pending ? d.submitting : d.submit}
        </button>
      </div>
    </form>
  );
}

export function DeleteDebrief({ id }: { id: number }) {
  const { t } = useT();
  const d = t.coach2.debrief;
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={pending} onClick={() => window.confirm(d.removeConfirm) && start(() => deleteDebriefAction(id))}>
      <Trash2 size={14} aria-hidden="true" /> {d.remove}
    </button>
  );
}
