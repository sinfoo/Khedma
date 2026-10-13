import { Bell, Check, Mic } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import { CompanyAvatar } from "@/components/kit";
import { ScoreRing, scoreColor } from "@/components/ui";
import s from "./styles";

const DIMS = [4.7, 4.8, 4.3, 3.9, 4.9];

/** Product composition for the hero: an arch-framed mini dashboard, built in HTML/CSS. */
export function HeroPreview({ t, locale }: { t: Dict; locale: "fr" | "en" }) {
  const D = t.landing2.demo;
  const V = t.landing2.features.v;
  const num = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { minimumFractionDigits: 1 });
  const rise = (i: number) => ({ ["--i" as string]: i });
  const delay = (d: string) => ({ ["--d" as string]: d });

  return (
    <div role="img" aria-label={t.landing2.hero.previewLabel} className="relative mx-auto w-full max-w-[440px] lg:mr-0">
      <div className={s.float}>
        <div className="rise" style={rise(2)}>
          {/* door frame */}
          <div className={`${s.arch} bg-gradient-to-b from-[#2a7fd6] to-[#0b5cad] p-2 shadow-[0_40px_100px_-30px_rgb(11_92_173/0.55)]`}>
            <div className={`${s.arch} overflow-hidden bg-bg ring-1 ring-white/10`}>
              {/* tympanum: zellige + a saffron star like a lantern */}
              <div className="relative grid aspect-[5/2] place-items-center">
                <div className="pattern absolute inset-0 opacity-[0.16]" />
                <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_70%,rgb(245_177_76/0.28),transparent)]" />
                <svg viewBox="0 0 40 40" className="relative mt-6 size-10" aria-hidden="true">
                  <path d="M20 2l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#f5b14c" />
                  <rect x="12" y="12" width="16" height="16" transform="rotate(45 20 20)" fill="none" stroke="#f5b14c" strokeWidth="1.5" />
                </svg>
                <span className="mono absolute bottom-2 text-[0.68rem] tracking-wide text-muted">{D.engine}</span>
              </div>

              <div className="space-y-3 px-3.5 pb-4 sm:px-4">
                {/* offer card */}
                <div className="card rise p-3.5" style={rise(4)}>
                  <div className="flex items-start gap-3">
                    <CompanyAvatar name={D.company} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted">
                        {D.company} · {D.place}
                      </p>
                      <p className="display mt-0.5 text-[1.05rem] leading-tight">{D.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="chip chip-accent">{D.verdict}</span>
                        <span className="chip">{D.type}</span>
                      </div>
                    </div>
                    <ScoreRing value={4.6} size={58} label="" />
                  </div>
                  <ul className="mt-3.5 space-y-1.5">
                    {V.dims.map((name, i) => (
                      <li key={name} className="grid grid-cols-[6.5rem_1fr_1.75rem] items-center gap-2 text-[0.72rem]">
                        <span className="truncate text-ink-2">{name}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full origin-left rounded-full rise"
                            style={{ width: `${((DIMS[i] - 1) / 4) * 100}%`, background: scoreColor(DIMS[i]), ...rise(6 + i) }}
                          />
                        </span>
                        <span className="mono text-right text-muted">{num(DIMS[i])}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* pipeline stage */}
                <ol className="rise flex items-center gap-1 overflow-hidden" style={rise(9)}>
                  {D.stages.map((st, i) => (
                    <li key={st} className="flex min-w-0 items-center gap-1">
                      <span
                        className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                          i < 2
                            ? "bg-accent-soft text-accent-text"
                            : i === 2
                              ? `bg-saffron-soft text-saffron ${s.pulse}`
                              : "border border-line text-muted"
                        }`}
                      >
                        {i < 2 && <Check size={11} aria-hidden="true" />}
                        <span className="truncate">{st}</span>
                      </span>
                      {i < D.stages.length - 1 && <span className="h-px w-2 shrink-0 bg-line-strong" />}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* coach bubble, floating out of the arch */}
      <div className={`${s.float} absolute left-0 top-full -mt-3 w-[min(82%,290px)] sm:-left-12`} style={delay("-2.5s")}>
        <div className="card rise p-3.5 shadow-pop" style={rise(11)}>
          <p className="flex items-center gap-2 text-xs font-semibold text-saffron">
            <Mic size={14} aria-hidden="true" /> {D.coachName}
          </p>
          <p className="mt-1.5 text-[0.8rem] leading-snug text-ink-2">{D.coachTip}</p>
        </div>
      </div>

      {/* reminder pill */}
      <div className={`${s.float} absolute right-0 top-[14%] sm:-right-6`} style={delay("-4.5s")}>
        <span className="chip chip-saffron rise shadow-pop" style={rise(13)}>
          <Bell size={12} aria-hidden="true" /> {D.reminder}
        </span>
      </div>
    </div>
  );
}
