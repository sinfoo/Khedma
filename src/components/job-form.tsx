"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { JOB_TYPES, type Job } from "@/lib/types";
import { useToast } from "@/components/kit/toast";
import type { SaveResult } from "@/app/actions/jobs";

export type FormValues = Partial<Pick<Job, "title" | "company" | "location" | "url" | "type" | "description" | "deadline" | "remote" | "tags">>;

/** Offer fields. Remount with a new `key` to load different initial values. */
export function JobForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: FormValues;
  action: (prev: SaveResult, fd: FormData) => Promise<SaveResult>;
  submitLabel: string;
}) {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const f = t.jobs.fields;
  const [values, setValues] = useState<FormValues>(initial ?? {});
  const [state, formAction, pending] = useActionState(action, null);
  const shown = useRef<SaveResult>(null);

  useEffect(() => {
    if (!state?.duplicate || shown.current === state) return;
    shown.current = state;
    const id = state.duplicate;
    toast.info(t.offers2.duplicate, undefined, { label: t.offers2.openExisting, onClick: () => router.push(`/app/jobs/${id}`) });
  }, [state, toast, router, t.offers2.duplicate, t.offers2.openExisting]);

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const err = state?.error;
  const errText = err === "missing" ? t.offers2.missing : err ? `${t.common.error} (${err === "url" ? f.url : err})` : null;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">{f.title} <span aria-hidden="true" className="text-danger">*</span></label>
          <input id="title" name="title" className="input" required aria-required="true" maxLength={200} aria-invalid={err === "missing" && !values.title} aria-describedby={errText ? "job-error" : undefined} value={values.title ?? ""} onChange={set("title")} />
        </div>
        <div>
          <label className="label" htmlFor="company">{f.company} <span aria-hidden="true" className="text-danger">*</span></label>
          <input id="company" name="company" className="input" required aria-required="true" maxLength={200} aria-invalid={err === "missing" && !values.company} aria-describedby={errText ? "job-error" : undefined} value={values.company ?? ""} onChange={set("company")} />
        </div>
        <div>
          <label className="label" htmlFor="location">{f.location}</label>
          <input id="location" name="location" className="input" maxLength={200} value={values.location ?? ""} onChange={set("location")} />
        </div>
        <div>
          <label className="label" htmlFor="type">{f.type}</label>
          <select id="type" name="type" className="input" value={values.type ?? ""} onChange={set("type")}>
            <option value="">{t.common.unknown}</option>
            {JOB_TYPES.map((ty) => (
              <option key={ty} value={ty}>{t.jobTypes[ty]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="url">{f.url}</label>
          <input id="url" name="url" type="url" className="input" placeholder="https://…" aria-invalid={err === "url"} value={values.url ?? ""} onChange={set("url")} />
        </div>
        <div>
          <label className="label" htmlFor="deadline">{f.deadline}</label>
          <input id="deadline" name="deadline" type="date" className="input" value={values.deadline ?? ""} onChange={set("deadline")} />
        </div>
        <div className="flex items-end pb-2.5">
          <label className="inline-flex min-h-6 items-center gap-2 text-sm">
            <input type="checkbox" name="remote" checked={!!values.remote} onChange={set("remote")} className="size-4 accent-[var(--accent)]" />
            {f.remote}
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="tags">{f.tags}</label>
          <input id="tags" name="tags" className="input" value={(values.tags ?? []).join(", ")} onChange={(e) => setValues((v) => ({ ...v, tags: e.target.value.split(",").map((s) => s.trimStart()) }))} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">{f.description}</label>
          <textarea id="description" name="description" className="input !min-h-56" maxLength={20000} value={values.description ?? ""} onChange={set("description")} />
        </div>
      </div>
      {errText && <p id="job-error" role="alert" className="text-sm text-danger">{errText}</p>}
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
