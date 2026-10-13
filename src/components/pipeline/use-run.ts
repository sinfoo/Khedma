"use client";

import { useTransition } from "react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import type { Result } from "@/lib/repo/apps";

/** Run a server action in a transition; toast its outcome. */
export function useRun() {
  const toast = useToast();
  const { t } = useT();
  const [pending, start] = useTransition();
  const run = <T extends object>(fn: () => Promise<Result<T>>, okMsg?: string, after?: (r: { ok: true } & T) => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (okMsg) toast.success(okMsg);
          after?.(r);
        } else toast.error(t.common.error, r.error);
      } catch {
        toast.error(t.common.error);
      }
    });
  return [pending, run] as const;
}
