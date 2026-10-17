"use client";

import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/kit/toast";
import { Catalog } from "./catalog";

/** Catalog with its "added" toast, so the server page can render it without a callback prop. */
export function CatalogClient({ existing, keywords, missingEnv }: { existing: string[]; keywords: string[]; missingEnv: string[] }) {
  const { t } = useT();
  const toast = useToast();
  return <Catalog existing={existing} keywords={keywords} missingEnv={missingEnv} onAdded={(_id, name) => toast.success(t.sources2.added, name)} />;
}
