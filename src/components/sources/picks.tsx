"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { useToast } from "@/components/kit/toast";
import { applyTo, archiveOffers, scanPicks } from "@/app/actions/jobs";
import type { Pick } from "@/lib/picks";

/**
 * The post-scan phase: a ranked shortlist with plain reasons and one action, "Apply".
 * `refreshKey` changes when scores change, so the ranking follows the evaluations.
 */
export function Picks({ ids, refreshKey }: { ids: number[]; refreshKey: string }) {
  const { t } = useT();
  const p = t.sources2.scan2.picks;
  const toast = useToast();
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());
  const idsKey = ids.join(",");

  useEffect(() => {
    let live = true;
    scanPicks(idsKey ? idsKey.split(",").map(Number) : []).then((r) => live && setPicks(r)).catch(() => live && setPicks([]));
    return () => {
      live = false;
    };
  }, [idsKey, refreshKey, reload]);

  // Same Skip as the scan feed: the offer is archived, and Undo brings it back into the list.
  const skip = async (x: Pick) => {
    setPicks((ps) => ps?.filter((y) => y.id !== x.id) ?? null);
    if (!(await archiveOffers([x.id], true))) {
      toast.error(t.common.error);
      return setReload((n) => n + 1);
    }
    toast.info(t.sources2.scan2.skippedToast, x.title, {
      label: t.sources2.scan2.undo,
      onClick: () => void archiveOffers([x.id], false).then(() => setReload((n) => n + 1)),
    });
  };

  return (
    <section aria-labelledby="picks-h" className="card overflow-hidden" style={{ animation: "pop .35s cubic-bezier(.2,.7,.2,1) both" }}>
      <div className="border-b border-line px-[18px] py-4">
        <h2 id="picks-h" className="text-[1.25rem] tracking-[-0.01em]">{p.title}</h2>
        <p className="mt-0.5 text-[0.85rem] text-muted">{p.lead}</p>
        <ol className="mt-3 grid gap-2 text-[0.8rem] sm:grid-cols-3">
          {p.steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
              <span className="mono grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-semibold text-accent-text">{i + 1}</span>
              <span className="text-ink-2">{s}</span>
            </li>
          ))}
        </ol>
      </div>
      {picks === null ? (
        <p className="flex items-center gap-2 px-[18px] py-6 text-sm text-muted" role="status">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> {p.loading}
        </p>
      ) : picks.length === 0 ? (
        <div className="px-[18px] py-6 text-sm">
          <p className="font-semibold">{p.empty}</p>
          <p className="mt-1 text-muted">{p.emptyTips}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5 p-2">
          {picks.map((x, i) => (
            <PickRow key={x.id} pick={x} rank={i + 1} now={now} onSkip={() => void skip(x)} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PickRow({ pick: x, rank, now, onSkip }: { pick: Pick; rank: number; now: number; onSkip: () => void }) {
  const { t } = useT();
  const p = t.sources2.scan2.picks;
  const [applying, startApply] = useTransition();
  const d = x.deadline ? Math.ceil((new Date(x.deadline).getTime() - now) / 86_400_000) : null;
  const reasons = [
    x.found.length ? fmt(p.skills, { v: x.found.join(", ") }) : "",
    x.levelFits ? p.level : "",
    x.cvPct !== null ? fmt(p.cv, { p: x.cvPct }) : "",
  ].filter(Boolean);
  const top = rank === 1;

  return (
    <li className={`grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border px-3.5 py-3 sm:grid-cols-[auto_auto_1fr_auto] ${top ? "border-[color-mix(in_oklab,var(--saffron)_45%,var(--line))] bg-[color-mix(in_oklab,var(--saffron-soft)_35%,var(--surface))]" : "border-line bg-surface"}`}>
      <span className="mono hidden w-5 text-center text-[0.95rem] font-semibold text-muted sm:block" aria-hidden="true">{rank}</span>
      <CompanyAvatar name={x.company} size={40} />
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          <Link href={`/app/jobs/${x.id}`} className="truncate text-[0.98rem] font-semibold text-ink hover:text-accent-text">{x.title}</Link>
          {x.isNew && <span className="chip chip-accent !py-px text-[0.66rem]">{p.isNew}</span>}
        </p>
        <p className="mt-px truncate text-[0.78rem] text-muted">
          {x.company}
          {x.location && ` · ${x.location}`}
          {d !== null && d <= 14 && (
            <span className="font-semibold" style={{ color: d <= 3 ? "var(--danger)" : "var(--saffron)" }}> · {d <= 0 ? p.closesToday : fmt(p.closes, { n: d })}</span>
          )}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-px pr-2 text-[0.72rem] font-semibold text-accent-text ${x.basis === "keywords" ? "pl-2" : "pl-0.5"}`}>
            {x.basis !== "keywords" && <ScoreRing value={x.fit} size={20} label={scoreLabel(t, x.fit)} animate={false} />}
            {p.basis[x.basis]}
          </span>
          {reasons.map((r) => (
            <span key={r} className="chip chip-success !py-px text-[0.7rem]">
              <Check size={10} aria-hidden="true" /> {r}
            </span>
          ))}
          {x.missing.length > 0 && <span className="chip !py-px text-[0.7rem] text-muted">{fmt(p.missing, { v: x.missing.join(", ") })}</span>}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-4">
        <button type="button" className={`btn btn-sm ${top ? "btn-saffron" : "btn-primary"}`} disabled={applying} aria-busy={applying} onClick={() => startApply(async () => await applyTo(x.id))}>
          {applying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />} {p.apply}
        </button>
        <Link href={`/app/jobs/${x.id}${x.basis === "keywords" ? "" : "?tab=fit"}`} className="btn btn-outline btn-sm text-ink-2">
          {x.basis === "keywords" ? <Sparkles size={13} aria-hidden="true" /> : null} {p.view}
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm text-muted"
          aria-label={`${p.notForMe}: ${x.title}`}
          title={p.notForMe}
          onClick={onSkip}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
