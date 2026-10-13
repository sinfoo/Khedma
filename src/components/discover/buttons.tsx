"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { addRecommendedSource, addTargetRoles, refreshDiscover } from "@/app/actions/discover";

export function RefreshButton() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          await refreshDiscover();
          router.refresh();
          toast.success(t.discover2.refreshed);
        })
      }
    >
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
      {t.discover2.refresh}
    </button>
  );
}

export function AddRoleButton({ role }: { role: string }) {
  const { t } = useT();
  const m = t.discover2.roles;
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span className="chip chip-success"><Check size={12} aria-hidden="true" /> {m.added}</span>;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${m.add}: ${role}`}
      onClick={() =>
        start(async () => {
          try {
            await addTargetRoles([role]);
            setDone(true);
            toast.success(m.added, m.addedBody);
          } catch {
            toast.error(t.common.error);
          }
        })
      }
    >
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
      {m.add}
    </button>
  );
}

export function AddSourceButton({ kind, handle, label, keywords }: { kind: string; handle: string; label: string; keywords: string[] }) {
  const { t } = useT();
  const m = t.discover2.sources;
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span className="chip chip-success"><Check size={12} aria-hidden="true" /> {m.added}</span>;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${m.add}: ${label}`}
      onClick={() =>
        start(async () => {
          try {
            const r = await addRecommendedSource({ kind, handle, label, keywords });
            if (r.ok) {
              setDone(true);
              toast.success(m.added, m.addedBody);
            } else if (r.error === "duplicate") {
              setDone(true);
              toast.info(m.duplicate);
            } else toast.error(t.common.error);
          } catch {
            toast.error(t.common.error);
          }
        })
      }
    >
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
      {m.add}
    </button>
  );
}
