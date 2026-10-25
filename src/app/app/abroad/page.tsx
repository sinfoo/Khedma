import type { Metadata } from "next";
import { ArrowUpRight, Check } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { getProfile } from "@/lib/db";
import { countryOf, countryName } from "@/lib/geo";
import { ABROAD_CHECKED, STIPEND_FLOORS } from "@/lib/abroad";
import { PageHeader } from "@/components/kit";

export const metadata: Metadata = { title: "Going abroad" };

type Code = "FR" | "DE" | "CH" | "NL" | "BE" | "CA" | "GB" | "US";
const ORDER: Code[] = ["FR", "DE", "CH", "NL", "BE", "CA", "GB", "US"];

// Official pages (permit authority, pay rule, student housing). Bot-blocked sites still open fine in a browser.
const LINKS: Record<Code, { permit: string; pay?: string; housing?: string }> = {
  FR: { permit: "https://france-visas.gouv.fr/", pay: STIPEND_FLOORS.FR.source, housing: "https://www.messervices.etudiant.gouv.fr/" },
  DE: { permit: "https://www.make-it-in-germany.com/en/", pay: STIPEND_FLOORS.DE.source, housing: "https://www.studierendenwerke.de/" },
  CH: { permit: "https://www.sem.admin.ch/sem/en/home.html" },
  NL: { permit: "https://ind.nl/en" },
  BE: { permit: "https://www.belgium.be/en/work" },
  CA: { permit: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html" },
  GB: { permit: "https://www.gov.uk/browse/visas-immigration/work-visas" },
  US: { permit: "https://j1visa.state.gov/" },
};
const PROGRAMS = [
  { key: "iaeste", name: "IAESTE", url: "https://iaeste.org/" },
  { key: "aiesec", name: "AIESEC Global Talent", url: "https://aiesec.org/global-talent" },
  { key: "erasmus", name: "Erasmus+", url: "https://erasmus-plus.ec.europa.eu/" },
  { key: "daad", name: "DAAD", url: "https://www.daad.de/en/" },
  { key: "campusfrance", name: "Campus France", url: "https://www.campusfrance.org/en" },
] as const;

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-accent-text underline-offset-2 hover:underline">
      {children} <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

export default async function AbroadPage() {
  const { t, locale } = await getDict();
  const m = t.abroad2;
  const targets = new Set(getProfile().target_locations.map((l) => countryOf(l)).filter(Boolean));
  const codes = [...ORDER.filter((c) => targets.has(c)), ...ORDER.filter((c) => !targets.has(c))];
  const date = new Date(ABROAD_CHECKED).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={m.title} lead={m.lead} />
      <p className="text-sm text-muted">{fmt(m.checked, { date })} {m.notAdvice}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {codes.map((code) => {
          const c = m.countries[code];
          const l = LINKS[code];
          const rows: [string, string, string | undefined][] = [
            [m.labels.permit, c.permit, l.permit],
            [m.labels.pay, c.pay, l.pay],
            [m.labels.cv, c.cv, undefined],
            [m.labels.housing, c.housing, l.housing],
            [m.labels.season, c.season, undefined],
          ];
          return (
            <section key={code} id={code.toLowerCase()} className="card p-5" aria-labelledby={`abroad-${code}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`abroad-${code}`} className="text-lg">{countryName(code, locale === "fr" ? "fr" : "en")}</h2>
                {targets.has(code) && <span className="chip chip-success">{m.yours}</span>}
              </div>
              <dl className="mt-3 grid gap-3 text-sm">
                {rows.map(([label, text, href]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
                    <dd className="mt-0.5 leading-relaxed text-ink-2">
                      {text} {href && <Out href={href}>{m.labels.official}</Out>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <section className="card mt-5 p-5" aria-labelledby="abroad-programs">
        <h2 id="abroad-programs" className="text-lg">{m.programs.title}</h2>
        <p className="mt-1 text-sm text-muted">{m.programs.lead}</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {PROGRAMS.map((p) => (
            <li key={p.key} className="rounded-2xl border border-line p-4 text-sm">
              <Out href={p.url}>{p.name}</Out>
              <p className="mt-1 leading-relaxed text-ink-2">{m.programs.items[p.key]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-5 p-5" aria-labelledby="abroad-checklist">
        <h2 id="abroad-checklist" className="text-lg">{m.checklist.title}</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {m.checklist.items.map((item) => (
            <li key={item} className="flex gap-2 text-ink-2">
              <Check size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
