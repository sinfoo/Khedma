import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { listStories } from "@/lib/repo/coach";
import { PageHeader } from "@/components/kit";
import { CoachTabs } from "@/components/coach/parts";
import { StoriesBoard } from "@/components/coach/stories-board";

export const metadata: Metadata = { title: "STAR" };

export default async function StoriesPage() {
  const { t } = await getDict();
  const stories = listStories();
  return (
    <>
      <PageHeader eyebrow={t.coach2.title} title={t.coach2.stories.heading} />
      <CoachTabs t={t} current="stories" />
      <StoriesBoard stories={stories} />
    </>
  );
}
