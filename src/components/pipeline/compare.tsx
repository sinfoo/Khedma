"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Trophy } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, StateChip, scoreColor, scoreLabel } from "@/components/ui";
import type { AppState } from "@/lib/types";
import { COMPARE_DIMS, DEFAULT_WEIGHTS, weightedTotal, type CompareDim, type DimScores } from "@/lib/apps/compare";
import { saveCompareWeights, savePersonalRating } from "@/app/actions/applications";
import { useRun } from "./use-run";

export interface CompareRow {
  id: number;
  title: string;
  company: string;
  status: AppState;
  scores: DimScores;
  /** Raw facts shown under the score. */
  facts: Partial<Record<CompareDim, string>>;
  personalRating: number;
}

export function CompareTable({ rows, weights: initialWeights }: { rows: CompareRow[]; weights: Record<CompareDim, number> }) {
  const { t, locale } = useT();
  const c = t.apps2.compare;
  const [weights, setWeights] = useState(initialWeights);
  const [ratings, setRatings] = useState<Record<number, number>>(Object.fromEntries(rows.map((r) => [r.id, r.personalRating])));
  const [savingW, runW] = useRun();
  const [savingR, runR] = useRun();
  const n1 = (v: number) => v.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const totals = useMemo(
    () => rows.map((r) => weightedTotal({ ...r.scores, rating: ratings[r.id] || 3 }, weights)),
    [rows, weights, ratings],
  );
  const best = totals.indexOf(Math.max(...totals));

  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <table className="table min-w-[640px]">
          <caption className="sr-only">{c.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-48">{c.weights}</th>
              {rows.map((r) => (
                <th key={r.id} scope="col" className="min-w-40 !font-normal">
                  <div className="flex items-center gap-2">
                    <CompanyAvatar name={r.company} size={28} />
                    <div className="min-w-0">
                      <Link href={`/app/pipeline/${r.id}`} className="block truncate font-semibold hover:text-accent-text">{r.title}</Link>
                      <span className="block truncate text-xs text-muted">{r.company}</span>
                    </div>
                  </div>
                  <div className="mt-1.5"><StateChip state={r.status} t={t} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_DIMS.map((d) => (
              <tr key={d}>
                <th scope="row" className="align-top">
                  <label htmlFor={`w-${d}`} className="block text-sm font-medium">{c.dims[d]}</label>
                  <span className="block text-xs font-normal text-muted">{c.dimHints[d]}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <input
                      id={`w-${d}`}
                      type="number"
                      min={0}
                      max={100}
                      className="input !h-8 !min-h-0 w-20 !py-0 !px-2 text-xs tabular"
                      aria-label={fmt(c.weightOf, { dim: c.dims[d] })}
                      value={weights[d]}
                      onChange={(e) => setWeights({ ...weights, [d]: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                    />
                    <span className="text-xs text-muted">%</span>
                  </span>
                </th>
                {rows.map((r) => {
                  const v = d === "rating" ? ratings[r.id] || 0 : r.scores[d];
                  return (
                    <td key={r.id} className="align-top">
                      {d === "rating" ? (
                        <select
                          className="input !h-9 !min-h-0 !py-0 w-32 text-sm"
                          aria-label={fmt(c.rate, { title: `${r.company} — ${r.title}` })}
                          value={ratings[r.id] || 0}
                          disabled={savingR}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setRatings({ ...ratings, [r.id]: n });
                            runR(() => savePersonalRating(r.id, n), c.ratingSaved);
                          }}
                        >
                          <option value={0}>{c.unrated}</option>
                          {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{"★".repeat(k)}</option>)}
                        </select>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="mono font-semibold tabular" style={{ color: scoreColor(v) }}>{n1(v)}</span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                            <span className="block h-full rounded-full" style={{ width: `${((v - 1) / 4) * 100}%`, background: scoreColor(v) }} />
                          </span>
                        </span>
                      )}
                      {r.facts[d] && <span className="mt-0.5 block text-xs text-muted">{r.facts[d]}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-2/60">
              <th scope="row" className="text-sm font-semibold">{c.total}</th>
              {rows.map((r, i) => (
                <td key={r.id}>
                  <span className="flex items-center gap-2">
                    <ScoreRing dec={t.a11y.decimal} value={totals[i]} size={44} label={scoreLabel(t, totals[i])} animate={false} />
                    {i === best && rows.length > 1 && (
                      <span className="chip chip-success"><Trophy size={11} aria-hidden="true" /> {c.best}</span>
                    )}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted">{c.weightsHint} · {c.indicative}</p>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>
            <RotateCcw size={14} aria-hidden="true" /> {c.reset}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={savingW} aria-busy={savingW} onClick={() => runW(() => saveCompareWeights(weights), c.weightsSaved)}>
            {savingW ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {c.saveWeights}
          </button>
        </span>
      </div>
    </div>
  );
}
