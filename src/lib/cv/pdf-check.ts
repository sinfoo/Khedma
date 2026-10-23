// What an ATS reads from the PDF Khedma actually sends. Checks the text layer of the rendered file, not the
// markdown it came from. Rules after Awesome-CV's check_pdfs.py and Resume-Matcher's round-trip check (ideas only).

export type PdfIssue =
  | { kind: "empty-page"; page: number }
  | { kind: "garbled"; count: number }
  | { kind: "placeholder"; text: string }
  | { kind: "missing"; what: "name" | "email" | "phone" }
  | { kind: "too-long"; pages: number; max: number };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/\D/g, "");

/** Issues found in the extracted pages; `expect` holds what must be readable (empty strings are skipped). */
export function checkPdfText(pages: string[], expect: { name: string; email: string; phone: string; maxPages: number }): PdfIssue[] {
  const issues: PdfIssue[] = [];
  pages.forEach((p, i) => {
    if (p.replace(/\s/g, "").length < 20) issues.push({ kind: "empty-page", page: i + 1 });
  });
  const all = pages.join("\n");
  // U+FFFD and private-use glyphs: an icon font or a missing glyph an ATS cannot read.
  const garbled = (all.match(/[�-]/g) ?? []).length;
  if (garbled) issues.push({ kind: "garbled", count: garbled });
  const ph = all.match(/\[[^\]\n]{1,60}\](?!\()/);
  if (ph) issues.push({ kind: "placeholder", text: ph[0] });
  const text = fold(all);
  if (expect.name.trim() && !text.includes(fold(expect.name.trim()))) issues.push({ kind: "missing", what: "name" });
  if (expect.email.trim() && !text.includes(expect.email.trim().toLowerCase())) issues.push({ kind: "missing", what: "email" });
  const phone = digits(expect.phone).slice(-8);
  if (phone.length === 8 && !digits(all).includes(phone)) issues.push({ kind: "missing", what: "phone" });
  if (pages.length > expect.maxPages) issues.push({ kind: "too-long", pages: pages.length, max: expect.maxPages });
  return issues;
}
