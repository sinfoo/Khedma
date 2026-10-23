import type { Metadata } from "next";
import { ClipImport } from "@/components/sources/clip-import";

export const metadata: Metadata = { title: "Clipper" };

export default function ClipPage() {
  return <ClipImport />;
}
