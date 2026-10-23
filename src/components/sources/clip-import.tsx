"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { PageHeader } from "@/components/kit";
import { importClip } from "@/app/actions/clip";

type State = { kind: "working" } | { kind: "empty" } | { kind: "badToken" } | { kind: "done"; added: number; known: number };

/** Landing tab of the clipper bookmarklet: the offers arrive in the URL fragment, are imported once, and the fragment is cleared. */
export function ClipImport() {
  const { t } = useT();
  const c = t.sources2.clipper;
  const [s, setS] = useState<State>({ kind: "working" });
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    // Out of the address bar and history right away: a reload must not import twice.
    window.history.replaceState(null, "", "/app/clip");
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
      payload = null;
    }
    if (!payload) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment only exists in the browser
      setS({ kind: "empty" });
      return;
    }
    importClip(payload)
      .then((r) => setS(r.ok ? { kind: "done", added: r.added, known: r.known } : { kind: "badToken" }))
      .catch(() => setS({ kind: "empty" }));
  }, []);
  const lead = s.kind === "working" ? c.importing : s.kind === "empty" ? c.nothing : s.kind === "badToken" ? c.badToken : fmt(c.imported, { added: s.added, known: s.known });
  return (
    <>
      <PageHeader title={c.button} lead={<span role="status">{lead}</span>} />
      <div className="flex flex-wrap gap-2">
        {s.kind === "done" && (
          <Link href="/app/jobs" className="btn btn-primary">{c.seeOffers}</Link>
        )}
        {s.kind !== "working" && s.kind !== "done" && (
          <Link href="/app/sources/manage#clipper" className="btn btn-outline">{c.recreate}</Link>
        )}
      </div>
    </>
  );
}
