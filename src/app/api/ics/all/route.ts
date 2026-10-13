import { appLabels, buildIcs, localDate, openReminders, trackedDeadlines, upcomingInterviews, type IcsEvent } from "@/lib/repo/apps";
import { getDict } from "@/lib/i18n/server";

/** One feed: upcoming interviews, open reminders and deadlines of tracked offers. */
export async function GET() {
  const { t } = await getDict();
  const today = localDate(new Date());
  const labels = appLabels();
  const label = (id: number | null) => {
    const l = id ? labels.get(id) : undefined;
    return l ? `${l.company} — ${l.title}` : "";
  };
  const events: IcsEvent[] = [
    ...upcomingInterviews(today).map((iv) => ({
      uid: `interview-${iv.id}`,
      summary: `${t.apps2.interviews.kinds[iv.kind] ?? iv.kind} · ${label(iv.application_id)}`,
      start: iv.starts_at,
      durationMin: iv.duration_min,
      location: iv.location,
      description: iv.notes,
      alarmMin: 60,
    })),
    ...openReminders().map((r) => ({
      uid: `reminder-${r.id}`,
      summary: `${r.title}${r.application_id ? ` · ${label(r.application_id)}` : ""}`,
      start: r.due_at.length > 10 ? r.due_at.slice(0, 16) : r.due_at,
      durationMin: 30,
    })),
    ...trackedDeadlines(today).map((d) => ({
      uid: `deadline-${d.application_id}`,
      summary: `${t.apps2.ics.deadline} · ${d.company} — ${d.title}`,
      start: d.deadline.slice(0, 10),
      url: d.url,
    })),
  ];
  return new Response(buildIcs(events, t.apps2.ics.calName), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="khedma.ics"',
      "cache-control": "no-store",
    },
  });
}
