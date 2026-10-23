import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/app", "/app/jobs", "/app/sources", "/app/pipeline", "/app/pipeline/1?tab=overview", "/app/pipeline/1?tab=documents&doc=cv", "/app/salaries", "/app/contacts", "/app/profile", "/app/settings"];

for (const url of PAGES) {
  test(`${url} renders without errors and without serious accessibility issues`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(url);
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.any.map((c) => c.message).join(" ")}`.slice(0, 300)));
    expect(serious).toEqual([]);
  });
}

test("the command palette finds a page typed without accents", async ({ page }) => {
  await page.goto("/app");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("reglages");
  await expect(page.getByRole("option", { name: /Réglages/ }).first()).toBeVisible();
});

test("the sent letter has no placeholder left and the PDF is readable", async ({ page, request }) => {
  await page.goto("/print/1?doc=letter&embed=1");
  await expect(page.locator(".doc-sheet")).toContainText("Madame, Monsieur");
  await expect(page.locator(".doc-sheet")).not.toContainText("[Date]");
  const pdf = await request.get("/api/applications/1/export?doc=cv&format=pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).byteLength).toBeGreaterThan(5000);
});

test("a mailbox export (.mbox) lists its messages and fills the reply box with the newest", async ({ page }) => {
  await page.goto("/app/pipeline/1?tab=messages");
  const mbox = [
    "From a@x Mon Oct 19 09:00:00 2026", "From: Sarra <sarra@vermeg.com>", "Subject: Accuse de reception", "Date: Mon, 19 Oct 2026 09:00:00 +0100", "", "Bien recu.", "",
    "From b@x Thu Oct 22 10:00:00 2026", "From: RH Acme <rh@acme.tn>", "Subject: =?UTF-8?Q?Convocation_=C3=A0_un_entretien?=", "Date: Thu, 22 Oct 2026 10:00:00 +0100", "", "Entretien le 29/10/2026 a 14h00.", "",
  ].join("\n");
  await page.locator('input[type=file][accept*=".mbox"]').setInputFiles({ name: "inbox.mbox", mimeType: "application/mbox", buffer: Buffer.from(mbox) });
  await expect(page.locator("#reply-text")).toHaveValue(/Objet : Convocation à un entretien/);
  await expect(page.locator("#reply-mbox option")).toHaveCount(2);
  await page.locator("#reply-mbox").selectOption({ index: 1 });
  await expect(page.locator("#reply-text")).toHaveValue(/Objet : Accuse de reception/);
});

test("a scanned PDF CV (no text layer) is read with OCR in the browser and becomes the CV", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/app/profile");
  await page.locator('input[type=file][accept*=".docx"]').first().setInputFiles("e2e/fixtures/scanned-cv.pdf");
  await page.getByRole("button", { name: "Le lire avec l'OCR" }).click();
  // Only in the scanned image (the seeded CV says amira@example.tn and has no skills line).
  await expect(page.locator("#cv-md")).toHaveValue(/amira\.bensalah@example\.tn/, { timeout: 150_000 });
  await expect(page.locator("#cv-md")).toHaveValue(/React, Node\.js, Python, SQL, Git/);
});
