import { getDict } from "@/lib/i18n/server";

/** Placeholder with the page's own shape: title, tabs, the criteria bar, then result cards. */
export default async function BoursesLoading() {
  const { t } = await getDict();
  return (
    <div aria-busy="true" className="fade">
      <p role="status" className="sr-only">{t.shell2.kit.loading}</p>
      <div className="skeleton mb-2.5 h-[34px] w-[220px] max-w-full rounded-[9px]" />
      <div className="skeleton mb-6 h-4 w-[520px] max-w-full rounded-[7px]" />
      <div className="skeleton mb-6 h-9 w-[340px] max-w-full rounded-[9px]" />
      <div className="skeleton mb-6 h-36 rounded-[14px]" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="skeleton h-40 rounded-[14px]" />
        <div className="skeleton h-40 rounded-[14px]" />
        <div className="skeleton h-40 rounded-[14px]" />
        <div className="skeleton h-40 rounded-[14px]" />
      </div>
    </div>
  );
}
