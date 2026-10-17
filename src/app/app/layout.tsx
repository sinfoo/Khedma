import { getTheme } from "@/lib/i18n/server";
import { getNotices } from "@/lib/notices";
import { getShellData } from "@/lib/shell";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AutoScan } from "@/components/sources/auto-scan";
import { ReminderNotifier } from "@/components/settings/notifications";

// Applies the collapsed-rail preference before first paint (no layout flash).
const RAIL_SCRIPT = `try{if(localStorage.getItem("khedma:rail")==="1")document.documentElement.setAttribute("data-rail","")}catch(e){}`;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [theme, data] = await Promise.all([getTheme(), getShellData()]);
  const notices = getNotices();
  return (
    <div className="app-shell flex-1">
      <script dangerouslySetInnerHTML={{ __html: RAIL_SCRIPT }} />
      <Sidebar data={data} />
      <div className="flex min-w-0 flex-col">
        <Topbar theme={theme} notices={notices} data={data} />
        <AutoScan />
        <ReminderNotifier />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 outline-none sm:px-8 sm:pb-10 sm:pt-7">
          {children}
        </main>
      </div>
    </div>
  );
}
