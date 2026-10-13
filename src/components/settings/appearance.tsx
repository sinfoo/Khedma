"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/kit/toast";
import { useT } from "@/lib/i18n/client";
import { setLocale, setTheme } from "@/app/actions/prefs";
import { setMotion } from "@/app/actions/settings";
import { Segmented } from "./segmented";

export function Appearance({ theme, motion }: { theme: "system" | "light" | "dark"; motion: "system" | "reduce" }) {
  const { t, locale } = useT();
  const ap = t.sources2.settings.appearance;
  const toast = useToast();
  const [state, setState] = useState({ theme, locale: locale as string, motion: motion as string });
  const [pending, start] = useTransition();
  const save = (patch: Partial<typeof state>, run: () => Promise<void>) => {
    setState((s) => ({ ...s, ...patch }));
    start(async () => {
      await run();
      toast.success(ap.saved);
    });
  };
  return (
    <div className="grid gap-5 md:grid-cols-2" aria-busy={pending}>
      <Segmented
        name="theme"
        legend={ap.theme}
        value={state.theme}
        options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: ap.themes[v] }))}
        onChange={(v) => save({ theme: v }, () => setTheme(v))}
      />
      <Segmented
        name="locale"
        legend={ap.language}
        value={state.locale}
        options={[
          { value: "fr", label: "Français" },
          { value: "en", label: "English" },
        ]}
        onChange={(v) => save({ locale: v }, () => setLocale(v))}
      />
      <div className="md:col-span-2">
        <Segmented
          name="motion"
          legend={ap.motion}
          value={state.motion}
          options={(["system", "reduce"] as const).map((v) => ({ value: v, label: ap.motions[v] }))}
          onChange={(v) =>
            save({ motion: v }, async () => {
              await setMotion(v);
              // Apply right away on this page; the app shell reads the cookie on the next render.
              if (v === "reduce") document.documentElement.dataset.motion = "reduce";
              else delete document.documentElement.dataset.motion;
            })
          }
          hint={ap.motionHint}
        />
      </div>
    </div>
  );
}
