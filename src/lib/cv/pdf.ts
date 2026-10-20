// Real PDF files for the CV and letter: the installed Chrome or Edge prints our own /print page headlessly.
// No PDF library: the print page is the single layout, so the preview, the PDF and the browser print all match.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
];

export function findBrowser(): string | null {
  return CANDIDATES.find((p): p is string => !!p && existsSync(p)) ?? null;
}

/** Print `url` to PDF bytes; null when no Chromium-family browser is installed. */
export async function printToPdf(url: string): Promise<Uint8Array | null> {
  const browser = findBrowser();
  if (!browser) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "khedma-pdf-"));
  const out = path.join(dir, "doc.pdf");
  try {
    await new Promise<void>((resolve, reject) =>
      execFile(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--no-pdf-header-footer",
          "--run-all-compositor-stages-before-draw",
          "--virtual-time-budget=4000",
          `--user-data-dir=${path.join(dir, "profile")}`,
          `--print-to-pdf=${out}`,
          url,
        ],
        { timeout: 45_000, windowsHide: true },
        (err) => (err && !existsSync(out) ? reject(err) : resolve()),
      ),
    );
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
