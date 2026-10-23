import { getDict } from "@/lib/i18n/server";

/** Route-level placeholder while a page's data loads: a title and three plain blocks, so no layout is implied. */
export default async function AppLoading() {
  const { t } = await getDict();
  return (
    <div aria-busy="true" className="fade">
      <p role="status" className="sr-only">{t.shell2.kit.loading}</p>
      <div className="skeleton mb-2.5 h-3.5 w-[120px] rounded-[7px]" />
      <div className="skeleton mb-7 h-[34px] w-[300px] max-w-full rounded-[9px]" />
      <div className="flex flex-col gap-3">
        <div className="skeleton h-24 rounded-[14px]" />
        <div className="skeleton h-24 rounded-[14px]" />
        <div className="skeleton h-24 rounded-[14px]" />
      </div>
    </div>
  );
}
