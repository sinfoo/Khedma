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
      <div className="fixed bottom-4 right-4 z-[90] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 no-print">
        <div aria-live="polite" className="sr-only">
          {items.filter((i) => i.tone !== "error").map((i) => `${i.title}. ${i.body ?? ""}`).join(" ")}
        </div>
        <div aria-live="assertive" className="sr-only">
          {items.filter((i) => i.tone === "error").map((i) => `${i.title}. ${i.body ?? ""}`).join(" ")}
        </div>
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertTriangle : Info;
          const color = t.tone === "success" ? "var(--success)" : t.tone === "error" ? "var(--danger)" : "var(--accent-text)";
          return (
            <div key={t.id} className="card flex items-start gap-3 p-3.5 shadow-[var(--shadow-lg)]" style={{ animation: "pop .2s ease both" }}>
              <Icon size={18} aria-hidden="true" style={{ color }} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="text-sm text-muted mt-0.5">{t.body}</p>}
                {t.action && (
                  <button type="button" className="mt-2 text-sm font-semibold text-accent-text hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-1 -mt-1" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden="true" />
              </button>
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
