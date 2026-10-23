"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Save } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useRun } from "./use-run";
import { saveOffer } from "@/app/actions/applications";
import { offerMonthlyTnd, type OfferRecord } from "@/lib/apps/offer";
import { TND_PER, type SalaryCurrency } from "@/lib/salaries";

/** The offer received, as it was actually made: pay, length, start, answer-by date, remote days, perks. */
export function OfferCard({ id, initial }: { id: number; initial: OfferRecord }) {
  const { t, locale } = useT();
  const m = t.apps2.offer;
  const [o, setO] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, run] = useRun();
  const set = (patch: Partial<OfferRecord>) => {
    setO((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const n = (v: string) => (v === "" ? null : Number(v));
  const monthly = offerMonthlyTnd(o);
  return (
    <section className="card p-[18px]" aria-labelledby="offer-h">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="offer-h" className="text-[1.15rem] tracking-[-0.01em]">{m.title}</h2>
        <Link href={`/app/pipeline/compare?ids=${id}`} className="btn btn-ghost btn-sm ml-auto"><GitCompareArrows size={14} aria-hidden="true" /> {m.compare}</Link>
      </div>
      <p className="mb-3 text-[0.82rem] text-muted">{m.lead}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="offer-pay">{m.pay}</label>
          <input id="offer-pay" type="number" min={0} className="input tabular" value={o.pay ?? ""} onChange={(e) => set({ pay: n(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="offer-cur">{m.currency}</label>
          <select id="offer-cur" className="input" value={o.currency} onChange={(e) => set({ currency: e.target.value as SalaryCurrency })}>
            {(Object.keys(TND_PER) as SalaryCurrency[]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="offer-per">{m.period}</label>
          <select id="offer-per" className="input" value={o.period} onChange={(e) => set({ period: e.target.value === "year" ? "year" : "month" })}>
            <option value="month">{m.perMonth}</option>
            <option value="year">{m.perYear}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="offer-months">{m.months}</label>
          <input id="offer-months" type="number" min={0} className="input tabular" value={o.months ?? ""} onChange={(e) => set({ months: n(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="offer-start">{m.start}</label>
          <input id="offer-start" type="date" className="input" value={o.start} onChange={(e) => set({ start: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="offer-by">{m.respondBy}</label>
          <input id="offer-by" type="date" className="input" value={o.respondBy} onChange={(e) => set({ respondBy: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="offer-remote">{m.remoteDays}</label>
          <input id="offer-remote" type="number" min={0} max={7} className="input tabular" value={o.remoteDays ?? ""} onChange={(e) => set({ remoteDays: n(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="offer-perks">{m.perks}</label>
          <input id="offer-perks" className="input" maxLength={300} placeholder={m.perksPh} value={o.perks} onChange={(e) => set({ perks: e.target.value })} />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={o.hireAfter} onChange={(e) => set({ hireAfter: e.target.checked })} />
        {m.hireAfter}
      </label>
      <label className="label mt-3" htmlFor="offer-notes">{m.notes}</label>
      <textarea id="offer-notes" className="input !min-h-20" maxLength={1000} value={o.notes} onChange={(e) => set({ notes: e.target.value })} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || pending} aria-busy={pending} onClick={() => run(() => saveOffer(id, o), m.saved, () => setDirty(false))}>
          <Save size={14} aria-hidden="true" /> {t.common.save}
        </button>
        {monthly !== null && o.currency !== "TND" && <span className="text-[0.8rem] text-muted tabular">{fmt(m.inTnd, { n: monthly.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB") })}</span>}
      </div>
    </section>
  );
}
