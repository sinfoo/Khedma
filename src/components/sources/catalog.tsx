"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { CompanyAvatar } from "@/components/kit";
import { Dialog } from "@/components/kit/dialog";
import { Switch } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { CATALOG, type CatalogCountry, type CatalogEntry } from "@/lib/sources/catalog";
import { countryByCode } from "@/lib/geo";
import { addProviderSource } from "@/app/actions/sources";

const COUNTRY_ORDER: CatalogCountry[] = ["TN", "FR", "DE", "CH", "CA", "US", "JP", "INT"];

/** Provider catalog grouped by country: Tunisian boards first, worldwide boards and feeds last. */
export function Catalog({ existing, keywords = [], onAdded }: { existing: string[]; keywords?: string[]; onAdded: (id: number, name: string) => void }) {
  const { t } = useT();
  const s2 = t.sources2;
  const [adding, setAdding] = useState<CatalogEntry | null>(null);
  const groups = COUNTRY_ORDER.map((code) => {
    const c = countryByCode(code);
    return { code, title: `${c ? `${c.flag} ` : ""}${s2.country[code]}`, entries: CATALOG.filter((e) => e.country === code) };
  }).filter((g) => g.entries.length);
  const q = keywords.slice(0, 3).join(" ");
  return (
    <section aria-labelledby="catalog-h" className="rise" style={{ ["--i" as string]: 6 }}>
      <div className="mb-4">
        <h2 id="catalog-h" className="text-xl">
          {s2.catalog}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{s2.catalogLead}</p>
      </div>
      {groups.map(({ code, title, entries }) => (
        <div key={code} className="mb-6">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted" style={{ fontFamily: "var(--font-sans)" }}>
            {title}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {entries.map((c) => {
              // Boards without a handle can only be added once.
              const already = !c.linkOnly && c.handle.type === "none" && existing.includes(`${c.kind}:`);
              const searchHref = c.linkOnly && c.searchUrl ? c.searchUrl(q, countryByCode(code)?.search ?? "", code) : null;
              return (
                <li key={c.kind} className="card card-hover flex flex-col p-4">
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={c.name} size={40} />
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        <span className={`chip !py-0 text-[0.7rem] ${c.country === "TN" ? "chip-accent" : ""}`}>{s2.country[c.country]}</span>
                        <span className="chip !py-0 text-[0.7rem]">{s2.method[c.method]}</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-2">{s2.desc[c.kind]}</p>
                  {searchHref && <p className="mt-2 text-xs text-muted">{s2.linkOnly}</p>}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {c.site ? (
                      <a href={c.site} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-1 text-xs text-muted hover:text-ink">
                        {new URL(c.site).hostname.replace(/^www\./, "")} <ExternalLink size={12} aria-hidden="true" />
                        <span className="sr-only">({fmt(s2.visit, { name: c.name })})</span>
                      </a>
                    ) : (
                      <span />
                    )}
                    {searchHref ? (
                      <a href={searchHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" aria-label={`${s2.openSearch} – ${c.name}`}>
                        <ExternalLink size={14} aria-hidden="true" /> {s2.openSearch}
                      </a>
                    ) : already ? (
                      <span className="chip chip-success">
                        <Check size={12} aria-hidden="true" /> {s2.added}
                      </span>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(c)} aria-label={fmt(s2.addTitle, { name: c.name })}>
                        <Plus size={14} aria-hidden="true" /> {s2.add}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {adding && (
        <AddDialog
          entry={adding}
          onClose={() => setAdding(null)}
          onAdded={(id, name) => {
            setAdding(null);
            onAdded(id, name);
          }}
        />
      )}
    </section>
  );
}

function AddDialog({ entry, onClose, onAdded }: { entry: CatalogEntry; onClose: () => void; onAdded: (id: number, name: string) => void }) {
  const { t } = useT();
  const s2 = t.sources2;
  const [handle, setHandle] = useState("");
  const [label, setLabel] = useState("");
  const [keywords, setKeywords] = useState("");
  const [keepAll, setKeepAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const h = entry.handle;

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await addProviderSource({ kind: entry.kind, handle, label, keywords, keep_all: keepAll });
      if (r.ok && r.id) onAdded(r.id, label || entry.name);
      else setError(r.error === "duplicate" ? s2.duplicate : s2.invalidHandle);
    });

  return (
    <Dialog
      open
      onClose={onClose}
      title={fmt(s2.addTitle, { name: entry.name })}
      description={s2.desc[entry.kind]}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" form="add-source" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} {s2.add}
          </button>
        </>
      }
    >
      <form
        id="add-source"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {h.type === "select" && (
          <div>
            <label className="label" htmlFor="src-handle">
              {s2.handle.select}
            </label>
            <select id="src-handle" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} aria-describedby="src-handle-hint">
              {h.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value ? o.label : s2.allOffers}
                </option>
              ))}
            </select>
            <p id="src-handle-hint" className="hint">
              {s2.handleHint.select}
            </p>
          </div>
        )}
        {(h.type === "slug" || h.type === "url") && (
          <div>
            <label className="label" htmlFor="src-handle">
              {s2.handle[h.type]}
            </label>
            <input
              id="src-handle"
              className="input mono"
              required
              value={handle}
              placeholder={h.placeholder}
              type={h.type === "url" ? "url" : "text"}
              inputMode={h.type === "url" ? "url" : "text"}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!error || undefined}
              aria-describedby="src-handle-hint"
              onChange={(e) => setHandle(e.target.value)}
            />
            <p id="src-handle-hint" className="hint">
              {s2.handleHint[h.type]}
            </p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="src-label">
            {s2.label}
          </label>
          <input id="src-label" className="input" value={label} maxLength={80} placeholder={entry.name} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {entry.keywords && (
          <div>
            <label className="label" htmlFor="src-kw">
              {s2.keywordsField}
            </label>
            <input id="src-kw" className="input" value={keywords} placeholder="stage, pfe, développeur" aria-describedby="src-kw-hint" onChange={(e) => setKeywords(e.target.value)} />
            <p id="src-kw-hint" className="hint">
              {s2.keywordsHint}
            </p>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
          <div>
            <label htmlFor="src-keepall" className="text-sm font-semibold">
              {s2.keepAll}
            </label>
            <p id="src-keepall-hint" className="hint !mt-0.5">
              {s2.keepAllHint}
            </p>
          </div>
          <Switch id="src-keepall" checked={keepAll} onChange={setKeepAll} describedBy="src-keepall-hint" />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
