import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Bot, Database, Info, Palette, Bell } from "lucide-react";
import { PageHeader } from "@/components/kit";
import { getDict, getTheme } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { db, getProfile } from "@/lib/db";
import { getEngine } from "@/lib/ai";
import { checkOllama, claudeStatus, getMotion, getNotify } from "@/app/actions/settings";
import { storageInfo } from "@/app/api/backup/backup";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AiEngine } from "@/components/settings/ai-engine";
import { Appearance } from "@/components/settings/appearance";
import { NotificationSettings, ReminderNotifier } from "@/components/settings/notifications";
import { DataTools } from "@/components/settings/data-tools";

export const metadata: Metadata = { title: "Settings" };

function version(): string {
  try {
    return (JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string }).version ?? "—";
  } catch {
    return "—";
  }
}

function SettingsSection({ id, title, lead, children, i }: { id: string; icon?: React.ReactNode; title: string; lead?: string; children: React.ReactNode; i: number }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-24 p-5 rise" style={{ ["--i" as string]: i }}>
      <h2 id={`${id}-h`} className="text-[1.15rem] tracking-[-0.01em]">{title}</h2>
      {lead ? <p className="mb-3.5 mt-1 text-[0.85rem] text-muted">{lead}</p> : <div className="mb-3.5" />}
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const [{ t }, theme, motion, notify] = await Promise.all([getDict(), getTheme(), getMotion(), getNotify()]);
  const st = t.sources2.settings;
  const { settings } = getProfile();
  const [engine, claude, ollama] = await Promise.all([getEngine(settings), claudeStatus(), checkOllama(settings.ollama_url)]);
  const storage = storageInfo();
  const count = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  const k = st.about.keys;
  const shortcuts: [string[], string][] = [
    [["Ctrl", "K"], k.palette],
    [["/"], k.search],
    [["N"], k.newOffer],
    [["G", "T"], k.goToday],
    [["G", "O"], k.goOffers],
    [["G", "P"], k.goPipeline],
    [["G", "C"], k.goCalendar],
    [["G", "I"], k.goCoach],
    [["G", "K"], k.goUpskill],
    [["G", "U"], k.goProfile],
    [["G", "S"], k.goInsights],
    [["?"], k.help],
  ];
  const icons = { ai: <Bot size={15} />, appearance: <Palette size={15} />, notifications: <Bell size={15} />, data: <Database size={15} />, about: <Info size={15} /> };
  const sections = (["ai", "appearance", "notifications", "data", "about"] as const).map((id) => ({ id, label: st.sections[id], icon: icons[id] }));

  return (
    <>
      <PageHeader title={st.title} lead={st.lead} />
      <ReminderNotifier />
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav label={st.nav} items={sections} />
        <div className="min-w-0 max-w-[760px] space-y-3.5">
          <SettingsSection id="ai" i={1} icon={<Bot size={18} />} title={st.sections.ai} lead={st.ai.lead}>
            <AiEngine
              settings={{ provider: settings.provider, claude_model: settings.claude_model, ollama_url: settings.ollama_url, ollama_model: settings.ollama_model }}
              claude={claude}
              ollama={ollama}
              engine={engine.label}
            />
          </SettingsSection>

          <SettingsSection id="appearance" i={2} icon={<Palette size={18} />} title={st.sections.appearance}>
            <Appearance theme={theme} motion={motion} />
          </SettingsSection>

          <SettingsSection id="notifications" i={3} icon={<Bell size={18} />} title={st.sections.notifications} lead={st.notifications.lead}>
            <NotificationSettings enabled={notify} />
          </SettingsSection>

          <SettingsSection id="data" i={4} icon={<Database size={18} />} title={st.sections.data} lead={st.data.lead}>
            <DataTools
              file={storage.file}
              size={storage.bytes}
              jobs={count("SELECT COUNT(*) AS n FROM jobs")}
              applications={count("SELECT COUNT(*) AS n FROM applications")}
            />
          </SettingsSection>

          <SettingsSection id="about" i={5} icon={<Info size={18} />} title={st.sections.about}>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4 text-sm">
                <p>
                  <span className="display text-2xl">Khedma</span> <span className="chip mono ml-1">{fmt(st.about.version, { v: version() })}</span>
                  <span className="block text-[0.8rem] text-muted">{st.about.tagline}</span>
                </p>
                <div>
                  <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
                    {st.about.localFirst}
                  </h3>
                  <p className="mt-1 leading-relaxed text-ink-2">{st.about.localFirstText}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
                    {st.about.engines}
                  </h3>
                  <p className="mt-1 leading-relaxed text-ink-2">{st.about.enginesText}</p>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
                  {st.about.shortcuts}
                </h3>
                <dl className="grid gap-x-6 gap-y-2 text-[0.82rem]">
                  {shortcuts.map(([keys, label]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
                      <dt className="text-ink-2">{label}</dt>
                      <dd className="flex shrink-0 items-center gap-1">
                        {keys.map((key, i) => (
                          <kbd key={i} className="kbd">{key}</kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </>
  );
}
