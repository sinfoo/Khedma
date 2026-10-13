"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, RefreshCw, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import { Progress } from "@/components/kit";
import type { DrillGrade } from "@/lib/coach/logic";
import { gradeDrill } from "@/app/actions/coach";

export interface DrillCard {
  id: string;
  text: string;
  hints: string[];
  box: number;
}

const LIMIT = 60;

export function Drill({ cards }: { cards: DrillCard[] }) {
  const { t } = useT();
  const d = t.coach2.drill;
  const toast = useToast();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [left, setLeft] = useState(LIMIT);
  const [tally, setTally] = useState({ knew: 0, partial: 0, no: 0 });
  const [, start] = useTransition();
  const card = cards[i];
  const revealed = shown || left === 0;

  useEffect(() => {
    if (!card || revealed) return;
    const id = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(id);
  }, [card, revealed]);

  const grade = useCallback(
    (g: DrillGrade) => {
      if (!card) return;
      const id = card.id;
      start(async () => {
        const r = await gradeDrill(id, g).catch(() => ({ ok: false }));
        if (!r.ok) toast.error(d.saveError);
      });
      setTally((x) => ({ ...x, [g]: x[g] + 1 }));
      setI((x) => x + 1);
      setShown(false);
      setLeft(LIMIT);
    },
    [card, d.saveError, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, button, a, [contenteditable]")) return;
      if (e.key === " " && !revealed) {
        e.preventDefault();
        setShown(true);
      } else if (revealed && (e.key === "1" || e.key === "2" || e.key === "3")) {
        grade(e.key === "1" ? "knew" : e.key === "2" ? "partial" : "no");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, grade]);

  if (!cards.length) return <p className="card p-6 text-muted">{d.empty}</p>;

  if (!card) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center rise" role="status">
        <p className="display text-2xl">{d.done}</p>
        <p className="mt-2 text-muted">{fmt(d.doneHint, { k: tally.knew, p: tally.partial, n: tally.no })}</p>
        <button
          type="button"
          className="btn btn-primary mt-6"
          onClick={() => {
            setI(0);
            setTally({ knew: 0, partial: 0, no: 0 });
            setShown(false);
            setLeft(LIMIT);
            router.refresh();
          }}
        >
          <RefreshCw size={16} aria-hidden="true" /> {d.again}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>{fmt(d.cardOf, { i: i + 1, n: cards.length })}</span>
        <span className="chip">{card.box ? fmt(d.box, { n: card.box }) : d.fresh}</span>
      </div>
      <Progress value={i} max={cards.length} label={fmt(d.cardOf, { i: i + 1, n: cards.length })} />

      <section key={card.id} className="card mt-4 p-6 sm:p-8 fade" aria-labelledby="drill-q">
        <div className="flex items-start justify-between gap-4">
          <h2 id="drill-q" className="text-xl leading-snug sm:text-2xl">{card.text}</h2>
          <span
            role="timer"
            aria-label={left === 0 ? d.timeUp : `${left} s`}
            className={`mono shrink-0 rounded-lg px-2 py-1 text-sm font-semibold ${left <= 10 ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2"}`}
          >
            {left}s
          </span>
        </div>

        {!revealed ? (
          <div className="mt-6">
            <p className="text-sm text-muted">{d.think}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => setShown(true)}>
              <Eye size={16} aria-hidden="true" /> {d.reveal}
            </button>
          </div>
        ) : (
          <div className="mt-6" aria-live="polite">
            {left === 0 && !shown && <p className="mb-2 text-sm font-semibold text-danger">{d.timeUp}</p>}
            <ul className="space-y-1.5 rounded-xl bg-saffron-soft px-4 py-3 text-sm text-ink-2">
              {card.hints.map((h) => (
                <li key={h} className="flex gap-2">
                  <span aria-hidden="true" className="text-saffron">→</span>
                  {h}
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button type="button" className="btn btn-secondary justify-center !border-success/50 text-success" onClick={() => grade("knew")}>
                <Check size={16} aria-hidden="true" /> {d.knew} <kbd className="kbd ml-1" aria-hidden="true">1</kbd>
              </button>
              <button type="button" className="btn btn-secondary justify-center text-saffron" onClick={() => grade("partial")}>
                {d.partial} <kbd className="kbd ml-1" aria-hidden="true">2</kbd>
              </button>
              <button type="button" className="btn btn-secondary justify-center text-danger" onClick={() => grade("no")}>
                <X size={16} aria-hidden="true" /> {d.no} <kbd className="kbd ml-1" aria-hidden="true">3</kbd>
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="mt-3 text-center text-xs text-muted">{d.keys}</p>
    </div>
  );
}
