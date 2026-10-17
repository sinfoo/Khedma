"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

/** App-wide toasts. Announced politely (errors assertively) to screen readers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 8000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-[72px] left-1/2 z-[90] flex w-[min(460px,90vw)] -translate-x-1/2 flex-col gap-2 no-print">
        <div aria-live="polite" className="sr-only">
          {items.filter((i) => i.tone !== "error").map((i) => `${i.title}. ${i.body ?? ""}`).join(" ")}
        </div>
        <div aria-live="assertive" className="sr-only">
          {items.filter((i) => i.tone === "error").map((i) => `${i.title}. ${i.body ?? ""}`).join(" ")}
        </div>
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertTriangle : Info;
          const color = t.tone === "success" ? "var(--success)" : t.tone === "error" ? "var(--danger)" : "var(--accent)";
          const life = t.tone === "error" ? 8 : 4.5;
          return (
            <div
              key={t.id}
              role="status"
              className="relative flex items-center gap-3 overflow-hidden rounded-[14px] bg-ink px-3.5 py-3 text-bg shadow-[var(--shadow-lg)]"
              style={{ animation: "pop .22s cubic-bezier(.2,.7,.2,1) both" }}
            >
              <Icon size={18} aria-hidden="true" style={{ color }} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="mt-px text-[0.8rem] opacity-75">{t.body}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="rounded-lg bg-white/15 px-2.5 py-1.5 text-[0.8rem] font-semibold"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="grid size-7 place-items-center opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden="true" />
              </button>
              <span aria-hidden="true" className="absolute bottom-0 left-0 h-[2px]" style={{ background: color, animation: `toast-bar ${life}s linear both` }} />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  if (!push) throw new Error("useToast outside ToastProvider");
  return {
    success: (title: string, body?: string, action?: Toast["action"]) => push({ tone: "success", title, body, action }),
    error: (title: string, body?: string) => push({ tone: "error", title, body }),
    info: (title: string, body?: string, action?: Toast["action"]) => push({ tone: "info", title, body, action }),
  };
}
