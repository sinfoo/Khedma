// Server component: the ESCO "European reference" for the user's target roles, streamed in after the page.
import { ArrowUpRight, Check, Minus } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { fmt } from "@/lib/i18n/dict";
import { escoCoverage, escoPortalUrl, escoRole } from "@/lib/esco";

const h2s = { fontFamily: "var(--font-sans)", letterSpacing: 0 } as const;

export async function EscoCard({ t, lang, roles, cvText }: { t: Dict; lang: "fr" | "en"; roles: string[]; cvText: string }) {
  const m = t.insights2.skills.esco;
  const all = await Promise.all(roles.slice(0, 3).map((r) => escoRole(r, lang).catch(() => null)));
  // Two target roles often resolve to the same occupation: show it once.
  const found = all.filter((x, i): x is NonNullable<typeof x> => !!x && all.findIndex((y) => y?.uri === x.uri) === i).slice(0, 2);
  return (
    <section className="card mt-6 p-5 rise" aria-labelledby="esco-h">
      <h2 id="esco-h" className="text-base font-semibold" style={h2s}>{m.title}</h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">{m.lead}</p>
      {!roles.length ? (
        <p className="mt-4 text-sm text-muted">{m.noRoles}</p>
      ) : !found.length ? (
        <p className="mt-4 text-sm text-muted" role="status">{m.unavailable}</p>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {found.map((o) => {
            const cov = escoCoverage(o.essential, cvText);
            const n = cov.filter((c) => c.shown).length;
            return (
              <article key={o.uri} className="rounded-2xl border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{m.occupation} · {o.role}</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg capitalize">{o.occupation}</h3>
                  <a href={escoPortalUrl(o.uri, lang)} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                    {m.open} <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-1 text-sm text-ink-2">{fmt(m.shown, { n, total: cov.length })}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {cov.map((c) => (
                    <li key={c.skill} className={`chip ${c.shown ? "chip-success" : ""}`} title={c.shown ? m.inCv : m.notShown}>
                      {c.shown ? <Check size={12} aria-label={m.inCv} /> : <Minus size={12} aria-label={m.notShown} />}
                      {c.skill}
                    </li>
                  ))}
                </ul>
                {o.optional.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-accent-text">{fmt(m.optional, { n: o.optional.length })}</summary>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{o.optional.join(" · ")}</p>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
