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
  // The new CV starts its adapt phase, whose scan would reach real job boards: answer it here instead.
  const scans: string[] = [];
  await page.route("**/api/sources/scan", (r) => {
    scans.push(r.request().postData() ?? "");
    return r.fulfill({ status: 204 });
  });
  await page.goto("/app/profile");
  await page.locator('input[type=file][accept*=".docx"]').first().setInputFiles("e2e/fixtures/scanned-cv.pdf");
  await page.getByRole("button", { name: "Le lire avec l'OCR" }).click();
  // Only in the scanned image (the seeded CV says amira@example.tn and has no skills line).
  await expect(page.locator("#cv-md")).toHaveValue(/amira\.bensalah@example\.tn/, { timeout: 150_000 });
  await expect(page.locator("#cv-md")).toHaveValue(/React, Node\.js, Python, SQL, Git/);
  // Then Khedma adapts: roles and ranking follow the CV, and a scan is asked for with the CV's keywords.
  await expect(page.getByText(/offre\(s\) re-classée\(s\) selon ton CV/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Scan non lancé. Lance-le depuis Sources quand tu veux.")).toBeVisible();
  expect(JSON.parse(scans[0]).keywords).toEqual(expect.arrayContaining(["react"]));
});

test("Auto scan reads the profile CV and scans with its keywords", async ({ page }) => {
  let body: { keywords?: string[] } = {};
  await page.route("**/api/sources/scan", (r) => {
    if (r.request().method() === "POST") body = JSON.parse(r.request().postData() ?? "{}");
    return r.fulfill({ status: 204 });
  });
  await page.goto("/app/sources");
  const button = page.getByRole("button", { name: "Scan auto depuis mon CV" });
  const title = (await button.getAttribute("title")) ?? "";
  await button.click();
  await expect.poll(() => body.keywords?.length ?? 0).toBeGreaterThan(0);
  expect(title).toContain(body.keywords!.join(", "));
});

test("Khedma Fill: the endpoint needs the access code, and fill.js fills an employer's form without submitting it", async ({ page, request }) => {
  expect((await request.get("/api/extension/fill?url=https://example.com/apply")).status()).toBe(403);
  await page.goto("/app/sources/manage");
  // The extension is shelved in the UI; its code is the clipper's, carried by the bookmark link.
  const href = await page.locator('a[href^="javascript:"]').first().getAttribute("href");
  const token = /token="([0-9a-f]+)"/.exec(decodeURIComponent(href ?? ""))![1];
  const res = await request.get("/api/extension/fill?url=https://example.com/jobs/1", { headers: { "x-khedma-token": token } });
  expect(res.status()).toBe(200);
  expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  const data = await res.json();
  expect(data.job).toEqual({ title: "Stage PFE Développeur Full Stack", company: "Acme Tunisie" });

  let submitted = false;
  await page.route("https://form.test/**", (r) => {
    submitted = r.request().method() === "POST";
    return r.fulfill({ contentType: "text/html; charset=utf-8", body: `<form method="post" action="/send">
      <label for="f">Prénom</label><input id="f">
      <label for="l">Nom</label><input id="l">
      <label>Email <input type="email" name="email"></label>
      <label for="c">Lettre de motivation</label><textarea id="c"></textarea>
      <label for="g">Gender</label><input id="g">
      <label for="p">Phone</label><input id="p" value="déjà rempli">
      <input type="file" aria-label="CV">
    </form>` });
  });
  await page.goto("https://form.test/apply");
  await page.addScriptTag({ path: "extension/fill.js" });
  const r = await page.evaluate((d) => (globalThis as unknown as { __khedmaFill: (x: unknown) => { filled: number } }).__khedmaFill(d), data);
  expect(r.filled).toBe(4);
  await expect(page.locator("#f")).toHaveValue("Amira");
  await expect(page.locator("#l")).toHaveValue("Ben Salah");
  await expect(page.locator("input[name=email]")).toHaveValue("amira@example.tn");
  await expect(page.locator("#c")).toHaveValue(/Madame, Monsieur/);
  await expect(page.locator("#g")).toHaveValue("");
  await expect(page.locator("#p")).toHaveValue("déjà rempli");
  expect(submitted).toBe(false);
});
