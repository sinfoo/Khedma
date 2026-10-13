// Tiny regex-based HTML helpers. Good enough for job postings; not a real parser.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", egrave: "è",
  ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ugrave: "ù", ucirc: "û", icirc: "î",
  iuml: "ï", euml: "ë", pound: "£", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·", euro: "€",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

/** HTML fragment or document -> readable plain text. */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|nav|footer|header|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*(br|hr)\b[^>]*\/?>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/?\s*(p|div|section|article|ul|ol|h[1-6]|tr|table|blockquote|pre|dd|dt|dl|form|aside|main)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s).replace(/ /g, " ");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t\r\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Read a <meta> value by og:/twitter:/name. First match wins; attribute order does not matter. */
export function pickMeta(html: string, name: string): string | undefined {
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (key?.toLowerCase() !== name.toLowerCase()) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return undefined;
}

export function pickTitle(html: string): string | undefined {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? htmlToText(t) : undefined;
}

type Json = Record<string, unknown>;

function isJobPosting(o: unknown): o is Json {
  if (!o || typeof o !== "object") return false;
  const t = (o as Json)["@type"];
  return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
}

/** First JSON-LD JobPosting in the page, tolerating arrays and @graph wrappers. */
export function pickJsonLdJobPosting(html: string): Json | null {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (Array.isArray(cur)) stack.push(...cur);
      else if (cur && typeof cur === "object") {
        if (isJobPosting(cur)) return cur;
        const g = (cur as Json)["@graph"];
        if (Array.isArray(g)) stack.push(...g);
      }
    }
  }
  return null;
}
