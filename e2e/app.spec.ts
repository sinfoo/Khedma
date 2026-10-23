import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/app", "/app/jobs", "/app/sources", "/app/pipeline", "/app/pipeline/1?tab=overview", "/app/pipeline/1?tab=documents&doc=cv", "/app/salaries", "/app/profile", "/app/settings"];

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
