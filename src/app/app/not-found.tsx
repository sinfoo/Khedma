import Link from "next/link";
import { Briefcase, KanbanSquare, SearchX, Sun } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { EmptyState } from "@/components/kit";

/** A stale link inside the app (/app/jobs/999, a deleted application) stays in the shell, with ways back. */
export default async function AppNotFound() {
  const { t } = await getDict();
  const n = t.shell2.notFound;
  return (
    <EmptyState icon={<SearchX aria-hidden="true" />} title={n.title} hint={n.text}>
      <Link href="/app/jobs" className="btn btn-primary">
        <Briefcase size={15} aria-hidden="true" /> {n.offers}
      </Link>
      <Link href="/app/pipeline" className="btn btn-outline">
        <KanbanSquare size={15} aria-hidden="true" /> {n.pipeline}
      </Link>
      <Link href="/app" className="btn btn-ghost">
        <Sun size={15} aria-hidden="true" /> {n.today}
      </Link>
    </EmptyState>
  );
}
