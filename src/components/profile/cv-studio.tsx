"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, Printer } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { parseCv, SECTION_LABELS, toPlainText, type CvSection } from "@/lib/cv/sectionize";
import type { Locale } from "@/lib/types";

const TEMPLATES = ["classic", "modern", "compact"] as const;
type Template = (typeof TEMPLATES)[number];

// Print-safe accents, each ≥ 4.5:1 on white.
const ACCENTS = [
  { key: "blue", hex: "#0b5cad" },
  { key: "green", hex: "#17703f" },
  { key: "saffron", hex: "#8a5a00" },
  { key: "ink", hex: "#12161d" },
  { key: "plum", hex: "#6b2f8a" },
  { key: "red", hex: "#b3261e" },
] as const;
type AccentKey = (typeof ACCENTS)[number]["key"];

const SIDEBAR_KEYS = new Set(["skills", "languages", "certifications", "interests"]);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Paper typography: fixed dark-on-white regardless of app theme.
const md = (size: "base" | "sm"): Components => ({
  h1: ({ children }) => <h3 className="cv-h3">{children}</h3>,
  h2: ({ children }) => <h3 className="cv-h3">{children}</h3>,
  h3: ({ children }) => <h3 className="cv-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="cv-h3">{children}</h4>,
  p: ({ children }) => <p className={size === "sm" ? "my-0.5" : "my-1"}>{children}</p>,
  ul: ({ children }) => <ul className="my-1 list-disc pl-[1.1em]">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-[1.2em]">{children}</ol>,
  li: ({ children }) => <li className="cv-li my-[0.15em]">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#0d1117]">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} className="underline decoration-[0.5px] underline-offset-2">
      {children}
    </a>
  ),
});

export function CvStudio({ markdown, fromUpload, fileBase }: { markdown: string; fromUpload: boolean; fileBase: string }) {
  const { t, locale } = useT();
  const s = t.profile2.studio;
  const [tpl, setTpl] = useState<Template>("classic");
  const [accent, setAccent] = useState<AccentKey>("blue");
  const [labels, setLabels] = useState<Locale | "asis">(locale);
  const hex = ACCENTS.find((a) => a.key === accent)!.hex;

  const doc = parseCv(markdown);
  const title = (sec: CvSection) => (labels !== "asis" && sec.key !== "other" ? SECTION_LABELS[labels][sec.key] : sec.title);
  const introLines = doc.intro.split("\n").map((l) => l.trim()).filter(Boolean);
  const headline = introLines.filter((l) => /^\*\*.+\*\*$/.test(l) || !/[@·|]|https?:|\+?\d{2}[\d ]{6,}/.test(l)).map((l) => l.replace(/^\*\*|\*\*$/g, ""));
  const contact = introLines.filter((l) => !headline.includes(l.replace(/^\*\*|\*\*$/g, ""))).flatMap((l) => l.split(/\s*[·|•]\s*/)).filter(Boolean);

  const section = (sec: CvSection, i: number, small = false) => (
    <section key={i} className="cv-section">
      <h2 className="cv-h2">{title(sec)}</h2>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md(small ? "sm" : "base")}>
        {sec.body}
      </ReactMarkdown>
    </section>
  );

  const inline = (text: string) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>
      {text}
    </ReactMarkdown>
  );

  const name = doc.name || fileBase;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <style>{`
        .cv-paper { --cv-accent: ${hex}; color: #1f242c; background: #fff; font-family: var(--font-sans), "Segoe UI", Arial, sans-serif; }
        .cv-paper h1, .cv-paper h2, .cv-paper h3, .cv-paper h4 { font-family: var(--font-sans), "Segoe UI", Arial, sans-serif; letter-spacing: 0; color: #0d1117; }
        .cv-paper .cv-name { font-family: var(--font-display), var(--font-sans), sans-serif; letter-spacing: -0.01em; }
        .cv-paper .cv-h2 { color: var(--cv-accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; break-after: avoid; }
        .cv-paper .cv-h3 { font-weight: 650; break-after: avoid; margin-top: 0.55em; }
        .cv-paper .cv-section, .cv-paper .cv-li { break-inside: avoid; }
        .cv-paper li::marker { color: var(--cv-accent); }
        .cv-classic { font-size: 10pt; line-height: 1.42; }
        .cv-classic .cv-h2 { font-size: 9.5pt; border-bottom: 1px solid var(--cv-accent); padding-bottom: 2pt; margin: 12pt 0 5pt; }
        .cv-classic .cv-h3 { font-size: 10.5pt; }
        .cv-modern { font-size: 9.6pt; line-height: 1.42; }
        .cv-modern .cv-h2 { font-size: 9pt; margin: 11pt 0 4pt; }
        .cv-modern .cv-h3 { font-size: 10pt; }
        .cv-modern .cv-side { background: color-mix(in srgb, var(--cv-accent) 8%, #fff); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .cv-compact { font-size: 8.8pt; line-height: 1.32; }
        .cv-compact .cv-h2 { font-size: 8.4pt; margin: 7pt 0 2pt; border-bottom: 0.75pt solid #d5d8dd; padding-bottom: 1pt; }
        .cv-compact .cv-h3 { font-size: 9.2pt; margin-top: 0.35em; }
        @page { size: A4; margin: 12mm 13mm; }
        @media print {
          main#main { padding: 0 !important; max-width: none !important; }
          .cv-paper { box-shadow: none !important; border: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; }
          .cv-modern .cv-grid { min-height: 0 !important; }
        }
      `}</style>

      <aside className="space-y-5 no-print xl:sticky xl:top-20">
        <fieldset>
          <legend className="label">{s.template}</legend>
          <div className="space-y-1.5">
            {TEMPLATES.map((k) => (
              <label key={k} className="card flex cursor-pointer items-start gap-3 p-3 has-checked:!border-accent has-checked:!bg-accent-soft">
                <input type="radio" name="tpl" className="mt-1 accent-[var(--accent)]" checked={tpl === k} onChange={() => setTpl(k)} />
                <span>
                  <span className="block text-sm font-semibold">{s.templates[k]}</span>
                  <span className="block text-xs text-muted">{s.templateHints[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">{s.accent}</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <label key={a.key} className="relative cursor-pointer" title={s.accents[a.key]}>
                <input type="radio" name="accent" className="peer sr-only" checked={accent === a.key} onChange={() => setAccent(a.key)} />
                <span className="sr-only">{s.accents[a.key]}</span>
                <span
                  aria-hidden="true"
                  className="block size-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] peer-checked:ring-2 peer-checked:ring-[var(--ink)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--ring)]"
                  style={{ background: a.hex }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">{s.labels}</legend>
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
            {(["fr", "en", "asis"] as const).map((k) => (
              <label key={k} className="btn btn-sm cursor-pointer !border-0 has-checked:!bg-surface has-checked:!text-ink has-checked:!shadow-[var(--shadow-sm)] text-muted has-focus-visible:outline-2 has-focus-visible:outline-[var(--ring)]">
                <input type="radio" name="labels" className="sr-only" checked={labels === k} onChange={() => setLabels(k)} />
                {k === "asis" ? (
                  <>
                    <span aria-hidden="true">Aa</span>
                    <span className="sr-only">{s.asIs}</span>
                  </>
                ) : (
                  k.toUpperCase()
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <button type="button" className="btn btn-primary w-full" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> {s.print}
          </button>
          <p className="hint">{s.printTip}</p>
          <div className="grid gap-1.5 pt-1">
            <a className="btn btn-secondary btn-sm" href={`/api/cv/docx?accent=${hex.slice(1)}`} download>
              <FileText size={14} aria-hidden="true" /> {s.downloadDocx}
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`CV_${fileBase}.md`, markdown, "text/markdown;charset=utf-8")}>
              <Download size={14} aria-hidden="true" /> {s.downloadMd}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`CV_${fileBase}.txt`, toPlainText(markdown), "text/plain;charset=utf-8")}>
              <Download size={14} aria-hidden="true" /> {s.downloadTxt}
            </button>
          </div>
        </div>
        {fromUpload && <p className="rounded-lg bg-saffron-soft p-3 text-sm text-saffron">{s.fromUpload}</p>}
      </aside>

      <div className="min-w-0 overflow-x-auto">
        <article
          aria-label={s.paper}
          className={`cv-paper cv-${tpl} mx-auto w-full max-w-[210mm] rounded-sm shadow-[var(--shadow-lg)] ring-1 ring-black/5 ${tpl === "modern" ? "" : "px-[7%] py-[6%] sm:px-[14mm] sm:py-[13mm]"}`}
          style={{ minHeight: "297mm" }}
        >
          {tpl === "classic" && (
            <>
              <header className="text-center">
                <h1 className="cv-name text-[22pt] font-bold leading-tight">{name}</h1>
                {headline.map((h) => (
                  <p key={h} className="mt-1 text-[10.5pt] font-medium" style={{ color: hex }}>
                    {inline(h)}
                  </p>
                ))}
                {contact.length > 0 && <p className="mt-1.5 text-[9pt] text-[#4a5160]">{contact.join("  ·  ")}</p>}
              </header>
              {doc.sections.map((sec, i) => section(sec, i))}
            </>
          )}

          {tpl === "compact" && (
            <>
              <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 pb-1.5" style={{ borderColor: hex }}>
                <div>
                  <h1 className="cv-name text-[17pt] font-bold leading-none">{name}</h1>
                  {headline.map((h) => (
                    <p key={h} className="mt-1 text-[9pt] font-medium" style={{ color: hex }}>
                      {inline(h)}
                    </p>
                  ))}
                </div>
                {contact.length > 0 && (
                  <ul className="text-right text-[8pt] text-[#4a5160]">
                    {contact.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </header>
              {doc.sections.filter((x) => !SIDEBAR_KEYS.has(x.key)).map((sec, i) => section(sec, i, true))}
              <div className="grid grid-cols-2 gap-x-6">
                {doc.sections.filter((x) => SIDEBAR_KEYS.has(x.key)).map((sec, i) => section(sec, i, true))}
              </div>
            </>
          )}

          {tpl === "modern" && (
            <div className="cv-grid grid min-h-[297mm] grid-cols-[34%_1fr]">
              <aside className="cv-side px-[5mm] py-[12mm]">
                <h1 className="cv-name text-[18pt] font-bold leading-tight" style={{ color: hex }}>
                  {name}
                </h1>
                {headline.map((h) => (
                  <p key={h} className="mt-1.5 text-[9.2pt] font-medium">
                    {inline(h)}
                  </p>
                ))}
                {contact.length > 0 && (
                  <section className="cv-section">
                    <h2 className="cv-h2">{s.contact}</h2>
                    <ul className="space-y-0.5 break-words text-[8.6pt]">
                      {contact.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {doc.sections.filter((x) => SIDEBAR_KEYS.has(x.key)).map((sec, i) => section(sec, i, true))}
              </aside>
              <div className="px-[7mm] py-[12mm]">
                {doc.sections.filter((x) => !SIDEBAR_KEYS.has(x.key)).map((sec, i) => section(sec, i))}
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
