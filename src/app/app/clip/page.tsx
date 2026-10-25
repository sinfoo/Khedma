import { pageTitle } from "@/lib/i18n/title";
import { ClipImport } from "@/components/sources/clip-import";

export const generateMetadata = pageTitle("clip");

export default function ClipPage() {
  return <ClipImport />;
}
