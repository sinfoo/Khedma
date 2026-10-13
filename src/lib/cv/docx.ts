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

/** **bold**, *italic*, [text](url) → runs. */
function runs(text: string): string {
  const out: string[] = [];
  const re = /(\*\*|__)(.+?)\1|(?<![\w*])[*_](?!\s)(.+?)[*_](?![\w*])|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  const run = (t: string, b = false, i = false) => {
    if (!t) return;
    const pr = b || i ? `<w:rPr>${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}</w:rPr>` : "";
    out.push(`<w:r>${pr}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`);
  };
  for (const m of text.matchAll(re)) {
    run(text.slice(last, m.index));
    if (m[2] !== undefined) run(m[2], true);
    else if (m[3] !== undefined) run(m[3], false, true);
    else run(m[4] === m[5] ? m[4] : `${m[4]} (${m[5]})`);
    last = (m.index ?? 0) + m[0].length;
  }
  run(text.slice(last));
  return out.join("");
}

const para = (style: string | null, text: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs(text)}</w:p>`;

export function markdownToDocx(md: string, opts: { title?: string; accent?: string } = {}): Uint8Array {
  const accent = /^#?[0-9a-f]{6}$/i.test(opts.accent ?? "") ? opts.accent!.replace("#", "") : "0B5CAD";
  const body: string[] = [];
  for (const raw of (md ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,})$/.test(line)) continue;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) body.push(para(h[1].length === 1 ? "Title" : h[1].length === 2 ? "Heading1" : "Heading2", h[2]));
    else if (isBullet(line)) body.push(para("ListBullet", `• ${stripBullet(line)}`));
    else body.push(para(null, line));
  }
  if (!body.length) body.push(para(null, ""));

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="111111"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${accent}"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:color w:val="${accent}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="30"/><w:ind w:left="360" w:hanging="220"/></w:pPr></w:style>
</w:styles>`;

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const enc = new TextEncoder();
  return zip([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/document.xml", data: enc.encode(document) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
    { name: "word/styles.xml", data: enc.encode(styles) },
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
