import { getTheme } from "@/lib/i18n/server";
import { getProfile } from "@/lib/db";
import { getEngine } from "@/lib/ai";
import { getNotices } from "@/lib/notices";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [theme, engine] = await Promise.all([getTheme(), getEngine(getProfile().settings)]);
  const notices = getNotices();
  return (
    <div className="flex-1 lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Topbar theme={theme} ai={{ online: engine.online, label: engine.label }} notices={notices} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 outline-none sm:px-8 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
