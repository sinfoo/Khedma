import { getApplication, getJob } from "@/lib/db";
import { buildIcs, getInterview } from "@/lib/repo/apps";
import { getDict } from "@/lib/i18n/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const iv = Number.isInteger(id) && id > 0 ? getInterview(id) : null;
  const app = iv && getApplication(iv.application_id);
  const job = app && getJob(app.job_id);
  if (!iv || !job) return new Response("Not found", { status: 404 });
  const { t } = await getDict();
  const ics = buildIcs(
    [
      {
        uid: `interview-${iv.id}`,
        summary: `${t.apps2.interviews.kinds[iv.kind] ?? iv.kind} · ${job.company} — ${job.title}`,
        start: iv.starts_at,
        durationMin: iv.duration_min,
        location: iv.location,
        description: [iv.notes, job.url].filter(Boolean).join("\n\n"),
        url: /^https?:\/\//.test(iv.location) ? iv.location : undefined,
        alarmMin: 60,
      },
    ],
    `Khedma — ${job.company}`,
  );
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="interview-${iv.id}.ics"`,
      "cache-control": "no-store",
    },
  });
}
