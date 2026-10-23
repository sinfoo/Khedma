"use client";

import { useState } from "react";
import { ClipboardPaste, FileUp, Loader2, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { EngineChip } from "@/components/ui";
import { useToast } from "@/components/kit/toast";
import { APP_STATES, INTERVIEW_KINDS } from "@/lib/types";
import type { ReplyResult } from "@/lib/apps/reply";
import { applyReply, classifyReply } from "@/app/actions/applications";
import { useRun } from "./use-run";
import { MAX_EML_BYTES, MAX_MBOX_BYTES, emailText, parseEml, parseMbox, type Parsed } from "@/lib/apps/mail";
import { fmt } from "@/lib/i18n/dict";

type Res = ReplyResult & { engine: string };
const KIND_CLS: Record<ReplyResult["kind"], string> = { interview: "chip-saffron", offer: "chip-success", rejected: "chip-danger", responded: "chip-accent", noise: "" };

/** Paste a reply → classification card → apply (stage move, interview, timeline). */
export function ReplyClassifier({ id, currentStatus }: { id: number; currentStatus: string }) {
  const { t, locale } = useT();
  const r = t.apps2.reply;
  const toast = useToast();
  const [text, setText] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [stage, setStage] = useState<string>("");
  const [ex, setEx] = useState({ date: "", time: "", link: "", interviewer: "", round: "" });
  const [classifying, runClassify] = useRun();
  const [applying, runApply] = useRun();

  const classify = () =>
    runClassify(() => classifyReply(id, text), undefined, ({ result }) => {
      setRes(result);
      setStage(result.suggested_stage && result.suggested_stage !== currentStatus ? result.suggested_stage : "");
      setEx({ date: result.extracted.date ?? "", time: result.extracted.time ?? "", link: result.extracted.link ?? "", interviewer: result.extracted.interviewer ?? "", round: result.extracted.round ?? "" });
    });

  const apply = () =>
    res &&
    runApply(
      () => applyReply(id, { kind: res.kind, stage: stage || null, date: ex.date || null, time: ex.time || null, link: ex.link || null, interviewer: ex.interviewer || null, round: ex.round || null, text }),
      undefined,
      (out) => {
        setRes(null);
        setText("");
        toast.success(out.interview ? r.appliedInterview : out.moved ? r.appliedMoved : r.applied);
      },
    );

  /**
   * A saved e-mail (.eml) fills the box with sender, subject, date and body; a mailbox export (.mbox) lists its
   * newest messages to pick from. Parsed in the browser, never uploaded.
   */
  const [mbox, setMbox] = useState<Parsed[]>([]);
  const pick = (m: Parsed) => {
    setText(emailText(m, locale));
    setRes(null);
  };
  const loadEml = async (file: File | undefined) => {
    if (!file) return;
    const isMbox = /\.mbox$/i.test(file.name) || file.type === "application/mbox";
    const max = isMbox ? MAX_MBOX_BYTES : MAX_EML_BYTES;
    if (file.size > max) return toast.error(fmt(r.emlTooBig, { mb: max / 1_000_000 }));
    try {
      if (!isMbox) {
        setMbox([]);
        return pick(await parseEml(await file.arrayBuffer()));
      }
      const msgs = await parseMbox(await file.arrayBuffer());
      if (!msgs.length) return toast.error(r.emlError);
      setMbox(msgs.length > 1 ? msgs : []);
      pick(msgs[0]);
    } catch {
      toast.error(r.emlError);
    }
  };

  const showInterview = res && (res.kind === "interview" || stage === "interview");

  return (
    <section className="card p-5" aria-labelledby="reply-h">
      <h2 id="reply-h" className="flex items-center gap-2 text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        <ClipboardPaste size={16} aria-hidden="true" className="text-accent-text" /> {r.title}
      </h2>
      <p className="hint mt-1">{r.hint}</p>
      <label className="sr-only" htmlFor="reply-text">{r.title}</label>
      <textarea id="reply-text" className="input mt-3 !min-h-32" maxLength={8000} placeholder={r.placeholder} value={text} onChange={(e) => setText(e.target.value)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const f = e.dataTransfer.files[0];
          if (f && /\.(eml|mbox)$/i.test(f.name)) {
            e.preventDefault();
            loadEml(f);
          }
        }} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={classify} disabled={classifying || text.trim().length < 10} aria-busy={classifying}>
          {classifying ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Wand2 size={14} aria-hidden="true" />}
          {classifying ? r.classifying : r.classify}
        </button>
        <label className="btn btn-ghost btn-sm cursor-pointer">
          <FileUp size={14} aria-hidden="true" /> {r.emlImport}
          <input type="file" accept=".eml,.mbox,message/rfc822,application/mbox" className="sr-only" onChange={(e) => { loadEml(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {mbox.length > 1 && (
          <>
            <label className="sr-only" htmlFor="reply-mbox">{fmt(r.mboxPick, { n: mbox.length })}</label>
            <select id="reply-mbox" className="input !h-8 !w-auto max-w-[min(100%,22rem)] !py-0 text-sm" title={fmt(r.mboxPick, { n: mbox.length })} onChange={(e) => pick(mbox[Number(e.target.value)])}>
              {mbox.map((m, i) => (
                <option key={i} value={i}>{[m.date?.slice(0, 10), m.from?.name || m.from?.address, m.subject].filter(Boolean).join(" · ").slice(0, 90)}</option>
              ))}
            </select>
          </>
        )}
        {text.trim().length > 0 && text.trim().length < 10 && <span className="text-xs text-muted">{r.tooShort}</span>}
      </div>

      <div aria-live="polite">
        {res && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip ${KIND_CLS[res.kind]}`}>{r.kinds[res.kind]}</span>
              <span className="mono text-xs text-muted tabular">{r.confidence} {Math.round(res.confidence * 100)}%</span>
              <span className="ml-auto"><EngineChip engine={res.engine} t={t} /></span>
            </div>
            {res.evidence.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                {r.evidence}: {res.evidence.map((e) => `“${e}”`).join(", ")}
              </p>
            )}
            {res.kind === "noise" && <p className="mt-2 text-sm text-muted">{r.noiseHint}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="reply-stage">{r.suggested}</label>
                <select id="reply-stage" className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">{r.noMove}</option>
                  {APP_STATES.filter((s) => s !== currentStatus).map((s) => (
                    <option key={s} value={s}>{t.states[s]}</option>
                  ))}
                </select>
              </div>
              {showInterview && (
                <>
                  <div>
                    <label className="label" htmlFor="reply-date">{r.date}</label>
                    <input id="reply-date" type="date" className="input tabular" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="reply-time">{r.time}</label>
                    <input id="reply-time" type="time" className="input tabular" value={ex.time} onChange={(e) => setEx({ ...ex, time: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="reply-round">{r.round}</label>
                    <select id="reply-round" className="input" value={ex.round} onChange={(e) => setEx({ ...ex, round: e.target.value })}>
                      <option value="">—</option>
                      {INTERVIEW_KINDS.map((k) => (
                        <option key={k} value={k}>{t.apps2.interviews.kinds[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="reply-who">{r.interviewer}</label>
                    <input id="reply-who" className="input" maxLength={120} value={ex.interviewer} onChange={(e) => setEx({ ...ex, interviewer: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="reply-link">{r.link}</label>
                    <input id="reply-link" type="url" className="input" maxLength={300} value={ex.link} onChange={(e) => setEx({ ...ex, link: e.target.value })} placeholder="https://meet.google.com/…" />
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={applying} aria-busy={applying}>
                {applying && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {r.apply}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
