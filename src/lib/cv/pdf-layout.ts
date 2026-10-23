// PDF text in reading order. Plain text extraction interleaves two-column CVs (Canva-style sidebars) line by line;
// here rows are rebuilt from positions, a column gutter is looked for, and each column is read top to bottom
// between the full-width rows (name header, rules across both columns). Pure.
// Gutter sweep and the right-aligned-dates exception after srbhr/Resume-Matcher ats_parse/checks.py (Apache-2.0).

export interface PdfItem {
  str: string;
  /** PDF space: origin bottom-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

type Row = { items: PdfItem[]; top: number; bottom: number };

const COLUMN_MIN_LINES = 3;
const COLUMN_MIN_COVERAGE = 0.2;

/** Items on one baseline, top of the page first. */
function rows(items: PdfItem[], pageHeight: number): Row[] {
  const out: PdfItem[][] = [];
  for (const it of [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = out.find((r) => Math.abs(r[0].y - it.y) < Math.max(2, r[0].fontSize * 0.5));
    if (row) row.push(it);
    else out.push([it]);
  }
  return out.map((r) => {
    r.sort((a, b) => a.x - b.x);
    const size = Math.max(...r.map((i) => i.fontSize || i.height || 10));
    const top = pageHeight - Math.max(...r.map((i) => i.y)) - size;
    return { items: r, top, bottom: top + size };
  });
}

/** Text of items left to right; fragments of one word ("Dévelop" + "peur") are glued back. */
function join(items: PdfItem[]): string {
  let text = "";
  let end = -Infinity;
  for (const it of items) {
    const gap = it.x - end;
    text += text && gap > it.fontSize * 0.15 && !text.endsWith(" ") && !it.str.startsWith(" ") ? ` ${it.str}` : it.str;
    end = it.x + it.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** A row crosses gutter `g` when an item straddles it, or its words continue across it with a normal word gap. */
function crosses(r: Row, g: number): boolean {
  if (r.items.some((i) => i.x < g && g < i.x + i.width)) return true;
  const left = r.items.filter((i) => i.x + i.width <= g);
  const right = r.items.filter((i) => i.x >= g);
  if (!left.length || !right.length) return false;
  const gap = right[0].x - Math.max(...left.map((i) => i.x + i.width));
  return gap < right[0].fontSize * 1.5;
}

/** Many short pieces ending on one right edge: dates beside entry titles, not a column. */
function rightAligned(parts: PdfItem[][], pageWidth: number): boolean {
  const ends = parts.map((p) => Math.max(...p.map((i) => i.x + i.width)));
  const edge = Math.max(...ends);
  const widths = parts.map((p, k) => ends[k] - p[0].x);
  return ends.filter((e) => edge - e <= 3).length >= parts.length * 0.8 && Math.max(...widths) < pageWidth * 0.3;
}

/** x of a gutter that separates two text columns over a large span, or null for a single-column page. */
export function findGutter(items: PdfItem[], pageWidth: number, pageHeight: number): number | null {
  const rs = rows(items, pageHeight);
  if (rs.length < COLUMN_MIN_LINES * 2) return null;
  // The gutter is the position crossed by the fewest rows inside the columns' shared span (the first fit can sit
  // inside a column whose lines happen to stop short of it).
  let best: { g: number; crossing: number } | null = null;
  for (let step = 20; step <= 80; step += 1) {
    const g = (pageWidth * step) / 100;
    const split = rs.filter((r) => !crosses(r, g));
    const left = split.filter((r) => r.items.some((i) => i.x + i.width <= g));
    const right = split.filter((r) => r.items.some((i) => i.x >= g));
    if (left.length < COLUMN_MIN_LINES || right.length < COLUMN_MIN_LINES) continue;
    if (rightAligned(right.map((r) => r.items.filter((i) => i.x >= g)), pageWidth)) continue;
    const lo = Math.max(left[0].top, right[0].top);
    const hi = Math.min(left[left.length - 1].bottom, right[right.length - 1].bottom);
    if (hi - lo < pageHeight * COLUMN_MIN_COVERAGE) continue;
    const crossing = rs.filter((r) => r.top > lo && r.bottom < hi && crosses(r, g)).length;
    if (!best || crossing < best.crossing) best = { g, crossing };
  }
  // Rows crossing the gutter inside the shared span mean one text column, not two.
  return best && best.crossing <= 1 ? best.g : null;
}

/** One page's text in reading order. */
export function pageText(items: PdfItem[], pageWidth: number, pageHeight: number): string {
  const rs = rows(items, pageHeight);
  const g = findGutter(items, pageWidth, pageHeight);
  if (g === null) return rs.map((r) => join(r.items)).filter(Boolean).join("\n");
  // Full-width rows cut the page into bands; each band reads its left column, then its right one.
  const out: string[] = [];
  let left: string[] = [];
  let right: string[] = [];
  const flush = () => {
    out.push(...left, ...right);
    left = [];
    right = [];
  };
  for (const r of rs) {
    if (crosses(r, g)) {
      flush();
      out.push(join(r.items));
      continue;
    }
    const l = join(r.items.filter((i) => i.x + i.width <= g));
    const rt = join(r.items.filter((i) => i.x >= g));
    if (l) left.push(l);
    if (rt) right.push(rt);
  }
  flush();
  return out.filter(Boolean).join("\n");
}

const PROFILE_LINK = /(linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|kaggle\.com)\//i;

/** Profile links that exist only behind an icon (annotation URL, not in the text), each once. */
export function iconLinks(text: string, links: string[]): string[] {
  const have = text.toLowerCase();
  const out: string[] = [];
  for (const raw of links) {
    const url = raw.trim();
    if (!PROFILE_LINK.test(url)) continue;
    const bare = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    if (!have.includes(bare.toLowerCase()) && !out.includes(bare)) out.push(bare);
  }
  return out;
}
