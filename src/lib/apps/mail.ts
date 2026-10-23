// A recruiter's e-mail saved as .eml, turned into the text the reply classifier reads. Client-safe.
// MIME parsing by postal-mime (MIT-0): multipart, base64 / quoted-printable, charsets, encoded headers.
import { htmlToText } from "../sources/html";

export const MAX_EML_BYTES = 2_000_000;
/** A mailbox export (.mbox: Thunderbird, a Gmail Takeout label) holds many messages. */
export const MAX_MBOX_BYTES = 30_000_000;

export interface Parsed {
  from?: { name?: string; address?: string };
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
}

/** "De / Objet / Date" header lines, then the body (plain text, else the HTML as text), capped for the classifier. */
export function emailText(e: Parsed, locale: "fr" | "en", max = 8000): string {
  const from = [e.from?.name, e.from?.address && `<${e.from.address}>`].filter(Boolean).join(" ");
  const head = [
    from && `${locale === "fr" ? "De" : "From"} : ${from}`,
    e.subject && `${locale === "fr" ? "Objet" : "Subject"} : ${e.subject}`,
    e.date && `Date : ${e.date}`,
  ].filter(Boolean);
  const body = (e.text?.trim() || htmlToText(e.html ?? "")).replace(/\n{3,}/g, "\n\n").trim();
  return [...head, "", body].join("\n").slice(0, max);
}

export async function parseEml(bytes: ArrayBuffer | Uint8Array): Promise<Parsed> {
  const { default: PostalMime } = await import("postal-mime");
  return PostalMime.parse(bytes);
}

/**
 * The messages of an mbox file, split on its "From " separator lines (a "From " inside a body is stored as
 * ">From ", so it does not split). Bytes are kept as they are: each message declares its own charset.
 */
export function splitMbox(bytes: Uint8Array): Uint8Array[] {
  const F = [0x46, 0x72, 0x6f, 0x6d, 0x20]; // "From "
  const at = (i: number) => F.every((b, k) => bytes[i + k] === b);
  const starts: number[] = [];
  for (let i = 0; i < bytes.length; i++) if ((i === 0 || bytes[i - 1] === 0x0a) && at(i)) starts.push(i);
  return starts
    .map((s, n) => {
      const end = n + 1 < starts.length ? starts[n + 1] : bytes.length;
      const nl = bytes.indexOf(0x0a, s);
      return bytes.subarray(nl < 0 || nl >= end ? end : nl + 1, end);
    })
    .filter((m) => m.length > 0);
}

/** The newest messages of an mbox file, newest first (capped: a whole mailbox is not useful here). */
export async function parseMbox(bytes: ArrayBuffer, max = 50): Promise<Parsed[]> {
  const msgs = splitMbox(new Uint8Array(bytes)).slice(-max);
  const parsed = await Promise.all(msgs.map((m) => parseEml(m).catch(() => null)));
  const time = (p: Parsed) => Date.parse(p.date ?? "") || 0;
  return parsed.filter((p): p is Parsed => !!p).sort((a, b) => time(b) - time(a));
}
