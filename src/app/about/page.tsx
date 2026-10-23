import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Brain, FileText, GraduationCap, Heart, Search, Send, ShieldCheck, Sparkles, Accessibility, Hand, Lock } from "lucide-react";
import { getDict, getTheme } from "@/lib/i18n/server";
import { GITHUB_URL, LandingFooter, LandingNav } from "@/components/landing/chrome";
import s from "@/components/landing/styles";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.about2.metaTitle, description: t.about2.metaDescription };
}

const TEAM = ["Safwen Bibeni", "Mahmoud Abid"];
const STACK = ["Next.js", "React", "TypeScript", "Tailwind CSS", "SQLite", "Claude"];
const DOES_ICONS = [Search, ShieldCheck, FileText, Send, Brain, Sparkles];
const VALUE_ICONS = [Lock, ShieldCheck, Hand, Accessibility];

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .join("");

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-32 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight">
      {children}
    </h2>
  );
}

export default async function AboutPage() {
  const [{ t }, theme] = await Promise.all([getDict(), getTheme()]);
  const A = t.about2;

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav t={t} theme={theme} current="about" />

      <main id="main" className="flex-1">
        <header className={`${s.night} ${s.sky} ${s.clip} relative`}>
          <div className="pattern pattern-fade" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-saffron">
              <span aria-hidden="true" className="size-1.5 rotate-45 bg-saffron" />
              {A.kicker}
            </p>
            <h1 className="mt-4 max-w-4xl text-[clamp(2.3rem,5.5vw,4.2rem)] leading-[1.02]">{A.title}</h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-2">{A.lede}</p>
            <dl className="mt-9 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              {A.facts.map((f) => (
                <div key={f.k} className="bg-surface p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{f.k}</dt>
                  <dd className="mt-1 text-sm font-medium text-ink">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <div className="mx-auto max-w-6xl space-y-24 px-4 py-16 sm:px-6 sm:py-20">
          <section aria-labelledby="why" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
            <div>
              <H2 id="why">{A.why.title}</H2>
              <p className="mt-4 text-lg text-ink-2">{A.why.p1}</p>
              <p className="mt-4 text-lg text-ink-2">{A.why.p2}</p>
            </div>
            <aside className="self-start rounded-2xl border border-line bg-surface p-6">
              <p lang="ar" dir="rtl" className="display text-5xl text-accent-text">
                خدمة
              </p>
              <p className="mt-3 text-ink-2">{A.why.name}</p>
            </aside>
          </section>

          <section aria-labelledby="does">
            <H2 id="does">{A.does.title}</H2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {A.does.items.map((it, i) => {
                const Icon = DOES_ICONS[i];
                return (
                  <li key={it.t} className="card rise p-5" style={{ ["--i" as string]: i }}>
                    <span aria-hidden="true" className={`${s.arch} grid h-11 w-10 place-items-center bg-accent-soft pt-1 text-accent-text`}>
                      <Icon size={18} />
                    </span>
                    <h3 className="mt-4 text-lg">{it.t}</h3>
                    <p className="mt-1 text-sm text-ink-2">{it.d}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="values">
            <H2 id="values">{A.values.title}</H2>
            <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {A.values.items.map((it, i) => {
                const Icon = VALUE_ICONS[i];
                return (
                  <li key={it.t} className="flex gap-4">
                    <Icon size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-saffron" />
                    <div>
                      <h3 className="text-lg">{it.t}</h3>
                      <p className="mt-1 text-ink-2">{it.d}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="team">
            <H2 id="team">{A.team.title}</H2>
            <p className="mt-3 text-lg text-ink-2">{A.team.lead}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {TEAM.map((name, i) => (
                <li key={name} className="card rise flex items-center gap-5 p-6" style={{ ["--i" as string]: i }}>
                  <span aria-hidden="true" className="display grid size-16 shrink-0 place-items-center rounded-2xl bg-accent text-xl text-[var(--accent-ink)]">
                    {initials(name)}
                  </span>
                  <div>
                    <p className="display text-xl">{name}</p>
                    <p className="mt-1 text-sm text-muted">{A.team.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="school" className="grid gap-6 md:grid-cols-2">
            <div className="card p-6">
              <GraduationCap size={24} aria-hidden="true" className="text-accent-text" />
              <h2 id="school" className="mt-4 text-2xl">
                {A.school.title}
              </h2>
              <p className="mt-2 text-ink-2">{A.school.text}</p>
            </div>
            <div className="card p-6">
              <h2 className="text-2xl">{A.stack.title}</h2>
              <p className="mt-2 text-ink-2">{A.stack.lead}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {STACK.map((x) => (
                  <li key={x} className="chip mono">
                    {x}
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-lg">{A.open.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{A.open.text}</p>
                <a href={GITHUB_URL} rel="noopener" className="btn btn-secondary btn-sm mt-4">
                  {A.open.cta} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </div>
          </section>

          <section aria-labelledby="cta-title" className={`${s.night} ${s.sky} relative overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12`}>
            <div className="pattern pattern-fade" aria-hidden="true" />
            <div className="relative">
              <h2 id="cta-title" className="text-[clamp(2rem,5vw,3.4rem)] leading-none">
                {A.cta.title}
              </h2>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app" className="btn btn-primary btn-lg">
                  {A.cta.primary} <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link href="/guide" className="btn btn-secondary btn-lg">
                  <BookOpen size={18} aria-hidden="true" /> {A.cta.secondary}
                </Link>
              </div>
              <p className="mt-8 flex items-center gap-2 text-sm text-muted">
                <Heart size={14} aria-hidden="true" className="text-danger" /> {A.made}
              </p>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter t={t} />
    </div>
  );
}
