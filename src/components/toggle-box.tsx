"use client";

import { useOptimistic, useTransition } from "react";
import { toggleSource } from "@/app/actions/sources";

/** Accessible on/off switch (button role="switch"), 24px+ target. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-50"
    >
      <span aria-hidden="true" className="sr-only" />
    </button>
  );
}

/** Enable/disable a source with an optimistic switch. */
export function ToggleBox({ id, enabled, label }: { id: number; enabled: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(enabled);
  return (
    <Switch
      checked={on}
      disabled={pending}
      label={label}
      onChange={(v) =>
        start(async () => {
          setOn(v);
          await toggleSource(id, v);
        })
      }
    />
  );
}
