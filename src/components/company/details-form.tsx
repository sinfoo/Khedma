"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { SaveButton } from "@/components/save-button";
import { saveCompanyDetails, type DetailsResult } from "@/app/actions/company";
import type { Company } from "@/lib/company";

export function DetailsForm({ company }: { company: Company }) {
  const { t } = useT();
  const n = t.company2.notes;
  const [state, action] = useActionState<DetailsResult, FormData>(saveCompanyDetails.bind(null, company.slug), null);
  const field = (id: keyof Company, label: string, type = "text", placeholder = "") => (
    <div>
      <label className="label" htmlFor={`co-${id}`}>{label}</label>
      <input id={`co-${id}`} name={id} type={type} className="input" defaultValue={String(company[id] ?? "")} placeholder={placeholder} inputMode={type === "url" ? "url" : undefined} />
    </div>
  );
  return (
    <form action={action} className="card space-y-4 p-5 rise" aria-labelledby="notes-h">
      <div>
        <h2 id="notes-h" className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>{n.title}</h2>
        <p className="hint mt-0.5">{n.hint}</p>
      </div>
      {state?.error === "url" && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{n.badUrl}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("website", n.website, "url", "https://…")}
        {field("careers_url", n.careersUrl, "url", "https://…/careers")}
        {field("sector", n.sector)}
        {field("size", n.size)}
        {field("hq", n.hq)}
      </div>
      <div>
        <label className="label" htmlFor="co-notes">{n.notes}</label>
        <textarea id="co-notes" name="notes" className="input min-h-40" defaultValue={company.notes} placeholder={n.notesPh} maxLength={10_000} />
      </div>
      <div className="flex justify-end">
        <SaveButton label={n.save} savedLabel={n.saved} />
      </div>
    </form>
  );
}
