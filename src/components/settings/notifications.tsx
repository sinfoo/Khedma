"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { useToast } from "@/components/kit/toast";
import { Switch } from "@/components/toggle-box";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { dueReminders, setNotify } from "@/app/actions/settings";

type Perm = NotificationPermission | "unsupported";
const noop = () => () => {};
const readPerm = (): Perm => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");

export function NotificationSettings({ enabled }: { enabled: boolean }) {
  const { t } = useT();
  const n = t.sources2.settings.notifications;
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  // Permission has no change event; read it on the client, then track what the prompt returns.
  const live = useSyncExternalStore(noop, readPerm, () => "default" as Perm);
  const [asked, setPerm] = useState<Perm | null>(null);
  const perm = asked ?? live;
  const [, start] = useTransition();

  const toggle = (v: boolean) =>
    start(async () => {
      if (v && perm !== "granted" && perm !== "unsupported") {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p !== "granted") {
          toast.error(n.denied);
          return;
        }
      }
      setOn(v);
      await setNotify(v);
      toast.success(t.sources2.settings.appearance.saved);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-4">
        <div>
          <label htmlFor="notify-on" className="text-sm font-semibold">
            {n.enable}
          </label>
          <p id="notify-hint" className="hint !mt-0.5">
            {fmt(n.status, { s: n.perm[perm] })} · {n.hintOpen}
          </p>
        </div>
        <Switch id="notify-on" checked={on} onChange={toggle} disabled={perm === "unsupported" || perm === "denied"} describedBy="notify-hint" />
      </div>
      {perm === "denied" && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {n.denied}
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={perm !== "granted"}
        onClick={() => new Notification(n.testTitle, { body: n.testBody, icon: "/icon.svg", tag: "khedma-test" })}
      >
        <BellRing size={14} aria-hidden="true" /> {n.test}
      </button>
    </div>
  );
}

const SEEN_KEY = "khedma:notified-reminders";

/**
 * Headless: every minute, shows a browser notification for each newly due reminder.
 * Mount once in the /app layout so it runs on every page (the Settings page mounts it too).
 */
export function ReminderNotifier() {
  const { t } = useT();
  const router = useRouter();
  useEffect(() => {
    if (!("Notification" in window)) return;
    const tick = async () => {
      if (Notification.permission !== "granted") return;
      let due: Awaited<ReturnType<typeof dueReminders>> = [];
      try {
        due = await dueReminders();
      } catch {
        return;
      }
      let seen: number[] = [];
      try {
        seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      } catch {
        seen = [];
      }
      const fresh = due.filter((r) => !seen.includes(r.id));
      for (const r of fresh) {
        const note = new Notification(t.sources2.settings.notifications.due, { body: r.title, tag: `reminder-${r.id}`, icon: "/icon.svg" });
        note.onclick = () => {
          window.focus();
          router.push("/app");
        };
      }
      if (fresh.length) {
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((r) => r.id)].slice(-500)));
        } catch {
          // storage blocked: worst case a reminder is shown again next minute
        }
      }
    };
    void tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [t, router]);
  return null;
}
