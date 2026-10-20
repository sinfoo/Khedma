"use client";

import Link from "next/link";
import { useOptimistic, useState } from "react";
import { ArrowLeft, Check, ExternalLink, GraduationCap, MoreHorizontal, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { AppState } from "@/lib/types";
import { CompanyAvatar } from "@/components/kit";
import { Menu, MenuItem } from "@/components/kit/menu";
import { StateChip } from "@/components/ui";
import { useStageMove } from "./stage";

const STEPS: AppState[] = ["evaluated", "applied", "responded", "interview", "offer", "hired"];

/** Workspace header: identity on the left, the stage stepper (segmented) on the right. */
export function WorkspaceHeader({
  id,
  status,
  title,
  company,
  meta,
  jobId,
  postingUrl,
}: {
  id: number;
  status: AppState;
  title: string;
  company: string;
  meta: string;
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
    <header className="no-print mb-4">
      <p className="sr-only" aria-live="polite">{live}</p>
      {node}
      <Link href="/app/pipeline" className="mb-2.5 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> {w.back}
      </Link>
      <div className="grid items-center gap-3.5 lg:grid-cols-[auto_1fr_auto]">
        <CompanyAvatar name={company} size={48} />
        <div className="min-w-0">
          <h1 className="line-clamp-2 text-[1.6rem] leading-[1.15] tracking-[-0.02em]">{title}</h1>
          <p className="mt-0.5 truncate text-[0.85rem] text-muted">
            {company} · {meta}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:col-start-3">
          <ol aria-label={s.stepperLabel} className="seg seg-sm overflow-x-auto">
            {STEPS.map((st, i) => {
              const done = !closed && i < idx;
              const here = st === cur;
              return (
                <li key={st}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-current={here ? "step" : undefined}
                    aria-label={here ? `${t.states[st]} (${s.current})` : fmt(s.changeTo, { s: t.states[st] })}
                    onClick={() => go(st)}
                    className={`seg-btn ${here ? "on" : ""} ${done ? "!text-accent-text" : ""}`}
                  >
                    {done && <Check size={11} aria-hidden="true" />}
                    {t.states[st]}
                  </button>
                </li>
              );
            })}
          </ol>
          {closed && <StateChip state={cur} t={t} />}
          <Menu label={w.more} trigger={<MoreHorizontal size={16} aria-hidden="true" />} triggerClassName="btn btn-outline btn-icon btn-sm">
            <MenuItem href={`/app/jobs/${jobId}`}>{t.application.openOffer}</MenuItem>
            <MenuItem href={`/app/coach?application=${id}`}>
              <GraduationCap size={14} aria-hidden="true" /> {w.prepare}
            </MenuItem>
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
    </header>
  );
}
