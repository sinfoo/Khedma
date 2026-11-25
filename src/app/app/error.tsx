"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** `retry` fetches the page again; `reset` would only re-render the same failed server result. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useT();
  const e = t.shell2.error;
  // A client component can throw anything, not only an Error.
  const err = error instanceof Error ? (error as Error & { digest?: string }) : null;
  return (
    <div role="alert" className="page-enter mx-auto mt-[8vh] max-w-[560px] text-center">
      <span className="tile tone-danger mx-auto !size-14 !rounded-2xl">
        <TriangleAlert size={26} aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-[1.6rem]">{e.title}</h1>
      <p className="mt-2 leading-relaxed text-muted">{e.lead}</p>
      <details className="mt-3 text-[0.78rem] text-muted">
        <summary className="cursor-pointer">{e.details}</summary>
        <p className="mono mt-1.5 break-all">
          {err ? err.message : String(error)}
          {err?.digest ? ` · digest ${err.digest}` : ""}
        </p>
      </details>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn btn-primary h-10" onClick={retry}>
          <RefreshCw size={15} aria-hidden="true" /> {e.retry}
        </button>
        <Link href="/app" className="btn btn-outline h-10">
          {e.home}
        </Link>
      </div>
    </div>
  );
}
