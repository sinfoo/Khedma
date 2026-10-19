"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Copy, MousePointerClick } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { bookmarkletHref } from "@/lib/clip-url";
import { Section } from "@/components/kit";

const SITES = ["LinkedIn", "Indeed", "Glassdoor", "JobTeaser", "Welcome to the Jungle"];

/** Drag-to-bookmarks clipper that imports job cards from sites that need a login. */
export function Clipper({ token }: { token: string }) {
  const { t } = useT();
  const c = t.sources2.clipper;
  const [base, setBase] = useState("http://localhost:3000");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBase(window.location.origin), 0);
    return () => clearTimeout(id);
  }, []);
  const href = bookmarkletHref(base, token);
  // React blocks javascript: URLs in href, which left a dead bookmark; set the attribute on the element instead.
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    link.current?.setAttribute("href", href);
  }, [href]);
  return (
    <Section id="clipper" title={c.title} i={3}>
      <p className="text-sm text-ink-2">{c.lead}</p>
      <ol className="mt-3 space-y-2 text-sm text-ink-2">
        <li className="flex items-start gap-2">
          <span className="chip chip-accent shrink-0">1</span>
          <span>
            {c.step1}{" "}
            <a
              ref={link}
              className="btn btn-saffron btn-sm cursor-grab align-middle"
              draggable
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard.writeText(href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              title={c.dragTitle}
            >
              <Bookmark size={14} aria-hidden="true" /> {c.button}
            </a>
            <span className="ml-2 text-xs text-muted">{copied ? <><Check size={12} className="inline" aria-hidden="true" /> {c.copied}</> : c.orCopy}</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="chip chip-accent shrink-0">2</span>
          <span>{c.step2}</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="chip chip-accent shrink-0">3</span>
          <span className="inline-flex items-center gap-1">
            <MousePointerClick size={14} aria-hidden="true" /> {c.step3}
          </span>
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {SITES.map((s) => (
          <span key={s} className="chip">{s}</span>
        ))}
        <span className="chip">+ JSON-LD</span>
      </div>
      <p className="hint">{c.privacy}</p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">{c.manual}</summary>
        <div className="mt-2 flex items-start gap-2">
          <code className="mono block max-h-24 flex-1 overflow-auto rounded-md bg-surface-2 p-2 break-all">{href}</code>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={t.common.copy} onClick={() => navigator.clipboard.writeText(href)}>
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      </details>
    </Section>
  );
}
