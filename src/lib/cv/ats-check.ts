// ATS parseability score for a CV (Markdown + the template it will be rendered with).
// Weights follow career-ops verify-ats: text 15, headings 20, contact 15, layout 20,
// images 10, fonts 10, charset 5, hidden text 5. Pure, client-safe.
import { parseCv, toPlainText, type SectionKey } from "./sectionize";

export type AtsItemId = "text" | "sections" | "contact" | "layout" | "images" | "fonts" | "charset" | "hidden";
export type AtsGrade = "A" | "B" | "C" | "D";

export interface AtsItem {
  id: AtsItemId;
  weight: number;
  ok: boolean;
  /** Machine detail for the UI (missing headings, bad fonts…). */
  detail?: string[];
}

export interface AtsReport {
  score: number;
  grade: AtsGrade;
  items: AtsItem[];
  /** Standard sections an ATS keys off that are absent. */
  missing: SectionKey[];
  /** Rough page count at ~450 words per page. */
  pages: number;
}

/** How the chosen template lays the text out; defaults describe a plain single-column page. */
export interface AtsLayout {
  columns?: number;
  fonts?: string[];
  images?: boolean;
}

export const WEIGHTS: Record<AtsItemId, number> = { text: 15, sections: 20, contact: 15, layout: 20, images: 10, fonts: 10, charset: 5, hidden: 5 };

const SAFE_FONTS = new Set([
  "arial", "helvetica", "helvetica neue", "liberation sans", "dejavu sans", "calibri", "candara", "corbel", "segoe ui", "tahoma", "verdana",
  "trebuchet ms", "times new roman", "times", "georgia", "cambria", "garamond", "book antiqua", "palatino", "palatino linotype", "lato", "roboto",
  "open sans", "noto sans", "source sans pro", "pt sans", "sans-serif", "serif",
]);

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ZERO_WIDTH = /[​-‏⁠﻿]/;
const TABLE = /^\s*\|.*\|\s*$/m;

export const gradeFor = (score: number): AtsGrade => (score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D");

export function atsVerify(markdown: string, layout: AtsLayout = {}): AtsReport {
  const md = (markdown ?? "").replace(/\r\n?/g, "\n");
  const plain = toPlainText(md);
  const doc = parseCv(md);
  const keys = new Set(doc.sections.map((s) => s.key));
  const required: SectionKey[] = ["experience", "education", "skills"];
  const missing = required.filter((k) => !keys.has(k) && !(k === "experience" && keys.has("projects")));
  const fonts = (layout.fonts ?? []).map((f) => f.toLowerCase().replace(/["']/g, "").trim()).filter(Boolean);
  const badFonts = fonts.filter((f) => !SAFE_FONTS.has(f));
  const words = (plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) ?? []).length;
  const stuffed = Object.entries(
    (plain.toLowerCase().match(/[\p{L}][\p{L}+#.]{2,}/gu) ?? []).reduce<Record<string, number>>((a, w) => ((a[w] = (a[w] ?? 0) + 1), a), {}),
  )
    .filter(([w, n]) => n > 12 && !/^(?:and|the|with|pour|avec|des|les|une|dans|sur|for|from|that|this|une|the|et|de|du|la|le|en)$/.test(w))
    .map(([w]) => w);

  const items: AtsItem[] = [
    { id: "text", weight: WEIGHTS.text, ok: plain.trim().length >= 300 },
    { id: "sections", weight: WEIGHTS.sections, ok: missing.length === 0, detail: missing },
    { id: "contact", weight: WEIGHTS.contact, ok: EMAIL.test(md) },
    { id: "layout", weight: WEIGHTS.layout, ok: (layout.columns ?? 1) <= 1 && !TABLE.test(md), detail: TABLE.test(md) ? ["table"] : [] },
    { id: "images", weight: WEIGHTS.images, ok: !layout.images && !/!\[[^\]]*\]\(/.test(md) },
    { id: "fonts", weight: WEIGHTS.fonts, ok: badFonts.length === 0, detail: badFonts },
    { id: "charset", weight: WEIGHTS.charset, ok: !/�|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(md) },
    { id: "hidden", weight: WEIGHTS.hidden, ok: !ZERO_WIDTH.test(md) && stuffed.length === 0, detail: stuffed.slice(0, 5) },
  ];
  const score = items.reduce((a, i) => a + (i.ok ? i.weight : 0), 0);
  return { score, grade: gradeFor(score), items, missing, pages: Math.max(1, Math.ceil(words / 450)) };
}
