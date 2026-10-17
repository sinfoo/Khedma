"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  const e = t.shell2.error;
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
          {error.message}
          {error.digest ? ` · digest ${error.digest}` : ""}
        </p>
      </details>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn btn-primary h-10" onClick={reset}>
          <RefreshCw size={15} aria-hidden="true" /> {e.retry}
        </button>
        <Link href="/app" className="btn btn-outline h-10">
          {e.home}
        </Link>
      </div>
    </div>
  );
}
