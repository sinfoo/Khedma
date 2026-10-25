import Link from "next/link";
import { Globe2 } from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { countryName, countryOf, REMOTE_CODE } from "@/lib/geo";
import { stipendCheck } from "@/lib/abroad";
import { isListedSponsor, type SponsorCountry } from "@/lib/sponsors";
import { cvConventionIssues } from "@/lib/cv/conventions";
import type { Job, Locale } from "@/lib/types";

const GUIDE = new Set(["FR", "DE", "CH", "NL", "BE", "CA", "GB", "US"]);

/**
 * What an offer outside Tunisia asks of the student: the legal internship pay (France, Germany), whether the
 * employer is on the official visa sponsor register (UK, Netherlands), and what the CV should change for that
 * country. Nothing for Tunisian or remote offers. Async: the sponsor register may be downloaded on first use.
 */
export async function AbroadCard({ job, cvText, t, locale }: { job: Pick<Job, "company" | "location" | "description" | "type">; cvText: string; t: Dict; locale: Locale }) {
  const code = countryOf(job.location);
  if (!code || code === "TN" || code === REMOTE_CODE) return null;
  const m = t.abroad2.card;
  const country = countryName(code, locale === "fr" ? "fr" : "en");
  const floor = stipendCheck(job);
  const sponsor = code === "GB" || code === "NL" ? await isListedSponsor(job.company, code as SponsorCountry).catch(() => null) : null;
  const issues = cvText.trim() ? cvConventionIssues(cvText, code) : [];
  if (!floor && sponsor === null && !issues.length && !GUIDE.has(code)) return null;

  return (
    <section className="card p-4 rise" style={{ ["--i" as string]: 3 }} aria-labelledby="abroad-h">
      <h2 id="abroad-h" className="card-title flex items-center gap-1.5 text-[0.9rem]">
        <Globe2 size={15} className="text-accent-text" aria-hidden="true" /> {fmt(m.title, { country })}
      </h2>
      <ul className="mt-2.5 space-y-2 text-[0.8rem] leading-relaxed text-ink-2">
        {floor && (
          <li className={floor.below ? "rounded-lg bg-danger-soft px-2.5 py-1.5 text-danger" : ""}>
            {floor.below
              ? fmt(m.floorBelow, { offered: floor.offeredMonthly ?? 0, floor: floor.floorMonthly })
              : fmt(floor.offeredMonthly === null ? m.floorUnknown : m.floorOk, { floor: floor.floorMonthly })}
            {floor.country === "DE" && <span className="block text-muted">{m.floorExempt}</span>}
          </li>
        )}
        {sponsor !== null && <li>{fmt(sponsor ? m.sponsorYes : m.sponsorNo, { company: job.company, register: m.registers[code as SponsorCountry] })}</li>}
        {issues.length > 0 && (
          <li>
            {m.cv} {issues.map((i) => m.issues[i]).join(" · ")}
          </li>
        )}
      </ul>
      {GUIDE.has(code) && (
        <Link href={`/app/abroad#${code.toLowerCase()}`} className="mt-2.5 inline-block text-[0.8rem] font-semibold text-accent-text hover:underline">
          {fmt(m.guide, { country })} →
        </Link>
      )}
    </section>
  );
}
