export type DiffOp = { type: "same" | "add" | "del"; text: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Line diff via LCS on whitespace/case-normalised lines.
 * ponytail: O(n·m) table, capped at 600 lines per side; switch to Myers if CVs get longer.
 */
export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split("\n").slice(0, 600);
  const B = b.split("\n").slice(0, 600);
  const na = A.map(norm);
  const nb = B.map(norm);
  const n = A.length;
  const m = B.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (na[i] === nb[j]) {
      out.push({ type: "same", text: B[j] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ type: "del", text: A[i++] });
    else out.push({ type: "add", text: B[j++] });
  }
  while (i < n) out.push({ type: "del", text: A[i++] });
  while (j < m) out.push({ type: "add", text: B[j++] });
  return out;
}
