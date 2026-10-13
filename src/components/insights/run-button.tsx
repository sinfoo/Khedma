"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";

/** One-click server action with pending state and a toast. `success` may use {r} for the action's result. */
export function RunButton({
  action,
  children,
  pendingLabel,
  success,
  successBody,
  className = "btn btn-secondary btn-sm",
  label,
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  pendingLabel?: string;
  success: string;
  successBody?: string;
  className?: string;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const { t } = useT();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
      onClick={() =>
        start(async () => {
          try {
            const r = await action();
            toast.success(success.replace("{r}", String(r ?? "")), successBody);
          } catch {
            toast.error(t.common.error);
          }
        })
      }
    >
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
