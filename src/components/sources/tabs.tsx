import { LinkTabs } from "@/components/kit";
import { getDict } from "@/lib/i18n/server";

/** Scan / Sources / Preferences: the three jobs of the Sources area, one page each. */
export async function SourcesTabs({ current }: { current: "scan" | "sources" | "prefs" }) {
  const { t } = await getDict();
  const m = t.sources2.scan2.tabs;
  return (
    <LinkTabs
      label={m.label}
      current={current}
      tabs={[
        { key: "scan", href: "/app/sources", label: m.scan },
        { key: "sources", href: "/app/sources/manage", label: m.sources },
        { key: "prefs", href: "/app/sources/preferences", label: m.prefs },
      ]}
    />
  );
}
