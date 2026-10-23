import { Children, Fragment, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isDateRange, splitDates } from "@/lib/cv/sectionize";

const textOf = (n: ReactNode): string =>
  typeof n === "string" ? n : isValidElement<{ children?: ReactNode }>(n) ? Children.toArray(n.props.children).map(textOf).join("") : "";

/**
 * Entry dates on the right margin: a line ending in a date range ("Vermeg · Intern · 2025 - 2026"), or a line
 * holding only a date range (bold or not), which joins the line above it. DOM order stays what, then when.
 */
function dated(Tag: "p" | "h4") {
  return function Dated({ children }: { children?: ReactNode }) {
    const lines: ReactNode[][] = [[]];
    for (const k of Children.toArray(children)) {
      if (isValidElement(k) && k.type === "br") lines.push([]);
      else if (!(typeof k === "string" && !k.trim() && !lines[lines.length - 1].length)) lines[lines.length - 1].push(k); // the "\n" after each <br>
    }
    const rows: { line: ReactNode[]; date?: ReactNode }[] = [];
    for (const line of lines) {
      const prev = rows[rows.length - 1];
      if (prev && prev.date === undefined && line.length === 1 && isDateRange(textOf(line[0]))) {
        prev.date = line[0];
        continue;
      }
      const last = line[line.length - 1];
      const split = typeof last === "string" ? splitDates(last) : null;
      rows.push(split ? { line: [...line.slice(0, -1), split[0]], date: split[1] } : { line });
    }
    if (!rows.some((r) => r.date !== undefined)) return <Tag>{children}</Tag>;
    return (
      <Tag>
        {rows.map((r, i) =>
          r.date !== undefined ? (
            <span key={i} className="doc-row">
              <span>{r.line}</span>
              <span className="doc-date">{r.date}</span>
            </span>
          ) : (
            <Fragment key={i}>
              {r.line}
              {rows[i + 1] && rows[i + 1].date === undefined && <br />}
            </Fragment>
          ),
        )}
      </Tag>
    );
  };
}

const DATED: Components = { p: dated("p"), h3: dated("h4") };

/** "### Designer · Acme" then "**2019 - 2021**" on the next line: one entry heading carrying its dates. */
const headingDates = (md: string) =>
  md.replace(/^(#{3,6} .*\S)\n(?:\*\*|__)?([^\n*_\\]+?)(?:\*\*|__)?\\?$/gm, (m, h: string, d: string) => (isDateRange(d) ? `${h} · ${d.trim()}` : m));

export function Markdown({ children, className = "", dates = false }: { children: string; className?: string; dates?: boolean }) {
  return (
    <div className={`prose-doc ${className}`}>
      {/* Documents sit under the page h1: demote their headings one level. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: "h2", h2: "h3", h3: "h4", h4: "h5", ...(dates ? DATED : {}) }}>
        {dates ? headingDates(children) : children}
      </ReactMarkdown>
    </div>
  );
}
