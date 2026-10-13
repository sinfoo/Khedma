"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Copy, Loader2, MoreHorizontal, Sparkles, Star, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/kit/toast";
import { Dialog } from "@/components/kit/dialog";
import { Menu, MenuItem } from "@/components/kit/menu";
import { archiveOffers, deleteOffers, runEvaluation, starOffers, undoDelete } from "@/app/actions/jobs";
import { fmt } from "@/lib/i18n/dict";

export function StarToggle({ id, starred }: { id: number; starred: boolean }) {
  const { t } = useT();
  const [on, setOn] = useOptimistic(starred);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon ${on ? "!text-saffron" : ""}`}
      aria-pressed={on}
      aria-label={on ? t.offers2.unstar : t.offers2.star}
      title={on ? t.offers2.unstar : t.offers2.star}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await starOffers([id], !on);
        })
      }
    >
      <Star size={16} aria-hidden="true" fill={on ? "currentColor" : "none"} />
    </button>
  );
}

/** Archive / restore / delete (with undo) for one offer. */
export function OfferMenu({ id, archived }: { id: number; archived: boolean }) {
  const { t } = useT();
  const o = t.offers2;
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const archive = () =>
    start(async () => {
      await archiveOffers([id], !archived);
      toast.success(fmt(archived ? o.toastRestored : o.toastArchived, { n: 1 }), undefined, {
        label: o.undo,
        onClick: () => start(async () => void (await archiveOffers([id], archived))),
      });
    });

  const remove = () =>
    start(async () => {
      const { token } = await deleteOffers([id]);
      setConfirm(false);
      router.push("/app/jobs");
      toast.success(fmt(o.toastDeleted, { n: 1 }), undefined, token
        ? {
            label: o.undo,
            onClick: async () => {
              await undoDelete(token);
              toast.success(o.toastUndone);
              router.push(`/app/jobs/${id}`);
            },
          }
        : undefined);
    });

  return (
    <>
      <Menu label={o.more} trigger={<MoreHorizontal size={16} aria-hidden="true" />} triggerClassName="btn btn-secondary btn-icon">
        <MenuItem onClick={archive}>
          {archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />} {archived ? o.restore : o.archive}
        </MenuItem>
        <MenuItem danger onClick={() => setConfirm(true)}>
          <Trash2 size={14} aria-hidden="true" /> {o.delete}
        </MenuItem>
      </Menu>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={o.confirmDeleteTitle}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>{t.common.cancel}</button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={pending} aria-busy={pending}>
              {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />} {o.delete}
            </button>
          </>
        }
      >
        <p className="text-ink-2">{fmt(o.confirmDelete, { n: 1 })}</p>
      </Dialog>
    </>
  );
}

/** Shown once after saving a new offer: toast + "evaluate now" prompt. */
export function NewOfferPrompt({ id }: { id: number }) {
  const { t } = useT();
  const o = t.offers2;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast.success(o.saved);
  }, [toast, o.saved]);

  return (
    <div role="status" className="card mb-6 flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft/40 p-4 rise">
      <Sparkles size={18} aria-hidden="true" className="text-accent-text" />
      <p className="min-w-48 flex-1 text-sm font-medium">{o.newBanner}</p>
      <Link href={`/app/jobs/${id}`} replace className="btn btn-ghost btn-sm">{o.later}</Link>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            await runEvaluation(id);
            router.replace(`/app/jobs/${id}?tab=fit`);
          })
        }
      >
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
        {pending ? o.evaluating : o.evaluateNow}
      </button>
    </div>
  );
}

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const toast = useToast();
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          toast.success(done);
          setTimeout(() => setOk(false), 2000);
        } catch {
          toast.error(label);
        }
      }}
    >
      {ok ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {label}
    </button>
  );
}
