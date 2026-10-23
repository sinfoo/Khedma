// A recruiter's e-mail saved as .eml, turned into the text the reply classifier reads. Client-safe.
// MIME parsing by postal-mime (MIT-0): multipart, base64 / quoted-printable, charsets, encoded headers.
import { htmlToText } from "../sources/html";

export const MAX_EML_BYTES = 2_000_000;

interface Parsed {
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

export async function parseEml(bytes: ArrayBuffer): Promise<Parsed> {
  const { default: PostalMime } = await import("postal-mime");
  return PostalMime.parse(bytes);
}
