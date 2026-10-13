"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { useAutoScan, useScan } from "./use-scan";

/**
 * Headless auto-scanner for the app shell: mount once in the /app layout so scheduled
 * scans run on every page while Khedma is open. The Sources page runs its own copy
 * (with visible progress), and the server makes sure only one scan runs at a time.
 */
export function AutoScan() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { start } = useScan();
  useAutoScan(start, (done) => {
    if (done.added > 0) toast.success(fmt(t.sources2.auto.ran, { n: done.added }), undefined, { label: t.sources2.view, onClick: () => router.push("/app/jobs") });
    router.refresh();
  });
  return null;
}
