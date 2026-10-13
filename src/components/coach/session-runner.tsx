"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Lightbulb, Loader2, Mic, MicOff, Pause, Play, RotateCcw, Send, SkipForward, Square, Volume2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Progress } from "@/components/kit";
import { EngineChip, ScoreRing, scoreLabel } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { DimBars } from "@/components/coach/parts";
import { endSession, skipQuestion } from "@/app/actions/coach";
import type { Lang } from "@/lib/coach/bank";
import type { Scores, SessionQuestion } from "@/lib/coach/logic";

export interface RunnerAnswer {
  answer: string;
  skipped: boolean;
  scores: Scores | null;
  overall: number | null;
  feedback: string;
  engine: string;
  seconds: number;
}

// ---------- browser speech capabilities (absent on the server and in some browsers) ----------
interface SpeechResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noop = () => () => {};
const useClientFlag = (get: () => boolean) => useSyncExternalStore(noop, get, () => false);

const TARGET: Record<SessionQuestion["type"], number> = { behavioral: 150, situational: 120, technical: 120, motivation: 90, culture: 90 };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function SessionRunner({
  sessionId,
  lang,
  questions,
  initial,
  stories,
}: {
  sessionId: number;
  lang: Lang;
  questions: SessionQuestion[];
  initial: Record<number, RunnerAnswer>;
  stories: Record<number, { id: number; title: string }>;
}) {
  const { t } = useT();
  const c = t.coach2;
  const s = c.session;
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<number, RunnerAnswer>>(initial);
  const firstOpen = questions.findIndex((_, i) => !initial[i]);
  const [idx, setIdx] = useState(firstOpen === -1 ? questions.length - 1 : firstOpen);
  const [retrying, setRetrying] = useState(false);
  const [draft, setDraft] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pending, start] = useTransition();
  const recRef = useRef<Recognition | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const turnRef = useRef<HTMLLIElement>(null);

  const canListen = useClientFlag(() => recognitionCtor() !== null);
  const canSpeak = useClientFlag(() => typeof window !== "undefined" && "speechSynthesis" in window);

  const q = questions[idx];
  const current = answers[idx];
  const composing = !current || retrying;
  const isLast = idx === questions.length - 1;
  const doneCount = Object.keys(answers).length;
  const target = TARGET[q.type];

  // Per-question timer: ticks only while composing and not paused.
  useEffect(() => {
    if (!composing || !running || streaming) return;
    const id = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [composing, running, streaming]);

  // Stop speech and dictation when leaving the page.
  useEffect(
    () => () => {
      recRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );


  function stopVoice() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function goTo(i: number) {
    stopVoice();
    setIdx(i);
    setRetrying(false);
    setDraft("");
    setShowHints(false);
    setSeconds(0);
    setRunning(true);
    setStatus("");
    // Bring the new question into view once it has rendered.
    requestAnimationFrame(() =>
      turnRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }),
    );
  }

  function toggleSpeak() {
    if (!canSpeak) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(q.text);
    u.lang = lang === "fr" ? "fr-FR" : "en-US";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang === "fr" ? "fr-FR" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    const base = draft.trim();
    rec.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setDraft(base ? `${base} ${said.trim()}` : said.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") toast.error(fmt(s.micError, { e: e.error }));
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      toast.error(fmt(s.micError, { e: (err as Error).message }));
    }
  }

  async function submit() {
    const text = draft.trim();
    if (wordCount(text) < 2) {
      toast.info(s.empty);
      areaRef.current?.focus();
      return;
    }
    stopVoice();
    const at = idx;
    setStreaming(true);
    setRetrying(false);
    setStatus(s.analysing);
    setAnswers((a) => ({ ...a, [at]: { answer: text, skipped: false, scores: null, overall: null, feedback: "", engine: "", seconds } }));
    try {
      const r = await fetch("/api/coach/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, idx: at, answer: text, seconds }),
      });
      if (!r.ok || !r.body) {
        const msg = await r.json().then((j: { error?: string }) => j.error).catch(() => null);
        throw new Error(msg ?? `HTTP ${r.status}`);
      }
      const sc = JSON.parse(r.headers.get("x-coach-score") ?? "null") as (Scores & { overall: number }) | null;
      const engine = r.headers.get("x-engine") ?? "heuristic";
      setAnswers((a) => ({ ...a, [at]: { ...a[at], scores: sc, overall: sc?.overall ?? null, engine } }));
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setAnswers((a) => ({ ...a, [at]: { ...a[at], feedback: a[at].feedback + chunk } }));
      }
      setStatus(sc ? `${s.score}: ${scoreLabel(t, sc.overall)}` : "");
    } catch (e) {
      setStatus("");
      toast.error(fmt(s.error, { e: (e as Error).message }));
      setAnswers((a) => {
        const copy = { ...a };
        delete copy[at];
        return copy;
      });
      setDraft(text);
    } finally {
      setStreaming(false);
    }
  }

  function skip() {
    const at = idx;
    start(async () => {
      await skipQuestion(sessionId, at);
      setAnswers((a) => ({ ...a, [at]: { answer: "", skipped: true, scores: null, overall: null, feedback: "", engine: "", seconds: 0 } }));
      if (!isLast) goTo(at + 1);
    });
  }

  function finish(confirmFirst: boolean) {
    if (confirmFirst && !window.confirm(s.endConfirm)) return;
    stopVoice();
    start(async () => {
      await endSession(sessionId);
    });
  }

  const overtime = seconds > target;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <p className="sr-only" aria-live="polite">{status}</p>

      <ol className="min-w-0 space-y-6" aria-label={s.progress}>
        {questions.slice(0, idx + 1).map((qq, i) => {
          const a = answers[i];
          const active = i === idx;
          if (!active && !a) return null;
          return (
            <li key={i} ref={active ? turnRef : undefined} className="scroll-mt-24 space-y-3 fade">
              {/* interviewer */}
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-bg">
                  {i + 1}
                </span>
                <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-3 ${active ? "border-line-strong bg-surface shadow-[var(--shadow)]" : "border-line bg-surface-2"}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-semibold text-ink-2">{s.interviewer}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmt(s.questionOf, { i: i + 1, n: questions.length })}</span>
                    <span className="chip">{c.types[qq.type]}</span>
                    {qq.source === "posting" && <span className="chip chip-accent">{s.fromPosting}</span>}
                  </div>
                  <h2 className={`${active ? "text-lg" : "text-base"} leading-snug`} style={{ fontFamily: "var(--font-sans)", letterSpacing: 0, fontWeight: 600 }}>
                    {qq.text}
                  </h2>
                  {active && (
                    <div className="mt-2 flex flex-wrap gap-1.5 no-print">
                      {canSpeak && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSpeak} aria-pressed={speaking}>
                          {speaking ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
                          {speaking ? s.stopReading : s.readAloud}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHints((v) => !v)} aria-expanded={showHints} aria-controls={`hints-${i}`}>
                        <Lightbulb size={14} aria-hidden="true" />
                        {showHints ? s.hideHints : s.hints}
                      </button>
                    </div>
                  )}
                  {(active ? showHints : false) && (
                    <ul id={`hints-${i}`} className="mt-2 space-y-1 rounded-xl bg-saffron-soft px-3 py-2.5 text-sm text-ink-2">
                      {qq.hints.map((h) => (
                        <li key={h} className="flex gap-2">
                          <span aria-hidden="true" className="text-saffron">→</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* answer */}
              {a && !(active && retrying) && (
                <div className="flex justify-end">
                  <div className={`max-w-[92%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm ${a.skipped ? "border border-dashed border-line-strong text-muted" : "bg-accent-soft text-ink"}`}>
                    <p className="mb-1 text-xs font-semibold text-accent-text">{s.you}</p>
                    {a.skipped ? <p className="italic">{s.skipped}</p> : <p className="whitespace-pre-wrap">{a.answer}</p>}
                  </div>
                </div>
              )}

              {/* feedback */}
              {a && !a.skipped && !(active && retrying) && (
                <section aria-labelledby={`fb-${i}`} className="card ml-0 p-4 sm:ml-11">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`fb-${i}`} className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
                      {s.feedback}
                    </h3>
                    <div className="flex items-center gap-2">
                      {a.engine && <EngineChip engine={a.engine} t={t} />}
                      {a.overall !== null && <ScoreRing value={a.overall} size={44} label={scoreLabel(t, a.overall)} />}
                    </div>
                  </div>
                  {a.scores ? <DimBars scores={a.scores} t={t} /> : <div className="skeleton h-16" />}
                  <div className="mt-4 border-t border-line pt-3 text-sm" aria-busy={active && streaming}>
                    {a.feedback ? (
                      <Markdown>{a.feedback}</Markdown>
                    ) : (
                      <p className="flex items-center gap-2 text-muted">
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {s.analysing}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* composer */}
              {active && composing && (
                <div className="ml-0 sm:ml-11 no-print">
                  <label htmlFor="coach-answer" className="label">{s.answerLabel}</label>
                  <div className={`mt-1.5 rounded-2xl border bg-surface transition-colors ${listening ? "border-danger" : "border-line-strong"} focus-within:border-accent`}>
                    <textarea
                      id="coach-answer"
                      ref={areaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                      rows={7}
                      placeholder={s.placeholder}
                      aria-describedby="coach-answer-meta"
                      className="block w-full resize-y rounded-t-2xl bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed outline-none"
                      disabled={streaming}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
                      <div className="flex items-center gap-2">
                        {canListen && (
                          <button
                            type="button"
                            onClick={toggleMic}
                            aria-pressed={listening}
                            className={`btn btn-sm ${listening ? "btn-danger" : "btn-ghost"}`}
                            disabled={streaming}
                          >
                            {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
                            {listening ? s.micStop : s.micStart}
                          </button>
                        )}
                        {listening && (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-danger" role="status">
                            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-danger" />
                            {s.listening}
                          </span>
                        )}
                      </div>
                      <span id="coach-answer-meta" className="text-xs text-muted tabular">
                        {fmt(s.words, { n: wordCount(draft) })} · <kbd className="kbd">{s.submitHint}</kbd>
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={streaming || pending}>
                      {streaming ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                      {s.submit}
                    </button>
                    {!retrying && (
                      <button type="button" className="btn btn-ghost" onClick={skip} disabled={streaming || pending}>
                        <SkipForward size={16} aria-hidden="true" /> {s.skip}
                      </button>
                    )}
                    {retrying && (
                      <button type="button" className="btn btn-ghost" onClick={() => { setRetrying(false); setDraft(""); }}>
                        {t.common.cancel}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* after answering */}
              {active && !composing && !streaming && (
                <div className="ml-0 flex flex-wrap gap-2 sm:ml-11 no-print">
                  {isLast ? (
                    <button type="button" className="btn btn-primary" onClick={() => finish(false)} disabled={pending}>
                      {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                      {s.finish}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => goTo(idx + 1)}>
                      {s.next} <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setRetrying(true);
                      setDraft(current?.answer ?? "");
                      setSeconds(0);
                      setRunning(true);
                      requestAnimationFrame(() => areaRef.current?.focus());
                    }}
                  >
                    <RotateCcw size={16} aria-hidden="true" /> {s.retry}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <aside className="space-y-4 lg:sticky lg:top-20 no-print">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{s.progress}</span>
            <span className="mono">{doneCount}/{questions.length}</span>
          </div>
          <Progress value={doneCount} max={questions.length} label={s.progress} />
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {questions.map((qq, i) => {
              const a = answers[i];
              const reachable = i === idx || !!a || i === questions.findIndex((_, k) => !answers[k]);
              const tone = a?.skipped ? "bg-surface-3 text-muted" : a?.overall != null ? (a.overall >= 3.5 ? "bg-success-soft text-success" : a.overall >= 2.5 ? "bg-saffron-soft text-saffron" : "bg-danger-soft text-danger") : "bg-surface-2 text-muted";
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!reachable || streaming}
                    onClick={() => goTo(i)}
                    aria-current={i === idx ? "step" : undefined}
                    aria-label={`${fmt(s.questionOf, { i: i + 1, n: questions.length })}${a?.skipped ? ` — ${s.skipped}` : a?.overall != null ? ` — ${scoreLabel(t, a.overall)}` : ""}`}
                    className={`mono grid size-7 place-items-center rounded-md text-xs font-semibold transition-shadow disabled:opacity-40 ${tone} ${i === idx ? "ring-2 ring-accent ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
                  >
                    {a?.overall != null ? a.overall.toFixed(0) : i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="card p-4" role="group" aria-label={s.timer}>
          <p className="text-xs text-muted">{s.timer}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className={`display text-3xl tabular ${overtime ? "text-danger" : ""}`} role="timer" aria-live="off">
              {mmss(seconds)}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-icon btn-sm"
              onClick={() => setRunning((r) => !r)}
              aria-label={running ? s.pause : s.resumeTimer}
              aria-pressed={!running}
              disabled={!composing || streaming}
            >
              {running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
            </button>
          </div>
          <div className="mt-2">
            <Progress value={Math.min(seconds, target)} max={target} label={fmt(s.target, { t: mmss(target) })} tone={overtime ? "danger" : seconds > target * 0.8 ? "saffron" : "accent"} />
          </div>
          <p className={`mt-1.5 text-xs ${overtime ? "font-medium text-danger" : "text-muted"}`}>{overtime ? s.overtime : fmt(s.target, { t: mmss(target) })}</p>
        </div>

        {stories[idx] && (
          <div className="card border-accent/40 bg-accent-soft p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-text">
              <BookOpen size={14} aria-hidden="true" /> {s.story}
            </p>
            <p className="mt-1 text-sm font-medium">{stories[idx].title}</p>
            <Link href={`/app/coach/stories#story-${stories[idx].id}`} target="_blank" className="mt-2 inline-flex text-sm font-semibold text-accent-text underline underline-offset-2">
              {s.openStory}
            </Link>
          </div>
        )}

        <button type="button" className="btn btn-ghost w-full text-danger" onClick={() => finish(doneCount < questions.length)} disabled={pending || streaming}>
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
          {s.end}
        </button>
      </aside>
    </div>
  );
}
