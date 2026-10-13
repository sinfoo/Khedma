"use client";

import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** Small entry point to the apply assistant; the pipeline workspace embeds it. */
export function ApplyLauncher({ applicationId, className = "btn btn-secondary btn-sm" }: { applicationId: number; className?: string }) {
  const { t } = useT();
  return (
    <Link href={`/app/apply/${applicationId}`} className={className}>
      <PackageCheck size={16} aria-hidden="true" />
      {t.apply2.launcher}
    </Link>
  );
}
