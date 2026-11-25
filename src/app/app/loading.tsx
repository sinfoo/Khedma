import { getDict } from "@/lib/i18n/server";
import { PageSkeleton } from "@/components/shell/page-skeleton";

/**
 * Route-level placeholder while a page's data loads, for every route under /app. It takes the shape of the page it
 * stands for and stays hidden for the first 150 ms (.skeleton-page), so a fast page never flashes it.
 */
export default async function AppLoading() {
  const { t } = await getDict();
  return (
    <div aria-busy="true" className="skeleton-page">
      <p role="status" className="sr-only">{t.shell2.kit.loading}</p>
      <div aria-hidden="true">
        <PageSkeleton />
      </div>
    </div>
  );
}
