"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useToast } from "@/components/kit/toast";
import type { TrackStatus } from "@/lib/bourses/model";
import { saveBourse } from "@/app/actions/bourses";

/** Save a scholarship to "My applications". Once tracked it shows the status and links to the detail page. */
export function SaveBourse({ id, name, status, className = "btn btn-outline btn-sm" }: { id: string; name: string; status: TrackStatus | null; className?: string }) {
  const { t } = useT();
  const m = t.bourses2;
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const current = status ?? (saved ? "saved" : null);
  if (current)
    return (
      <Link href={`/app/bourses/${id}#suivi`} className="chip chip-success min-h-7">
        <Check size={12} aria-hidden="true" /> {m.statuses[current]}
      </Link>
    );
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      aria-label={fmt(m.card.saveLabel, { name })}
      onClick={() =>
        start(async () => {
          const res = await saveBourse(id);
          if (res.ok) setSaved(true);
          else toast.error(m.track.failed);
        })
      }
    >
      {pending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Bookmark size={13} aria-hidden="true" />} {m.card.save}
    </button>
  );
}
