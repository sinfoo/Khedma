// The user's CV as a first-class source: Markdown from the profile, or the text of the uploaded file.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db, getProfile, migrate } from "@/lib/db";
import { docxToText } from "./docx";
import { unzipEntry } from "./zip";

export { sectionizeToMarkdown } from "./sectionize";

export interface CvSource {
  text: string;
  format: "markdown" | "text";
  fileName: string | null;
  uploadedAt: string | null;
  hasFile: boolean;
}

export interface CvUpload {
  id: number;
  fileName: string;
  storedName: string;
  mime: string;
  size: number;
  text: string;
  uploadedAt: string;
}

export const MAX_CV_BYTES = 8 * 1024 * 1024;
export const CV_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;

export type CvImportErrorCode = "tooLarge" | "unsupported" | "empty" | "corrupt";
export class CvImportError extends Error {
  constructor(public code: CvImportErrorCode, message: string) {
    super(message);
    this.name = "CvImportError";
  }
}

const CV_DIR = path.join(process.env.KHEDMA_DATA ?? path.join(process.cwd(), "data"), "cv");

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

function ensure() {
  migrate(
    "profile:002-cv-uploads",
    `CREATE TABLE IF NOT EXISTS cv_uploads (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       file_name TEXT NOT NULL,
       stored_name TEXT NOT NULL,
       mime TEXT NOT NULL,
       size INTEGER NOT NULL,
       text TEXT NOT NULL,
       uploaded_at TEXT NOT NULL
     );`,
  );
}

const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");

function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
     
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60_000);
}

/** Extract plain text from a CV file (PDF, DOCX, TXT, MD). Throws CvImportError. */
export async function extractCvText(fileName: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_CV_BYTES) throw new CvImportError("tooLarge", "File is larger than 8 MB.");
  if (!bytes.byteLength) throw new CvImportError("empty", "The file is empty.");
  const ext = extOf(fileName);
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  let text: string;
  try {
    if (ext === "pdf" || head.startsWith("%PDF")) {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const res = await extractText(pdf, { mergePages: false });
      text = res.text.join("\n\n");
    } else if (ext === "docx") {
      const xml = unzipEntry(bytes, "word/document.xml");
      if (!xml) throw new CvImportError("corrupt", "This .docx has no document body.");
      text = docxToText(new TextDecoder().decode(xml));
    } else if (ext === "txt" || ext === "md" || ext === "markdown") {
      text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    } else {
      throw new CvImportError("unsupported", "Unsupported file type. Use PDF, DOCX, TXT or MD.");
    }
  } catch (e) {
    if (e instanceof CvImportError) throw e;
    throw new CvImportError("corrupt", `Could not read this file (${e instanceof Error ? e.message : "unknown error"}).`);
  }
  const clean = cleanText(text);
  if (clean.replace(/\s/g, "").length < 20) {
    throw new CvImportError("empty", "No text found in this file. If it is a scanned PDF, export it again as text or paste the content.");
  }
  return clean;
}

const rowToUpload = (r: Record<string, unknown>): CvUpload => ({
  id: r.id as number,
  fileName: r.file_name as string,
  storedName: r.stored_name as string,
  mime: r.mime as string,
  size: r.size as number,
  text: r.text as string,
  uploadedAt: r.uploaded_at as string,
});

/** Latest upload (index 0) or the previous one kept as backup (index 1). */
export function getUpload(index = 0): CvUpload | null {
  ensure();
  const r = db().prepare("SELECT * FROM cv_uploads ORDER BY id DESC LIMIT 1 OFFSET ?").get(Math.max(0, Math.min(1, index))) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToUpload(r) : null;
}

export function readUploadBytes(u: CvUpload): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(path.join(CV_DIR, path.basename(u.storedName))));
  } catch {
    return null;
  }
}

/** Store the original file under data/cv (latest + one backup) and its extracted text. Leaves cv_md untouched. */
export async function saveUploadedCv(fileName: string, bytes: Uint8Array): Promise<{ text: string }> {
  ensure();
  const text = await extractCvText(fileName, bytes);
  const ext = extOf(fileName);
  const safeBase =
    path
      .basename(fileName)
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^[._]+/, "")
      .slice(0, 80) || `cv.${ext || "bin"}`;
  const display = path.basename(fileName).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || safeBase;
  const stored = `${Date.now()}-${safeBase}`;
  mkdirSync(CV_DIR, { recursive: true });
  writeFileSync(path.join(CV_DIR, stored), bytes);
  db()
    .prepare("INSERT INTO cv_uploads (file_name, stored_name, mime, size, text, uploaded_at) VALUES (?,?,?,?,?,?)")
    .run(display, stored, MIME[ext] ?? "application/octet-stream", bytes.byteLength, text, new Date().toISOString());
  // Keep only the latest upload and one backup.
  const old = db().prepare("SELECT id, stored_name FROM cv_uploads ORDER BY id DESC LIMIT -1 OFFSET 2").all() as { id: number; stored_name: string }[];
  for (const o of old) {
    rmSync(path.join(CV_DIR, path.basename(o.stored_name)), { force: true });
    db().prepare("DELETE FROM cv_uploads WHERE id = ?").run(o.id);
  }
  return { text };
}

/** CV text for tailoring/evaluation: profile Markdown first, else the uploaded file's text. */
export function getCvSource(): CvSource {
  const md = getProfile().cv_md;
  const up = getUpload();
  const meta = { fileName: up?.fileName ?? null, uploadedAt: up?.uploadedAt ?? null, hasFile: !!up };
  if (md.trim()) return { text: md, format: "markdown", ...meta };
  if (up) return { text: up.text, format: "text", ...meta };
  return { text: "", format: "text", ...meta };
}
