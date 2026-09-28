import { test, expect } from "@playwright/test";

test("nested flowcharts and self-loops move without breaking geometry", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page
    .getByLabel("Mermaid source")
    .fill(
      "flowchart LR\n subgraph Group\n A[First] --> B[Second]\n end\n B --> C[Third]\n C --> C",
    );
  await expect(page.locator("[data-entity]")).toHaveCount(3);
  const path = page.locator("path.flowchart-link").first();
  const before = await path.getAttribute("d");
  await page.locator("[data-entity]").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(path).not.toHaveAttribute("d", before!);
  expect(await path.getAttribute("d")).not.toContain("NaN");
  const last = page.locator("[data-entity]").last();
  await last.focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator(".diagram-surface").innerHTML()).not.toContain(
    "NaN",
  );
});

test("runtime assets stay on the same origin", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
});

test("class cardinality labels follow their endpoints", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.getByRole("button", { name: "Examples" }).click();
  await page
    .getByRole("button", { name: "Class diagram", exact: true })
    .click();
  await expect(page.locator("[data-entity]")).toHaveCount(2);
  const terminal = page.locator(".edgeTerminals").first();
  const before = await terminal.getAttribute("transform");
  await page.locator("[data-entity]").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(terminal).not.toHaveAttribute("transform", before!);
});
