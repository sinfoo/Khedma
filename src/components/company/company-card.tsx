// Server component: compact company card other areas can embed (e.g. on an offer page). Renders nothing for unknown slugs.
import Link from "next/link";
import { Ban, Sparkles } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, scoreLabel } from "@/components/ui";
import { getCompany } from "@/lib/company";

export async function CompanyCard({ slug }: { slug: string }) {
  const c = getCompany(slug);
  if (!c) return null;
  const { t } = await getDict();
  const m = t.company2;
  const sector = c.sector || c.research?.facts.sector;
  return (
    <Link href={`/app/companies/${c.slug}`} className="card card-hover flex items-center gap-3 p-3.5" aria-label={`${m.card.view}: ${c.name}`}>
      <CompanyAvatar name={c.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{c.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {sector && <span className="truncate">{sector}</span>}
          <span className="chip !py-0 text-[0.7rem]">{fmt(m.card.open, { n: c.open })}</span>
          {c.blacklisted && <span className="chip chip-danger !py-0 text-[0.7rem]"><Ban size={10} aria-hidden="true" /> {m.doNotApply}</span>}
          {c.researched_at && <span className="chip chip-success !py-0 text-[0.7rem]"><Sparkles size={10} aria-hidden="true" /> {m.researched}</span>}
        </span>
      </span>
      {c.avgFit !== null && <ScoreRing dec={t.a11y.decimal} value={c.avgFit} size={36} label={`${m.fit}: ${scoreLabel(t, c.avgFit)}`} animate={false} />}
    </Link>
  );
}
