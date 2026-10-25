"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Plus, RefreshCw, Sparkles, MessagesSquare, FileText, Moon, Languages, Keyboard, Briefcase, KanbanSquare } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { searchEverything, type SearchHit } from "@/app/actions/shell";
import { setLocale, setTheme } from "@/app/actions/prefs";
import { NAV_ITEMS } from "./nav-items";
import { fold } from "@/lib/sources/classify";

interface Cmd {
  id: string;
  group: string;
  label: string;
  sub?: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean; className?: string }>;
  run: () => void;
}

/**
 * Ctrl/Cmd+K palette. Also owns global single-key shortcuts:
 * "/" opens it, "n" new offer, "g" then a letter jumps to a page, "?" shows help.
 */
export function CommandPalette({ theme, onHelp }: { theme: "light" | "dark" | "system"; onHelp: () => void }) {
  const { t, locale } = useT();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, start] = useTransition();

  // Open/close the native dialog.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Global shortcuts.
  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (gPending) {
        gPending = false;
        const item = NAV_ITEMS.find((i) => i.g === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "n") {
        e.preventDefault();
        router.push("/app/jobs/new");
      } else if (e.key === "?") {
        e.preventDefault();
        onHelp();
      } else if (e.key === "g") {
        gPending = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (gPending = false), 1200);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("khedma:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("khedma:palette", onOpen);
    };
  }, [router, onHelp]);

  // Debounced offer search.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      start(async () => setHits(q.trim().length >= 2 ? await searchEverything(q) : []));
    }, 140);
    return () => clearTimeout(id);
  }, [q, open]);

  const close = () => {
    setOpen(false);
    setQ("");
    setActive(0);
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const cmds = useMemo<Cmd[]>(() => {
    const p = t.shell2.palette;
    const a = t.shell2.actions;
    const pages: Cmd[] = NAV_ITEMS.map((i) => ({ id: `p-${i.key}`, group: p.pages, label: t.shell2.nav[i.key], Icon: i.Icon, run: () => go(i.href) }));
    const actions: Cmd[] = [
      { id: "a-add", group: p.actions, label: a.addOffer, Icon: Plus, run: () => go("/app/jobs/new") },
      // ?scan=1 opens the scan form with the keywords focused; nothing starts until the student presses Scan.
      { id: "a-scan", group: p.actions, label: a.scanSources, Icon: RefreshCw, run: () => go("/app/sources?scan=1") },
      { id: "a-eval", group: p.actions, label: a.evaluateAll, Icon: Sparkles, run: () => go("/app/jobs?evaluate=1") },
      { id: "a-mock", group: p.actions, label: a.mockInterview, Icon: MessagesSquare, run: () => go("/app/coach") },
      { id: "a-cv", group: p.actions, label: a.editCv, Icon: FileText, run: () => go("/app/profile") },
      {
        id: "a-theme",
        group: p.actions,
        label: a.toggleTheme,
        Icon: Moon,
        run: () => {
          close();
          start(() => setTheme(theme === "dark" ? "light" : "dark"));
        },
      },
      {
        id: "a-lang",
        group: p.actions,
        label: a.toggleLang,
        Icon: Languages,
        run: () => {
          close();
          start(() => setLocale(locale === "fr" ? "en" : "fr"));
        },
      },
      { id: "a-keys", group: p.actions, label: a.shortcuts, Icon: Keyboard, run: () => { close(); onHelp(); } },
    ];
    const found: Cmd[] = hits.map((h) => ({
      id: `h-${h.kind}-${h.id}`,
      group: h.kind === "offer" ? p.offers : p.applications,
      label: h.title,
      sub: h.sub,
      Icon: h.kind === "offer" ? Briefcase : KanbanSquare,
      run: () => go(h.href),
    }));
    const needle = fold(q.trim());
    const match = (c: Cmd) => !needle || fold(c.label).includes(needle);
    return [...found, ...pages.filter(match), ...actions.filter(match)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, hits, q, theme, locale]);

  const sel = Math.min(active, Math.max(0, cmds.length - 1));
  const groups = cmds.reduce<Record<string, Cmd[]>>((acc, c) => ((acc[c.group] ??= []).push(c), acc), {});

  return (
    <dialog
      ref={ref}
      className="modal !mt-[12vh] !mb-auto"
      style={{ width: "min(620px, calc(100vw - 2rem))" }}
      aria-label={t.shell2.palette.title}
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} aria-hidden="true" className="text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, cmds.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              cmds[sel]?.run();
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={cmds[sel] ? `cmd-${cmds[sel].id}` : undefined}
          aria-label={t.shell2.palette.placeholder}
          placeholder={t.shell2.palette.placeholder}
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        <kbd className="kbd">Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label={t.shell2.palette.title} className="max-h-[52vh] overflow-y-auto p-2">
        {cmds.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{t.shell2.palette.empty}</li>}
        {Object.entries(groups).map(([group, items]) => (
          <li key={group} role="presentation">
            <p className="px-3 pt-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted" aria-hidden="true">
              {group}
            </p>
            <ul role="group" aria-label={group}>
              {items.map((c) => {
                const idx = cmds.indexOf(c);
                const on = idx === sel;
                return (
                  <li
                    key={c.id}
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setActive(idx)}
                    onClick={c.run}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${on ? "bg-accent-soft text-ink" : "text-ink-2"}`}
                  >
                    <c.Icon size={16} aria-hidden={true} className={on ? "text-accent-text" : "text-muted"} />
                    <span className="min-w-0 flex-1 truncate">
                      {c.label}
                      {c.sub && <span className="ml-2 text-muted">{c.sub}</span>}
                    </span>
                    {on && <CornerDownLeft size={14} aria-hidden="true" className="text-muted" />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">{t.shell2.palette.hint}</p>
    </dialog>
  );
}
