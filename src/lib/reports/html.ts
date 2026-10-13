// Self-contained printable HTML and Markdown report builders. Pure: the caller
// passes the data and the translated labels; everything user-provided is escaped.
import type { AppState } from "../types";

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ReportRow {
  id: number;
  title: string;
  company: string;
  type: string;
  status: AppState;
  statusLabel: string;
  score: number | null;
  verdict: string;
  created_at: string;
  applied_at: string | null;
  deadline: string | null;
  channel: string;
  outcome: string;
  lesson: string;
}

export interface ReportData {
  title: string;
  subtitle: string;
  generated: string;
  owner: string;
  kpis: { label: string; value: string | number; hint?: string }[];
  funnel: { label: string; count: number }[];
  rows: ReportRow[];
  interviews: { when: string; kind: string; title: string; company: string; outcome: string }[];
  lessons: { title: string; company: string; outcome: string; lesson: string }[];
  focus: string[];
  labels: {
    kpis: string;
    funnel: string;
    applications: string;
    interviews: string;
    lessons: string;
    focus: string;
    none: string;
    col: { offer: string; company: string; type: string; status: string; score: string; verdict: string; applied: string; deadline: string; outcome: string; lesson: string; when: string; kind: string };
    footer: string;
  };
}

const e = escapeHtml;
const td = (v: unknown, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${e(v)}</td>`;

export function reportHtml(d: ReportData): string {
  const L = d.labels;
  const max = Math.max(1, ...d.funnel.map((f) => f.count));
  const table = (head: string[], body: string[][], empty: string) =>
    body.length
      ? `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c, i) => td(c, i === 4 ? "num" : "")).join("")}</tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">${e(empty)}</p>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(d.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 24px; font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #15202b; background: #fff; max-width: 980px; margin-inline: auto; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #5b6b7a; margin: 32px 0 10px; border-bottom: 1px solid #e3e8ee; padding-bottom: 6px; }
  .sub { color: #5b6b7a; margin: 0 0 20px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .kpi { border: 1px solid #e3e8ee; border-radius: 10px; padding: 12px 14px; }
  .kpi b { display: block; font-size: 24px; font-variant-numeric: tabular-nums; }
  .kpi span { color: #5b6b7a; font-size: 12px; }
  .kpi small { display: block; color: #8593a1; font-size: 11px; }
  .funnel div { display: grid; grid-template-columns: 120px 1fr 40px; align-items: center; gap: 10px; margin: 4px 0; }
  .funnel i { display: block; height: 14px; background: #1f6feb; border-radius: 4px; min-width: 2px; }
  .funnel em { font-style: normal; text-align: right; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; font-weight: 600; color: #5b6b7a; border-bottom: 1px solid #e3e8ee; padding: 6px 8px; }
  td { border-bottom: 1px solid #eef1f4; padding: 6px 8px; vertical-align: top; }
  td.num { font-variant-numeric: tabular-nums; text-align: right; }
  .muted { color: #8593a1; }
  ul { padding-left: 18px; }
  footer { margin-top: 36px; color: #8593a1; font-size: 11px; border-top: 1px solid #e3e8ee; padding-top: 10px; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <h1>${e(d.title)}</h1>
  <p class="sub">${e(d.subtitle)}${d.owner ? ` · ${e(d.owner)}` : ""} · ${e(d.generated)}</p>
</header>

<h2>${e(L.kpis)}</h2>
<div class="kpis">${d.kpis.map((k) => `<div class="kpi"><b>${e(k.value)}</b><span>${e(k.label)}</span>${k.hint ? `<small>${e(k.hint)}</small>` : ""}</div>`).join("")}</div>

<h2>${e(L.funnel)}</h2>
<div class="funnel">${d.funnel
    .map((f) => `<div><span>${e(f.label)}</span><i style="width:${Math.round((f.count / max) * 100)}%"></i><em>${f.count}</em></div>`)
    .join("")}</div>

<h2>${e(L.focus)}</h2>
${d.focus.length ? `<ul>${d.focus.map((f) => `<li>${e(f)}</li>`).join("")}</ul>` : `<p class="muted">${e(L.none)}</p>`}

<h2>${e(L.applications)}</h2>
${table(
    [L.col.offer, L.col.company, L.col.type, L.col.status, L.col.score, L.col.verdict, L.col.applied, L.col.deadline, L.col.outcome, L.col.lesson],
    d.rows.map((r) => [r.title, r.company, r.type, r.statusLabel, r.score?.toFixed(1) ?? "—", r.verdict, r.applied_at ?? "—", r.deadline ?? "—", r.outcome, r.lesson]),
    L.none,
  )}

<h2>${e(L.interviews)}</h2>
${table([L.col.when, L.col.kind, L.col.offer, L.col.company, L.col.outcome], d.interviews.map((i) => [i.when, i.kind, i.title, i.company, i.outcome]), L.none)}

<h2>${e(L.lessons)}</h2>
${d.lessons.length ? `<ul>${d.lessons.map((l) => `<li><b>${e(l.title)} — ${e(l.company)}</b>${l.outcome ? ` (${e(l.outcome)})` : ""}: ${e(l.lesson)}</li>`).join("")}</ul>` : `<p class="muted">${e(L.none)}</p>`}

<footer>${e(L.footer)}</footer>
</body>
</html>
`;
}

const mdCell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const mdTable = (head: string[], rows: string[][], empty: string) =>
  rows.length
    ? `| ${head.map(mdCell).join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`).join("\n")}\n`
    : `_${empty}_\n`;

export function reportMarkdown(d: ReportData): string {
  const L = d.labels;
  return [
    `# ${d.title}`,
    `${d.subtitle}${d.owner ? ` · ${d.owner}` : ""} · ${d.generated}`,
    ``,
    `## ${L.kpis}`,
    ...d.kpis.map((k) => `- **${k.label}**: ${k.value}${k.hint ? ` (${k.hint})` : ""}`),
    ``,
    `## ${L.funnel}`,
    ...d.funnel.map((f) => `- ${f.label}: ${f.count}`),
    ``,
    `## ${L.focus}`,
    ...(d.focus.length ? d.focus.map((f) => `- ${f}`) : [`_${L.none}_`]),
    ``,
    `## ${L.applications}`,
    mdTable(
      [L.col.offer, L.col.company, L.col.type, L.col.status, L.col.score, L.col.verdict, L.col.applied, L.col.deadline, L.col.outcome, L.col.lesson],
      d.rows.map((r) => [r.title, r.company, r.type, r.statusLabel, r.score?.toFixed(1) ?? "—", r.verdict, r.applied_at ?? "—", r.deadline ?? "—", r.outcome, r.lesson]),
      L.none,
    ),
    `## ${L.interviews}`,
    mdTable([L.col.when, L.col.kind, L.col.offer, L.col.company, L.col.outcome], d.interviews.map((i) => [i.when, i.kind, i.title, i.company, i.outcome]), L.none),
    `## ${L.lessons}`,
    ...(d.lessons.length ? d.lessons.map((l) => `- **${l.title} — ${l.company}**${l.outcome ? ` (${l.outcome})` : ""}: ${l.lesson}`) : [`_${L.none}_`]),
    ``,
    `---`,
    L.footer,
    ``,
  ].join("\n");
}
