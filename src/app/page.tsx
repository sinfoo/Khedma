import Link from "next/link";
import { ArrowRight, BookOpen, Check, Cpu, Database, Globe, Laptop, WifiOff } from "lucide-react";
import { getDict, getTheme } from "@/lib/i18n/server";
import { Logo } from "@/components/logo";
import { LandingFooter, LandingNav } from "@/components/landing/chrome";
import { Door, Skyline } from "@/components/landing/door";
import { HeroPreview } from "@/components/landing/hero-preview";
import {
  AtsVignette,
  BoardsVignette,
  CoachVignette,
  InsightsVignette,
  SalaryVignette,
  ScoreVignette,
  TailorVignette,
  TrackVignette,
} from "@/components/landing/vignettes";
import s from "@/components/landing/styles";

const rise = (i: number) => ({ ["--i" as string]: i });

function Kicker({ children, night = false }: { children: React.ReactNode; night?: boolean }) {
  return (
    <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${night ? "text-saffron" : "text-accent-text"}`}>
      <span aria-hidden="true" className="size-1.5 rotate-45 bg-saffron" />
      {children}
    </p>
  );
}

export default async function Landing() {
  const [{ t, locale }, theme] = await Promise.all([getDict(), getTheme()]);
  const L = t.landing2;
  const V = L.features.v;

  const vignettes = [
    <ScoreVignette key="score" v={V} locale={locale} engine="Ollama · llama3.1" verdict={L.demo.verdict} />,
    <AtsVignette key="ats" v={V} />,
    <TailorVignette key="tailor" v={V} />,
    <CoachVignette key="coach" v={V} />,
    <TrackVignette key="track" v={V} />,
  ];
  const more = [<InsightsVignette key="i" v={V} />, <SalaryVignette key="s" v={V} />, <BoardsVignette key="b" v={V} />];

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav t={t} theme={theme} />

      <main id="main" className="flex-1">
        {/* ── Hero: the medina at night ── */}
        <section className={`${s.night} ${s.sky} ${s.clip} relative`} aria-labelledby="hero-title">
          <div className="pattern pattern-fade" aria-hidden="true" />
          <div className="relative z-10 mx-auto grid grid-cols-1 max-w-6xl items-center gap-16 px-4 pb-44 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.12fr_0.88fr] lg:pb-52">
            <div>
              <div className="rise" style={rise(0)}>
                <Kicker night>{L.hero.eyebrow}</Kicker>
              </div>
              <h1
                id="hero-title"
                className="rise mt-6 text-[clamp(2.75rem,7vw,5rem)] leading-[0.95] tracking-[-0.035em]"
                style={rise(1)}
              >
                {L.hero.title1}
                <br />
                <span className="relative inline-block text-accent-text">
                  {L.hero.word}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 24"
                    preserveAspectRatio="none"
                    className="absolute -bottom-[0.12em] left-0 h-[0.22em] w-full"
                  >
                    <path
                      d="M4 16C60 6 120 4 176 9s96 9 120 3"
                      fill="none"
                      stroke="#f5b14c"
                      strokeWidth="7"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={1}
                      style={{ ["--dash" as string]: 1, animation: "draw 0.9s 0.5s cubic-bezier(.2,.7,.2,1) both" }}
                    />
                  </svg>
                </span>
                <br />
                {L.hero.title2}
              </h1>
              <p className="rise mono mt-5 text-sm text-muted" style={rise(2)}>
                khedma ·{" "}
                <span lang="ar" dir="rtl" className="font-sans text-base text-ink-2">
                  خدمة
                </span>{" "}
                — {L.hero.gloss}
              </p>
              <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-ink-2" style={rise(3)}>
                {L.hero.lede}
              </p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={rise(4)}>
                <Link href="/app" className="btn btn-primary btn-lg">
                  {L.hero.ctaPrimary} <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href="#how" className="btn btn-secondary btn-lg">
                  {L.hero.ctaSecondary}
                </a>
              </div>
              <ul className="rise mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2" style={rise(5)}>
                {L.hero.proof.map((p) => (
                  <li key={p} className="inline-flex items-center gap-2">
                    <Check size={14} aria-hidden="true" className="text-saffron" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPreview t={t} locale={locale} />
          </div>
          <Skyline className="absolute inset-x-0 bottom-0 h-16 sm:h-24" />
        </section>

        {/* ── How it works: four steps along a thread ── */}
        <section id="how" className={`${s.clip} relative scroll-mt-28 py-24 sm:py-32 md:scroll-mt-20`} aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Kicker>{L.how.kicker}</Kicker>
              <h2 id="how-title" className="mt-4 text-[clamp(2.1rem,5vw,3.75rem)] leading-[1.02]">
                {L.how.title}
              </h2>
              <p className="mt-5 max-w-2xl text-lg text-ink-2">{L.how.lede}</p>
            </div>

            <div className="relative mt-16">
              <div aria-hidden="true" className={`${s.thread} absolute left-[12.5%] right-[12.5%] top-[33px] hidden h-0.5 lg:block`}>
                <div className={`${s.fillX} h-full bg-accent`} />
              </div>
              <div aria-hidden="true" className={`${s.threadV} absolute bottom-10 left-[27px] top-8 w-0.5 lg:hidden`}>
                <div className={`${s.fillY} h-full w-full bg-accent`} />
              </div>
              <ol className="relative grid grid-cols-1 gap-12 lg:grid-cols-4 lg:gap-8">
                {L.how.steps.map((st, i) => {
                  const last = i === L.how.steps.length - 1;
                  return (
                    <li key={st.t} className={`${s.reveal} grid grid-cols-[56px_minmax(0,1fr)] gap-5 lg:grid-cols-1 lg:justify-items-center lg:text-center`}>
                      <span
                        className={`${s.arch} display relative z-10 grid h-[68px] w-14 place-items-center pt-2 text-xl ${
                          last ? "bg-[#f5b14c] text-[#1a1205]" : "border-2 border-accent bg-bg text-accent-text"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-2xl">{st.t}</h3>
                        <p className="mt-2 leading-relaxed text-ink-2 lg:mx-auto lg:max-w-[16rem]">{st.d}</p>
                        <span className={`chip mono mt-4 ${last ? "chip-saffron" : "chip-accent"}`}>{st.meta}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Features: alternating rows with crafted vignettes ── */}
        <section
          id="features"
          className={`${s.clip} relative scroll-mt-28 border-t border-line bg-bg-elev py-24 sm:py-32 md:scroll-mt-20`}
          aria-labelledby="features-title"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <Kicker>{L.features.kicker}</Kicker>
              <h2 id="features-title" className="mt-4 text-[clamp(2.1rem,5vw,3.75rem)] leading-[1.02]">
                {L.features.title}
              </h2>
            </div>

            <ol className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
              {L.features.rows.map((r, i) => (
                <li key={r.k} className={`${s.reveal} grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
                  <div className={i % 2 ? "lg:order-2" : ""}>
                    <p className="flex items-center gap-3 text-sm">
                      <span className="mono text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
                      <span className="font-semibold text-accent-text">{r.k}</span>
                    </p>
                    <h3 className="mt-4 text-[clamp(1.7rem,3.4vw,2.6rem)] leading-[1.06]">{r.t}</h3>
                    <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-2">{r.d}</p>
                  </div>
                  <div className={`${s.archLow} relative overflow-hidden border border-line bg-surface-2 px-4 pb-8 pt-16 sm:px-10 sm:pb-10 sm:pt-20`}>
                    <div className="pattern pattern-fade" aria-hidden="true" />
                    <div className="relative">{vignettes[i]}</div>
                  </div>
                </li>
              ))}
            </ol>

            {/* three smaller doors */}
            <ul className="mt-24 grid grid-cols-1 gap-5 md:grid-cols-3 sm:mt-28">
              {L.features.more.map((m, i) => (
                <li key={m.t} className={`${s.reveal} ${s.archLow} flex flex-col border border-line bg-surface px-6 pb-6 pt-14`}>
                  <div className="min-h-[7.5rem]">{more[i]}</div>
                  <h3 className="mt-6 text-xl">{m.t}</h3>
                  <p className="mt-2 text-ink-2">{m.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Privacy: local-first, at night ── */}
        <section
          id="privacy"
          className={`${s.night} ${s.sky} ${s.clip} relative scroll-mt-28 py-24 sm:py-32 md:scroll-mt-20`}
          aria-labelledby="privacy-title"
        >
          <div className="pattern pattern-fade" aria-hidden="true" />
          <div className="relative mx-auto grid grid-cols-1 max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <div>
              <Kicker night>{L.privacy.kicker}</Kicker>
              <h2 id="privacy-title" className="mt-4 text-[clamp(2.3rem,5.6vw,4.25rem)] leading-[0.98]">
                {L.privacy.title}
              </h2>
              <p className="mt-5 max-w-xl text-lg text-ink-2">{L.privacy.lede}</p>

              <dl className="mt-12 space-y-8">
                {[
                  { Icon: Cpu, t: L.privacy.ollamaTitle, d: L.privacy.ollamaText },
                  { Icon: WifiOff, t: L.privacy.offlineTitle, d: L.privacy.offlineText },
                  { Icon: Globe, t: L.privacy.netTitle, d: L.privacy.netText },
                ].map(({ Icon, t: title, d }) => (
                  <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                    <dt className="contents">
                      <span className="grid size-10 place-items-center rounded-xl border border-line text-saffron">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="self-center text-lg font-semibold">{title}</span>
                    </dt>
                    <dd className="col-start-2 -mt-2 max-w-lg leading-relaxed text-ink-2">{d}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:pt-6">
              <figure className="relative rounded-[28px] border border-dashed border-line-strong p-5 pt-8 sm:p-7 sm:pt-9">
                <figcaption className="mono absolute -top-3 left-6 inline-flex items-center gap-2 bg-[#0a1120] px-2 text-xs text-muted">
                  <Laptop size={14} aria-hidden="true" /> {L.privacy.diagram.laptop}
                </figcaption>
                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                  {[
                    { icon: <Logo size={22} />, name: L.privacy.diagram.app, sub: `${L.privacy.diagram.local}:3000` },
                    { icon: <Database size={20} aria-hidden="true" className="text-accent-text" />, name: L.privacy.diagram.db, sub: "khedma.db" },
                    { icon: <Cpu size={20} aria-hidden="true" className="text-saffron" />, name: L.privacy.diagram.ai, sub: `${L.privacy.diagram.local}:11434` },
                  ].flatMap((n, i) => [
                    ...(i > 0
                      ? [
                          <span key={`c${i}`} aria-hidden="true" className="mx-auto h-4 w-px bg-accent sm:h-px sm:w-5" />,
                        ]
                      : []),
                    <div key={n.name} className="card flex items-center gap-3 p-3 sm:flex-col sm:items-start sm:gap-2">
                      {n.icon}
                      <div className="min-w-0">
                        <p className="font-semibold">{n.name}</p>
                        <p className="mono truncate text-[0.7rem] text-muted">{n.sub}</p>
                      </div>
                    </div>,
                  ])}
                </div>

                <p className="mt-7 text-sm font-semibold">{L.privacy.staysTitle}</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {L.privacy.stays.map((x) => (
                    <li key={x} className="flex items-start gap-2 text-sm text-ink-2">
                      <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                      {x}
                    </li>
                  ))}
                </ul>
                <p className="mono mt-4 border-t border-line pt-4 text-xs text-muted">{L.privacy.staysFile}</p>
              </figure>

              <div className="mt-6 flex items-center gap-3 pl-6">
                <span aria-hidden="true" className="h-8 w-px border-l border-dashed border-line-strong" />
                <span className="chip">
                  <Globe size={12} aria-hidden="true" /> {L.privacy.diagram.net}
                </span>
                <span className="text-xs text-muted">{L.privacy.diagram.netNote}</span>
              </div>

              <p className="mt-8 border-l-2 border-saffron pl-4 text-sm leading-relaxed text-muted">{L.privacy.voiceNote}</p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-28 py-24 sm:py-32 md:scroll-mt-20" aria-labelledby="faq-title">
          <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Kicker>{L.faq.kicker}</Kicker>
              <h2 id="faq-title" className="mt-4 text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.04]">
                {L.faq.title}
              </h2>
            </div>
            <div className="border-t border-line">
              {L.faq.items.map((f) => (
                <details key={f.q} className={`${s.faq} border-b border-line`}>
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-5 text-lg font-semibold">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className={`${s.plus} grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-lg leading-none text-accent-text`}
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA: the door ── */}
        <section className="px-4 pb-24 sm:px-6" aria-labelledby="cta-title">
          <div
            className={`${s.night} ${s.sky} relative mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-16 md:grid-cols-[1fr_auto]`}
          >
            <div className="pattern pattern-fade" aria-hidden="true" />
            <div className="relative">
              <h2 id="cta-title" className="text-[clamp(2.3rem,6vw,4.5rem)] leading-[0.98]">
                {L.cta.title}
              </h2>
              <p className="mt-5 max-w-lg text-lg text-ink-2">{L.cta.text}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app" className="btn btn-primary btn-lg">
                  {L.cta.primary} <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link href="/guide" className="btn btn-secondary btn-lg">
                  <BookOpen size={18} aria-hidden="true" /> {L.cta.secondary}
                </Link>
              </div>
            </div>
            <Door className="relative mx-auto w-36 sm:w-48 md:mr-6" />
          </div>
        </section>
      </main>

      <LandingFooter t={t} />
    </div>
  );
}
