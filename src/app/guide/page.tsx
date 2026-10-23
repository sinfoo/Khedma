import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, Lightbulb } from "lucide-react";
import { getDict, getTheme } from "@/lib/i18n/server";
import { GITHUB_URL, LandingFooter, LandingNav } from "@/components/landing/chrome";
import { Command } from "@/components/landing/command";
import s from "@/components/landing/styles";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.landing2.guide.metaTitle, description: t.landing2.guide.metaDescription };
}

const INSTALL_CMDS = [["winget install OpenJS.NodeJS.LTS"], [`git clone ${GITHUB_URL}.git`, "cd Khedma"], ["npm install"], ["npm run dev"]];
const AI_CMDS = [[], ["ANTHROPIC_API_KEY=..."], ["npm run dev"]];

function Steps({ steps, cmds }: { steps: { t: string; d: string }[]; cmds?: string[][] }) {
  return (
    <ol className="mt-8 space-y-8">
      {steps.map((st, i) => (
        <li key={st.t} className="grid grid-cols-[2.5rem_1fr] gap-4">
          <span
            aria-hidden="true"
            className={`${s.arch} display grid h-12 w-10 place-items-center bg-accent-soft pt-1.5 text-base text-accent-text`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 pt-1">
            <h3 className="text-lg">{st.t}</h3>
            <p className="mt-1 text-ink-2">{st.d}</p>
            {cmds?.[i] && (
              <div className="mt-3 space-y-2">
                {cmds[i].map((c) => (
                  <Command key={c} cmd={c} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="group scroll-mt-32 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight">
      <a href={`#${id}`} className="rounded-md hover:text-accent-text">
        {children}
        <span aria-hidden="true" className="ml-2 text-line-strong opacity-0 transition-opacity group-hover:opacity-100">
          #
        </span>
      </a>
    </h2>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-xs text-muted">+</span>}
          <kbd className="kbd">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export default async function GuidePage() {
  const [{ t }, theme] = await Promise.all([getDict(), getTheme()]);
  const G = t.landing2.guide;
  const toc = [
    { id: "install", label: G.sections.install },
    { id: "ai", label: G.sections.ai },
    { id: "first-steps", label: G.sections.first },
    { id: "shortcuts", label: G.sections.shortcuts },
    { id: "data", label: G.sections.data },
    { id: "troubleshooting", label: G.sections.trouble },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav t={t} theme={theme} current="guide" />

      <main id="main" className="flex-1">
        <header className={`${s.night} ${s.sky} ${s.clip} relative`}>
          <div className="pattern pattern-fade" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-saffron">
              <span aria-hidden="true" className="size-1.5 rotate-45 bg-saffron" />
              {G.kicker}
            </p>
            <h1 className="mt-4 max-w-3xl text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.98]">{G.title}</h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-2">{G.lede}</p>
            <ul className="mt-7 flex flex-wrap gap-2">
              {["Windows 10 / 11", "Node.js 24+", "SQLite"].map((x) => (
                <li key={x} className="chip mono">
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          <aside className="mb-12 lg:mb-0">
            <nav aria-label={G.toc} className="rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-24 lg:border-0 lg:bg-transparent lg:p-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{G.toc}</p>
              <ol className="mt-3 space-y-0.5 border-l border-line">
                {toc.map((x, i) => (
                  <li key={x.id}>
                    <a
                      href={`#${x.id}`}
                      className="-ml-px flex min-h-9 items-center gap-2.5 border-l-2 border-transparent pl-3 text-sm text-ink-2 hover:border-accent hover:text-ink"
                    >
                      <span className="mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      {x.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0 max-w-3xl space-y-20">
            <section aria-labelledby="install">
              <Heading id="install">{G.sections.install}</Heading>
              <p className="mt-3 text-lg text-ink-2">{G.install.intro}</p>
              <Steps steps={G.install.steps} cmds={INSTALL_CMDS} />
              <p className="mt-8 text-sm text-muted">{G.install.note}</p>
            </section>

            <section aria-labelledby="ai">
              <Heading id="ai">{G.sections.ai}</Heading>
              <p className="mt-3 text-lg text-ink-2">{G.ai.intro}</p>
              <Steps steps={G.ai.steps} cmds={AI_CMDS} />
              <p className="mt-8 flex gap-3 rounded-2xl bg-saffron-soft p-4 text-sm text-ink">
                <Lightbulb size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-saffron" />
                {G.ai.tip}
              </p>
            </section>

            <section aria-labelledby="first-steps">
              <Heading id="first-steps">{G.sections.first}</Heading>
              <p className="mt-3 text-lg text-ink-2">{G.first.intro}</p>
              <Steps steps={G.first.steps} />
              <Link href="/app" className="btn btn-primary mt-8">
                {t.landing2.nav.open} {t.landing2.nav.openRest} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>

            <section aria-labelledby="shortcuts">
              <Heading id="shortcuts">{G.sections.shortcuts}</Heading>
              <p className="mt-3 text-lg text-ink-2">{G.shortcuts.intro}</p>
              <div className="card mt-6 overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{G.shortcuts.key}</th>
                      <th scope="col">{G.shortcuts.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {G.shortcuts.rows.map((r) => (
                      <tr key={r.a}>
                        <td className="w-36">
                          <Keys keys={r.k} />
                        </td>
                        <td>{r.a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="mt-8 text-lg">{G.shortcuts.goTitle}</h3>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {G.shortcuts.go.map((g) => (
                  <li key={g.k} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <kbd className="kbd">G</kbd>
                      {G.shortcuts.then}
                      <kbd className="kbd">{g.k}</kbd>
                    </span>
                    <span className="text-ink">{g.a}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="data">
              <Heading id="data">{G.sections.data}</Heading>
              <p className="mt-3 text-lg text-ink-2">{G.data.intro}</p>
              <ul className="mt-6 space-y-3">
                {G.data.points.map((p) => (
                  <li key={p} className="flex gap-3 text-ink-2">
                    <Database size={16} aria-hidden="true" className="mt-1 shrink-0 text-accent-text" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="troubleshooting">
              <Heading id="troubleshooting">{G.sections.trouble}</Heading>
              <div className="mt-6 border-t border-line">
                {G.trouble.items.map((it) => (
                  <details key={it.q} className={`${s.faq} border-b border-line`}>
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-4 font-semibold">
                      {it.q}
                      <span
                        aria-hidden="true"
                        className={`${s.plus} grid size-7 shrink-0 place-items-center rounded-full border border-line-strong leading-none text-accent-text`}
                      >
                        +
                      </span>
                    </summary>
                    <div className="space-y-3 pb-5">
                      <p className="text-ink-2">{it.a}</p>
                      {it.cmd && <Command cmd={it.cmd} />}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </article>
        </div>
      </main>

      <LandingFooter t={t} />
    </div>
  );
}
