import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApplication, getJob } from "@/lib/db";
import { normalizeForAts } from "@/lib/cv/export";
import { getDict } from "@/lib/i18n/server";
import { Markdown } from "@/components/markdown";
import { AutoPrint } from "./auto-print";
import { DocFit } from "./doc-fit";
import { docFontVars } from "./fonts";
import { fillPlaceholders, hardBreaks } from "@/lib/ai/placeholders";
import { detectLanguage } from "@/lib/ai/heuristic";
import { docFacts } from "@/lib/apply/doc-facts";
import { MARGIN_MM, docStyleVars, fitSteps } from "@/lib/cv/doc-style";
import { getDocStyle } from "@/lib/cv/doc-style-store";

// The browser names the saved PDF after the document title.
export async function generateMetadata({ params, searchParams }: PageProps<"/print/[id]">): Promise<Metadata> {
  const app = getApplication(Number((await params).id));
  const job = app && getJob(app.job_id);
  const { t } = await getDict();
  const doc = (await searchParams).doc === "letter" ? t.apps2.flow.packLetter : t.apps2.flow.packCv;
  return { title: { absolute: job ? `${doc} — ${job.company}` : doc }, robots: { index: false } };
}

/**
 * Bare page holding only the tailored CV or letter: the preview (?embed=1), the headless PDF (?pdf=1) and the
 * browser's "Save as PDF" all print this one sheet. ?doc=cv|letter&paper=a4|letter
 */
export default async function PrintDoc({ params, searchParams }: PageProps<"/print/[id]">) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const doc = sp.doc === "letter" ? "letter" : "cv";
  const quiet = sp.pdf === "1" || sp.embed === "1";
  const paper = sp.paper === "letter" ? "letter" : "A4";
  const app = Number.isInteger(id) && id > 0 ? getApplication(id) : null;
  const job = app && getJob(app.job_id);
  const raw = app && (doc === "cv" ? app.cv_md : app.cover_letter_md);
  if (!app || !job || !raw?.trim()) notFound();
  const { t } = await getDict();
  const style = getDocStyle();
  const [mx, my] = MARGIN_MM[style.margins];
  const lang = detectLanguage(raw);
  // Screen width = paper width, so the fit measure matches the printed line breaks.
  const vars = { ...docStyleVars(style), "--doc-mx": `${mx}mm`, "--doc-my": `${my}mm`, width: paper === "A4" ? "210mm" : "215.9mm" } as React.CSSProperties;
  return (
    <main lang={lang} className={`doc-page ${docFontVars} ${quiet ? "" : "mx-auto my-6 shadow-lg print:my-0 print:shadow-none"}`} style={vars}>
      <style id="doc-page-css">{`@page { size: ${paper}; margin: ${my}mm ${mx}mm; }`}</style>
      <style>{`.skip-link { display: none !important; } @media print { html, body, .doc-page { background: none !important; } .doc-page { width: auto !important; } }`}</style>
      {!quiet && <AutoPrint hint={t.apps2.flow.printHint} again={t.apps2.flow.printAgain} />}
      {style.fit && <DocFit steps={fitSteps(style)} paper={paper} pageHeightMm={paper === "A4" ? 297 : 279.4} />}
      <Markdown dates={doc === "cv"} className={`doc-sheet ${doc === "letter" ? "doc-letter" : `tpl-${style.template}`}`}>
        {hardBreaks(normalizeForAts(fillPlaceholders(raw, docFacts(id, lang)).md))}
      </Markdown>
    </main>
  );
}
