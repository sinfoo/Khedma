import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { BANK, TRACKS } from "@/lib/coach/bank";
import { isTrack, orderDrill } from "@/lib/coach/logic";
import { drillStates } from "@/lib/repo/coach";
import { PageHeader } from "@/components/kit";
import { CoachTabs } from "@/components/coach/parts";
import { Drill } from "@/components/coach/drill";

export const metadata: Metadata = { title: "Drill" };

const ROUND = 10;

function buildRound(track: string | null, locale: "fr" | "en") {
  const states = drillStates();
  const now = new Date();
  const pool = BANK.filter((q) => q.type === "technical" && (!track || q.tracks.some((t) => t === track)));
  const due = pool.filter((q) => {
    const s = states.get(q.id);
    return s && Date.parse(s.due_at) <= now.getTime();
  }).length;
  const cards = orderDrill(pool, states, now, ROUND).map((q) => ({ id: q.id, text: q[locale], hints: q.hints[locale], box: states.get(q.id)?.box ?? 0 }));
  return { cards, due };
}

export default async function DrillPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t, locale } = await getDict();
  const d = t.coach2.drill;
  const raw = (await searchParams).track;
  const track = isTrack(raw) ? raw : null;
  const { cards, due } = buildRound(track, locale);

  return (
    <>
      <PageHeader eyebrow={t.coach2.title} title={d.heading} lead={d.lead} />
      <CoachTabs t={t} current="drill" />
      <nav aria-label={d.track} className="mb-6 flex flex-wrap items-center gap-1.5">
        {[null, ...TRACKS].map((tr) => (
          <Link
            key={tr ?? "all"}
            href={tr ? `/app/coach/drill?track=${tr}` : "/app/coach/drill"}
            aria-current={track === tr ? "page" : undefined}
            className={`chip !px-3 !py-1 text-sm ${track === tr ? "chip-accent" : "hover:border-line-strong"}`}
          >
            {tr ? t.coach2.tracks[tr] : d.allTracks}
          </Link>
        ))}
        <span className="ml-auto text-xs text-muted">{fmt(d.dueCount, { n: due })}</span>
      </nav>
      <Drill key={`${track ?? "all"}-${cards.map((c) => c.id).join(",")}`} cards={cards} />
    </>
  );
}
