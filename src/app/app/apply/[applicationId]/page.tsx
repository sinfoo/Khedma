import { redirect } from "next/navigation";

/** The apply assistant now lives in the workspace's review step; old links land there. */
export default async function ApplyPage({ params }: { params: Promise<{ applicationId: string }> }) {
  redirect(`/app/pipeline/${encodeURIComponent((await params).applicationId)}?tab=overview`);
}
