// Server-rendered interview readiness for one application: story map and likely concerns.
import Link from "next/link";
import type { Dict } from "@/lib/i18n/dict";
import type { Story } from "@/lib/repo/coach";
import type { StoryMap } from "@/lib/coach/logic";
import type { Concern } from "@/lib/coach/concerns";

const SEV_CHIP: Record<Concern["severity"], string> = { dealbreaker: "chip-danger", significant: "chip-saffron", minor: "" };

export function StoryMapCard({ map, hasQuestions, t }: { map: StoryMap<Story> | null; hasQuestions: boolean; t: Dict }) {
  const r = t.coach2.readiness;
  return (
    <section className="card p-5" aria-labelledby="map-h">
      <h3 id="map-h" className="text-lg">{r.mapTitle}</h3>
      <p className="mb-4 text-sm text-muted">{r.mapLead}</p>
      {!hasQuestions ? (
        <p className="text-sm text-muted">{r.noQuestions}</p>
      ) : !map ? (
        <p className="text-sm text-muted">
          {r.noStories} <Link href="/app/coach/stories" className="font-medium text-accent-text hover:underline">{r.addStory}</Link>
        </p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{r.question}</th>
                <th scope="col">{r.story}</th>
              </tr>
            </thead>
            <tbody>
              {map.rows.map((row, i) => (
                <tr key={i}>
                  <td className="text-sm">{row.question}</td>
                  <td className="text-sm">
                    {row.story ? (
                      <>
                        <span className="font-medium">{row.story.title}</span>
                        {row.reused && <span className="block text-xs text-saffron">{r.reused}</span>}
                      </>
                    ) : (
                      <span className="text-muted">{r.none}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {map.gaps.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              <span className="font-semibold">{r.gaps} ({map.gaps.length}).</span> {r.gapsHint}
            </p>
          )}
          {map.unused.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {r.unused}: {map.unused.map((s) => s.title).join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ConcernsCard({ concerns, t }: { concerns: Concern[]; t: Dict }) {
  const r = t.coach2.readiness;
  return (
    <section className="card p-5" aria-labelledby="concerns-h">
      <h3 id="concerns-h" className="text-lg">{r.concernsTitle}</h3>
      <p className="mb-4 text-sm text-muted">{r.concernsLead}</p>
      {concerns.length === 0 ? (
        <p className="text-sm text-muted">{r.noConcerns}</p>
      ) : (
        <ul className="space-y-4">
          {concerns.map((c, i) => (
            <li key={i} className="border-l-2 border-line pl-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <span className={`chip ${SEV_CHIP[c.severity]} !py-0 text-xs`}>{r.severity[c.severity]}</span>
                {c.concern}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                <span className="font-semibold">{r.counter}</span> {c.counter}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
