"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/kit/dialog";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { FIELDS, LEVELS, type Field, type Level } from "@/lib/recommend/profile-model";
import { setDiscoverOverride } from "@/app/actions/discover";

/** Lets the user pin the field / level Khedma detected (saved in kv, cleared with "Back to automatic"). */
export function AdjustButton({ field, level, overridden }: { field: Field; level: Level; overridden: boolean }) {
  const { t } = useT();
  const m = t.discover2;
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Field>(field);
  const [l, setL] = useState<Level>(level);
  const [pending, start] = useTransition();

  const save = (payload: { field?: string; level?: string }) =>
    start(async () => {
      await setDiscoverOverride(payload);
      setOpen(false);
      toast.success(m.banner.saved);
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={14} aria-hidden="true" /> {m.banner.edit}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={m.banner.editTitle}
        description={m.banner.editLead}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {overridden ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => save({})}>
                {m.banner.reset}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                {m.banner.cancel}
              </button>
              <button type="button" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={() => save({ field: f, level: l })}>
                {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {m.banner.save}
              </button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="discover-field">{m.banner.field}</label>
            <select id="discover-field" className="input" value={f} onChange={(e) => setF(e.target.value as Field)}>
              {FIELDS.map((x) => (
                <option key={x} value={x}>{m.fields[x]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="discover-level">{m.banner.level}</label>
            <select id="discover-level" className="input" value={l} onChange={(e) => setL(e.target.value as Level)}>
              {LEVELS.map((x) => (
                <option key={x} value={x}>{m.levels[x]}</option>
              ))}
            </select>
          </div>
        </div>
      </Dialog>
    </>
  );
}
