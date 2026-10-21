import { kvGet, kvSet } from "@/lib/db";
import { normalizeDocStyle, type DocStyle } from "./doc-style";

const KEY = "doc:style";

export function getDocStyle(): DocStyle {
  return normalizeDocStyle(kvGet<unknown>(KEY, {}));
}

export function setDocStyle(patch: Partial<DocStyle>): DocStyle {
  const next = normalizeDocStyle({ ...getDocStyle(), ...patch });
  kvSet(KEY, next);
  return next;
}
