// Browser-only: reads a scanned (image-only) PDF CV with OCR. Pages are drawn by PDF.js and read by Tesseract,
// both running in this browser with their files served by this app (/api/ocr): the CV never leaves the computer.

/** First pages only: a CV is one or two pages, and each page takes a few seconds. */
const MAX_PAGES = 3;

export async function ocrPdf(file: Blob, onProgress?: (done: number, total: number) => void): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/api/ocr/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const total = Math.min(pdf.numPages, MAX_PAGES);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["fra", "eng"], 1, { workerPath: "/api/ocr/worker.min.js", corePath: "/api/ocr/core", langPath: "/api/ocr/lang" });
  try {
    const pages: string[] = [];
    for (let n = 1; n <= total; n++) {
      onProgress?.(n - 1, total);
      const page = await pdf.getPage(n);
      // 2x: small CV type (9-10 pt) reads far better than at screen scale.
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push((await worker.recognize(canvas)).data.text);
    }
    onProgress?.(total, total);
    return pages.join("\n\n").trim();
  } finally {
    await worker.terminate();
    await task.destroy();
  }
}
