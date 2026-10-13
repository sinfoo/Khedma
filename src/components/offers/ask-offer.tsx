"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Square } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useStreamChat } from "@/lib/ai/use-stream";
import { Markdown } from "@/components/markdown";
import { EngineChip } from "@/components/ui";

export function AskOffer({ id }: { id: number }) {
  const { t } = useT();
  const a = t.offers2.ask;
  const { messages, send, stop, reset, streaming, engine, error } = useStreamChat(`/api/offers/${id}/ask`);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const ask = (q: string) => {
    if (!q.trim() || streaming) return;
    void send(q);
    setDraft("");
  };
  const suggestions = [a.q.firstWeeks, a.q.projects, a.q.learn, a.q.paid];

  return (
    <section className="card flex flex-col overflow-hidden rise" aria-labelledby="ask-h">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="ask-h" className="text-lg">{a.title}</h2>
          <p className="mt-0.5 text-sm text-muted">{a.intro}</p>
        </div>
        <div className="flex items-center gap-2">
          {engine && <EngineChip engine={engine} t={t} />}
          {messages.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset()} disabled={streaming}>
              <RotateCcw size={14} aria-hidden="true" /> {a.reset}
            </button>
          )}
        </div>
      </header>

      <div className="max-h-[55vh] min-h-56 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite" aria-busy={streaming}>
        {messages.length === 0 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted" id="sugg-h">{a.suggestions}</p>
            <ul className="flex flex-wrap gap-2" aria-labelledby="sugg-h">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" className="chip min-h-8 cursor-pointer px-3 text-sm hover:border-line-strong hover:text-ink" onClick={() => ask(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm text-ink">
                <span className="sr-only">{a.you}: </span>
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[92%] text-sm">
                <p className="mb-1 text-xs font-semibold text-muted">{a.bot}</p>
                {m.content ? (
                  <Markdown className="text-sm">{m.content}</Markdown>
                ) : (
                  <p className="text-muted">{a.thinking}</p>
                )}
              </div>
            ),
          )
        )}
        {error && <p role="alert" className="text-sm text-danger">{a.error} ({error})</p>}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">{a.label}</label>
        <textarea
          id="ask-input"
          rows={1}
          className="input !min-h-11 flex-1 resize-none"
          placeholder={a.ph}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(draft);
            }
          }}
        />
        {streaming ? (
          <button type="button" className="btn btn-secondary btn-icon" onClick={stop} aria-label={a.stop}>
            <Square size={15} aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary btn-icon" aria-label={a.send} disabled={!draft.trim()}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  );
}
