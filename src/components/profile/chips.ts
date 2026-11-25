// Pure list logic of ChipInput, so paste and duplicate handling have a test.

/**
 * Add typed or pasted text to a chip list: split on commas, semicolons, tabs and line breaks, drop list bullets,
 * skip what is already there (case-insensitive) and snap to a suggestion's spelling. Never longer than `max`.
 */
export function addChips(values: string[], raw: string, suggestions: string[] = [], max = 60): string[] {
  const next = [...values];
  for (const part of raw.split(/[,;\t\r\n]+/)) {
    const p = part.replace(/^\s*[•·*–-]\s+/, "").trim().replace(/\s+/g, " ");
    if (!p) continue;
    const canon = (suggestions.find((s) => s.toLowerCase() === p.toLowerCase()) ?? p).slice(0, 100);
    if (!next.some((x) => x.toLowerCase() === canon.toLowerCase())) next.push(canon);
  }
  return next.slice(0, max);
}
