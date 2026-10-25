import { pageTitle } from "@/lib/i18n/title";
import { getDict } from "@/lib/i18n/server";
import { listApplications } from "@/lib/db";
import { listInterviews } from "@/lib/repo/apps";
import { DEBRIEF_ROUNDS, type DebriefRound } from "@/lib/ai/debrief";
import { PageHeader } from "@/components/kit";
import { DebriefForm, type DebriefAppOption } from "@/components/coach/debrief";

export const generateMetadata = pageTitle("debrief");

export default async function NewDebriefPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getDict();
  const d = t.coach2.debrief;
  const sp = await searchParams;
  const pre = Number(sp.application);
  const preselect = Number.isInteger(pre) && pre > 0 ? pre : null;
  const round = DEBRIEF_ROUNDS.includes(sp.round as DebriefRound) ? (sp.round as DebriefRound) : null;
  const apps: DebriefAppOption[] = listApplications()
    .filter((a) => a.status !== "discarded" || a.id === preselect)
    .map((a) => ({ id: a.id, title: a.job.title, company: a.job.company, interviews: listInterviews(a.id).map((i) => ({ id: i.id, starts_at: i.starts_at, kind: i.kind })) }));
  return (
    <>
      <PageHeader eyebrow={t.coach2.title} title={d.heading} lead={d.lead} back={{ href: "/app/coach/debrief", label: d.back }} />
      <div className="rise" style={{ ["--i" as string]: 1 }}>
        <DebriefForm apps={apps} preselect={preselect && apps.some((a) => a.id === preselect) ? preselect : null} round={round} />
      </div>
    </>
  );
}
