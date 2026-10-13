import { notFound } from "next/navigation";
import { getDict } from "@/lib/i18n/server";
import { getJob } from "@/lib/db";
import { PageHeader } from "@/components/kit";
import { JobForm } from "@/components/job-form";
import { editJob, type SaveResult } from "@/app/actions/jobs";

export default async function EditJobPage({ params }: PageProps<"/app/jobs/[id]/edit">) {
  const { id } = await params;
  const job = /^\d+$/.test(id) ? getJob(Number(id)) : null;
  if (!job) notFound();
  const { t } = await getDict();
  const action = editJob.bind(null, job.id);
  return (
    <>
      <PageHeader title={job.title} eyebrow={t.offers2.edit} back={{ href: `/app/jobs/${job.id}`, label: job.company }} />
      <div className="card max-w-3xl p-5 rise" style={{ ["--i" as string]: 1 }}>
        <JobForm
          initial={{ ...job, url: job.url.startsWith("manual://") ? "" : job.url, deadline: job.deadline ?? "" }}
          action={async (_p: SaveResult, fd: FormData) => {
            "use server";
            return action(fd);
          }}
          submitLabel={t.common.save}
        />
      </div>
    </>
  );
}
