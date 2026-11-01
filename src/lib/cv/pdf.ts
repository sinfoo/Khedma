// Real PDF files for the CV and letter: the installed Chrome or Edge prints our own /print page headlessly.
// No PDF library: the print page is the single layout, so the preview, the PDF and the browser print all match.
import { spawn } from "node:child_process";
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
    // Some Chrome builds write the PDF and then never exit, and their helpers kept execFile's pipes open, so
    // the export hung. No pipes now; done as soon as the file is complete, then the browser is killed.
    const child = spawn(
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
      { stdio: "ignore", windowsHide: true },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        // A finished PDF ends with its %%EOF marker; a half-written one does not.
        const tick = setInterval(async () => {
          const bytes = await readFile(out).catch(() => null);
          if (bytes?.subarray(-32).includes("%%EOF")) done();
        }, 300);
        const limit = setTimeout(() => done(new Error("pdf-timeout")), 45_000);
        const done = (err?: Error) => {
          clearInterval(tick);
          clearTimeout(limit);
          if (err) reject(err);
          else resolve();
        };
        child.on("error", done);
        child.on("exit", () => setTimeout(() => (existsSync(out) ? done() : done(new Error("pdf-failed"))), 300));
      });
    } finally {
      // Its helper processes quit on their own once the browser process is gone.
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** An application's CV or letter as sent: our own print page, printed on loopback (never the Host header). */
export function printDoc(port: string, id: number, doc: "cv" | "letter", paper: string): Promise<Uint8Array | null> {
  return printToPdf(`http://127.0.0.1:${port}/print/${id}?doc=${doc}&paper=${paper}&pdf=1`);
}
