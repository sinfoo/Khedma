// Markdown CV → minimal valid .docx (WordprocessingML) using only node built-ins.
import { zip } from "./zip";
import { isBullet, stripBullet } from "./sectionize";

const xmlEsc = (s: string) =>
  s
     
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * **bold**, *italic*, [text](url) → runs. Links become real hyperlinks (relationship ids collected in `links`),
 * and so do bare URLs, e-mails and profile addresses typed without a scheme (linkedin.com/in/…).
 */
function runs(text: string, links: string[]): string {
  const out: string[] = [];
  const re =
    /(\*\*|__)(.+?)\1|(?<![\w*])[*_](?!\s)(.+?)[*_](?![\w*])|\[([^\]]+)\]\(([^)]+)\)|(?<![\w@/.])((?:https?:\/\/|(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/)[^\s|·,;)<>]*[^\s|·,;).<>]|[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})/gi;
  let last = 0;
  const run = (t: string, b = false, i = false, link = false) => {
    if (!t) return "";
    const pr = b || i || link ? `<w:rPr>${link ? '<w:rStyle w:val="Hyperlink"/>' : ""}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}</w:rPr>` : "";
    return `<w:r>${pr}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  };
  for (const m of text.matchAll(re)) {
    out.push(run(text.slice(last, m.index)));
    if (m[2] !== undefined) out.push(run(m[2], true));
    else if (m[3] !== undefined) out.push(run(m[3], false, true));
    else {
      const label = m[6] ?? m[4];
      const href = m[6] === undefined ? m[5] : m[6].includes("@") && !m[6].includes("/") ? `mailto:${m[6]}` : /^https?:/i.test(m[6]) ? m[6] : `https://${m[6]}`;
      if (/^(https?:|mailto:)/i.test(href)) {
        links.push(href);
        out.push(`<w:hyperlink r:id="rIdL${links.length}" w:history="1">${run(label, false, false, true)}</w:hyperlink>`);
      } else out.push(run(label));
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(run(text.slice(last)));
  return out.join("");
}

/** "… · July 2025 - Present" / "Sept 2024 - juin 2026": the trailing date range of an entry heading, if any. */
const DATE = String.raw`(?:[\p{L}.]+\s+)?\d{4}\s*[-–]\s*(?:(?:[\p{L}.]+\s+)?\d{4}|present|présent|aujourd'hui|now|current|en cours)(?:\s*\([^)]*\))?`;
const DATE_TAIL = new RegExp(String.raw`^(.*?\S)\s+(?:[·|,–-]\s+)?(${DATE})$`, "iu");
const DATE_ONLY = new RegExp(String.raw`^${DATE}$`, "iu");

/**
 * A paragraph. An entry line ending in a date range gets the dates pushed to the right margin with a right tab,
 * like the PDF's entry rows.
 */
function para(style: string | null, text: string, links: string[], rightTab: number): string {
  const d = (style === null || style === "Heading2") && !DATE_ONLY.test(text) ? DATE_TAIL.exec(text) : null;
  const tabs = d ? `<w:tabs><w:tab w:val="right" w:pos="${rightTab}"/></w:tabs>` : "";
  const pPr = style || tabs ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${tabs}</w:pPr>` : "";
  const body = d ? `${runs(d[1], links)}<w:r><w:tab/></w:r>${runs(d[2], links)}` : runs(text, links);
  return `<w:p>${pPr}${body}</w:p>`;
}

/** Word fonts for the doc-style choices (Carlito and Tinos are metric twins of Calibri and Times New Roman). */
const WORD_FONT: Record<string, string> = { sans: "Calibri", carlito: "Calibri", tinos: "Times New Roman", serif: "Cambria" };

export function markdownToDocx(md: string, opts: { title?: string; author?: string; accent?: string; paper?: "a4" | "letter"; font?: string; size?: number; lang?: "fr" | "en" } = {}): Uint8Array {
  const accent = /^#?[0-9a-f]{6}$/i.test(opts.accent ?? "") ? opts.accent!.replace("#", "") : "0B5CAD";
  const font = WORD_FONT[opts.font ?? ""] ?? "Calibri";
  const lang = opts.lang === "en" ? "en-GB" : "fr-FR";
  const sz = Math.round(Math.min(Math.max(opts.size ?? 10.5, 9), 12.5) * 2); // half-points
  const letter = opts.paper === "letter";
  const pgSz = letter ? 'w:w="12240" w:h="15840"' : 'w:w="11906" w:h="16838"';
  const rightTab = (letter ? 12240 : 11906) - 2000; // page width minus both 1000-twip margins
  const links: string[] = [];
  const body: string[] = [];
  for (const raw of (md ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,})$/.test(line)) continue;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) body.push(para(h[1].length === 1 ? "Title" : h[1].length === 2 ? "Heading1" : "Heading2", h[2], links, rightTab));
    else if (isBullet(line)) body.push(para("ListBullet", stripBullet(line), links, rightTab));
    else body.push(para(null, line, links, rightTab));
  }
  if (!body.length) body.push(para(null, "", links, rightTab));

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz ${pgSz}/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="${lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="111111"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${accent}"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:color w:val="${accent}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="30"/><w:ind w:left="360" w:hanging="220"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${accent}"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

  // Real Word bullets (one bullet list definition), so the list survives edits and ATS reads it as a list.
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="220"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(opts.title ?? "")}</dc:title><dc:creator>${xmlEsc(opts.author ?? "")}</dc:creator><dc:language>${lang}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  const linkRels = links.map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEsc(u)}" TargetMode="External"/>`).join("");
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${linkRels}</Relationships>`;

  const enc = new TextEncoder();
  return zip([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "docProps/core.xml", data: enc.encode(core) },
    { name: "word/document.xml", data: enc.encode(document) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
    { name: "word/styles.xml", data: enc.encode(styles) },
    { name: "word/numbering.xml", data: enc.encode(numbering) },
  ]);
}

/** Plain text of a .docx: paragraphs on their own lines, list items prefixed with "- ". */
export function docxToText(xml: string): string {
  const decode = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [])
    .map((p) => {
      const list = /<w:numPr>|w:val="List/.test(p);
      const text = (p.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [])
        .map((t) => (t === "<w:tab/>" ? "\t" : t === "<w:br/>" ? "\n" : decode(t.replace(/<[^>]+>/g, ""))))
        .join("")
        .trim();
      return text && list && !isBullet(text) ? `- ${text}` : text;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
