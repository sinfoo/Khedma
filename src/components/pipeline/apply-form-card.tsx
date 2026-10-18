import { ClipboardList } from "lucide-react";
import { getApplyForm } from "@/lib/apply-form";
import { fmt } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";

/** Server card for the apply step: the employer form's real questions, so answers can be prepared before opening it. */
export async function ApplyFormCard({ url }: { url: string }) {
  const { t } = await getDict();
  const F = t.apps2.flow.form;
  const form = await getApplyForm(url, F.basicsLabels);
  if (!form) return null;
  return (
    <section className="card p-[18px]" aria-labelledby="apply-form-h">
      <h2 id="apply-form-h" className="mb-1 flex items-center gap-2 text-[1.15rem] tracking-[-0.01em]">
        <ClipboardList size={17} aria-hidden="true" className="text-accent-text" /> {F.title}
      </h2>
      <p className="mb-3 text-[0.82rem] text-muted">{fmt(F.lead, { provider: form.provider })}</p>
      <p className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[0.78rem]">
        <span className="font-semibold text-ink-2">{F.basics}</span>
        {form.basics.map((b) => (
          <span key={b.label} className="chip !py-0 text-[0.72rem]">
            {b.label}
            {b.required && <span className="text-danger" aria-label={F.required}> *</span>}
          </span>
        ))}
      </p>
      {form.questions.length === 0 ? (
        <p className="text-[0.82rem] text-muted">{F.none}</p>
      ) : (
        <>
          <p className="mb-1.5 text-[0.78rem] font-semibold text-ink-2">{fmt(F.count, { n: form.questions.length })}</p>
          <ol className="flex flex-col gap-1.5">
            {form.questions.map((q, i) => (
              <li key={i} className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-[0.84rem]">
                <span className="font-medium">{q.label}</span>
                <span className="mt-0.5 block text-[0.72rem] text-muted">
                  {[q.required ? F.required : F.optional, q.kind ? F.kinds[q.kind] : "", q.options?.length ? q.options.slice(0, 6).join(" · ") + (q.options.length > 6 ? " …" : "") : ""].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
