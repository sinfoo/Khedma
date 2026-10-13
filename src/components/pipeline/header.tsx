"use client";

import Link from "next/link";
import { useOptimistic, useState } from "react";
import { ArrowLeft, Check, ExternalLink, GraduationCap, MoreHorizontal, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { AppState } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
import { Menu, MenuItem } from "@/components/kit/menu";
import { ScoreRing, StateChip, scoreLabel } from "@/components/ui";
import { useStageMove } from "./stage";

const STEPS: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];

/** Sticky workspace header: identity, score, links and a clickable stage stepper. */
export function WorkspaceHeader({
  id,
  status,
  title,
  company,
  score,
  jobId,
  postingUrl,
}: {
  id: number;
  status: AppState;
  title: string;
  company: string;
  score: number | null;
  jobId: number;
  postingUrl: string | null;
}) {
  const { t } = useT();
  const s = t.apps2.stage;
  const w = t.apps2.ws;
  const [cur, setCur] = useOptimistic(status);
  const [live, setLive] = useState("");
  const { move, node, pending } = useStageMove((_, st) => setCur(st), setLive);
  const go = (to: AppState) => move({ id, status: cur, title: `${company} — ${title}` }, to);
  const idx = STEPS.indexOf(cur);
  const closed = idx < 0;

  return (
    <header className="no-print -mx-4 mb-5 border-b border-line bg-bg/90 px-4 pb-3 pt-1 backdrop-blur-md sm:-mx-8 sm:px-8 lg:sticky lg:top-16 lg:z-20">
      <p className="sr-only" aria-live="polite">{live}</p>
      {node}
      <Link href="/app/pipeline" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> {w.back}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <CompanyAvatar name={company} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.45rem] leading-tight sm:text-[1.7rem]">{title}</h1>
          <p className="truncate text-sm text-muted">{company}</p>
        </div>
        {score !== null && <ScoreRing value={score} size={48} label={scoreLabel(t, score)} />}
        <div className="flex items-center gap-1.5">
          <Link href={`/app/coach?application=${id}`} className="btn btn-secondary btn-sm">
            <GraduationCap size={14} aria-hidden="true" /> <span className="hidden sm:inline">{w.prepare}</span>
            <span className="sr-only sm:hidden">{w.prepare}</span>
          </Link>
          <Menu label={w.more} trigger={<MoreHorizontal size={16} aria-hidden="true" />}>
            <MenuItem href={`/app/jobs/${jobId}`}>{t.application.openOffer}</MenuItem>
            {postingUrl && (
              <MenuItem href={postingUrl}>
                <ExternalLink size={14} aria-hidden="true" /> {w.posting}
              </MenuItem>
            )}
            <MenuItem onClick={() => go("rejected")} danger>
              <XCircle size={14} aria-hidden="true" /> {fmt(s.markAs, { s: t.states.rejected })}
            </MenuItem>
            <MenuItem onClick={() => go("discarded")}>{fmt(s.markAs, { s: t.states.discarded })}</MenuItem>
          </Menu>
        </div>
      </div>

      <nav aria-label={s.stepperLabel} className="mt-3 overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1">
          {STEPS.map((st, i) => {
            const done = !closed && i < idx;
            const here = st === cur;
            return (
              <li key={st} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true" className={`h-px w-4 ${done || here ? "bg-accent" : "bg-line-strong"}`} />}
                <button
                  type="button"
                  disabled={pending}
                  aria-current={here ? "step" : undefined}
                  aria-label={here ? `${t.states[st]} (${s.current})` : fmt(s.changeTo, { s: t.states[st] })}
                  onClick={() => go(st)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    here
                      ? "border-accent bg-accent text-accent-ink"
                      : done
                        ? "border-accent bg-accent-soft text-accent-text hover:border-accent"
                        : "border-line-strong text-muted hover:border-accent hover:text-ink"
                  }`}
                >
                  {done && <Check size={12} aria-hidden="true" />}
                  {t.states[st]}
                </button>
              </li>
            );
          })}
          {closed && (
            <li className="ml-2">
              <StateChip state={cur} t={t} />
            </li>
          )}
        </ol>
      </nav>
    </header>
  );
}
