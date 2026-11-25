"use client";

import { useId } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { postingLinks } from "@/lib/links";

/**
 * "Open on LinkedIn / Indeed / Keejob…" button for an offer.
 * With a real URL: one button to the posting. Without: a search menu on major platforms.
 */
export function PostingLink({
  job,
  size = "sm",
  variant = "secondary",
  iconOnly = false,
}: {
  job: { url: string; title: string; company: string; location: string; source?: string };
  size?: "sm" | "md";
  variant?: "secondary" | "ghost" | "primary";
  iconOnly?: boolean;
}) {
  const { locale } = useT();
  const uid = useId();
  const { primary, search } = postingLinks(job);
  const cls = `btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${iconOnly ? "btn-icon" : ""}`;
  const fr = locale === "fr";
  if (primary) {
    const label = fr ? `Voir sur ${primary.platform}` : `Open on ${primary.platform}`;
    return (
      <a href={primary.url} target="_blank" rel="noopener noreferrer" className={cls} aria-label={iconOnly ? label : undefined} title={label}>
        <ExternalLink size={size === "sm" ? 14 : 16} aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
      </a>
    );
  }
  // A generated id: one built from the title and company collided for two offers of the same company with similar
  // titles, and the button then opened the other offer's menu.
  const id = `find-${uid.replace(/:/g, "")}`;
  const label = fr ? "Chercher l'annonce" : "Find the posting";
  return (
    <>
      <button
        type="button"
        className={cls}
        popoverTarget={id}
        aria-label={iconOnly ? label : undefined}
        title={label}
        style={{ anchorName: `--${id}` } as React.CSSProperties}
      >
        <Search size={size === "sm" ? 14 : 16} aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
      </button>
      <div
        id={id}
        popover="auto"
        aria-label={label}
        className="menu"
        style={{ positionAnchor: `--${id}`, top: "anchor(bottom)", left: "anchor(left)", marginTop: 6 } as React.CSSProperties}
      >
        <p className="px-3 pt-1.5 pb-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
          {fr ? "Chercher cette offre sur" : "Search this offer on"}
        </p>
        {search.map((s) => (
          <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" className="menu-item">
            <ExternalLink size={14} aria-hidden="true" /> {s.platform}
          </a>
        ))}
      </div>
    </>
  );
}
