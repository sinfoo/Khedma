import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { getDict, getTheme } from "@/lib/i18n/server";
import { Wordmark } from "@/components/logo";
import { LangToggle, ThemeToggle } from "@/components/prefs-toggles";
import { ScoreRing } from "@/components/ui";

export default async function Landing() {
  const [{ t, locale }, theme] = await Promise.all([getDict(), getTheme()]);
  const [l1, l2, l3] = t.landing.heroTitle;
  const specimen = {
    title: locale === "fr" ? "Stage d'été — Développeur backend" : "Summer internship — Backend developer",
    company: "Carthage Systems",
    dims: [
      [t.dims.match, 4.6],
      [t.dims.target, 4.8],
      [t.dims.growth, 4.2],
      [t.dims.culture, 3.9],
      [t.dims.red_flags, 5.0],
    ] as [string, number][],
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 flex items-center justify-between">
        <Link href="/" aria-label="ENITJobs" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label={t.a11y.navMain} className="flex items-center gap-1">
          <LangToggle />
          <ThemeToggle current={theme} />
          <Link href="/app" className="btn btn-primary btn-sm ml-2 hidden sm:inline-flex">
            {t.nav.openApp}
          </Link>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="ruled absolute inset-x-0 top-0 h-[560px] pointer-events-none" aria-hidden="true" />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <div>
              <p className="rise text-sm font-semibold tracking-wide uppercase text-accent" style={{ ["--i" as string]: 0 }}>
                {t.landing.eyebrow}
              </p>
              <h1 className="rise mt-4 text-5xl sm:text-6xl lg:text-7xl leading-[1.02]" style={{ ["--i" as string]: 1 }}>
                {l1}
                <br />
                {l2} <em className="italic text-accent">{l3}</em>
              </h1>
              <p className="rise mt-6 text-lg text-ink-2 max-w-xl" style={{ ["--i" as string]: 2 }}>
                {t.landing.heroText}
              </p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ ["--i" as string]: 3 }}>
                <Link href="/app" className="btn btn-primary text-base px-6 min-h-12">
                  {t.landing.ctaPrimary} <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href="#how" className="btn btn-secondary text-base px-6 min-h-12">
                  {t.landing.ctaSecondary}
                </a>
              </div>
              <p className="rise mt-6 inline-flex items-center gap-2 text-sm text-muted" style={{ ["--i" as string]: 4 }}>
                <ShieldCheck size={16} aria-hidden="true" className="text-accent" />
                {t.landing.localBadge}
              </p>
            </div>

            {/* Specimen evaluation card */}
            <div className="rise relative" style={{ ["--i" as string]: 3 }} aria-hidden="true">
              <div className="absolute -inset-6 rounded-[28px] bg-accent-soft/60 blur-2xl" />
              <div className="card relative p-6 rotate-[-1.5deg] hover:rotate-0 transition-transform duration-500">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted font-semibold">{specimen.company}</p>
                    <p className="display text-xl mt-1">{specimen.title}</p>
                  </div>
                  <ScoreRing value={4.6} size={72} label="" animate={false} />
                </div>
                <ul className="mt-6 space-y-2.5">
                  {specimen.dims.map(([name, v]) => (
                    <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="w-36 text-ink-2">{name}</span>
                        <span className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${((v - 1) / 4) * 100}%` }} />
                        </span>
                      </div>
                      <span className="mono text-xs text-muted">{v.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center gap-2">
                  <span className="chip chip-accent">{t.verdicts.apply_now}</span>
                  <span className="chip">Ollama · llama3.1</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section id="how" className="mx-auto max-w-6xl px-4 sm:px-6 py-16 scroll-mt-20">
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-2xl overflow-hidden border border-line">
            {t.landing.steps.map((s, i) => (
              <li key={s.k} className="bg-surface p-6 rise" style={{ ["--i" as string]: i }}>
                <span className="mono text-xs text-accent">{s.k}</span>
                <h2 className="text-2xl mt-2">{s.t}</h2>
                <p className="text-ink-2 mt-2 text-sm leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <h2 className="text-3xl sm:text-4xl max-w-2xl">{t.landing.featuresTitle}</h2>
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {t.landing.features.map((f, i) => (
              <li key={f.t} className="rise border-t border-line-strong pt-4" style={{ ["--i" as string]: i }}>
                <h3 className="text-lg font-semibold">{f.t}</h3>
                <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">{f.d}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Privacy */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <div className="card p-8 sm:p-12 grid md:grid-cols-[auto_1fr] gap-8 items-start">
            <div className="size-14 rounded-2xl bg-accent-soft grid place-items-center text-accent-text">
              <ShieldCheck size={28} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-3xl">{t.landing.privacyTitle}</h2>
              <p className="text-ink-2 mt-3 max-w-2xl leading-relaxed">{t.landing.privacyText}</p>
              <Link href="/app" className="btn btn-primary mt-6">
                {t.landing.ctaPrimary} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 text-sm text-muted flex flex-wrap justify-between gap-2">
        <span>{t.landing.footer}</span>
        <span className="mono">v0.1</span>
      </footer>
    </div>
  );
}
