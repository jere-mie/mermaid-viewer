import { test, expect } from "@playwright/test";

test("menus dismiss outside and on Escape; exact zoom applies and clamps", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.getByRole("button", { name: "Saved diagrams" }).click();
  await expect(page.locator(".document-menu")).toBeVisible();
  await page.getByRole("button", { name: "Examples" }).click();
  await expect(page.locator(".document-menu")).toHaveCount(0);
  await expect(page.locator(".sample-menu")).toBeVisible();
  await page.locator(".canvas").click({ position: { x: 10, y: 10 } });
  await expect(page.locator(".sample-menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Saved diagrams" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".document-menu")).toHaveCount(0);
  const zoom = page.getByLabel("Zoom percentage");
  await zoom.fill("137.5");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("137.5");
  expect(
    await page
      .locator(".diagram-surface")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
  ).toBe(1.375);
  await zoom.fill("200");
  await page.getByLabel("Diagram name").focus();
  await expect(zoom).toHaveValue("200");
  await zoom.fill("invalid");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("200");
  await zoom.fill("999");
  await zoom.press("Enter");
  await expect(zoom).toHaveValue("400");
  await zoom.fill("2");
  await zoom.press("Escape");
  await expect(zoom).toHaveValue("400");
});

test("dark mode persists and keeps custom entity positions", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const node = page.locator("[data-entity]").first();
  await node.focus();
  await page.keyboard.press("ArrowRight");
  const transform = await node.getAttribute("transform");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(node).toHaveAttribute("transform", transform!);
  await expect(
    page.locator(".diagram-surface svg style").first(),
  ).toContainText("#e0e9dc");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(node).toHaveAttribute("transform", transform!);
  await page.screenshot({ path: "test-results/dark-mode.png" });
});

test("SVG, PNG, JPG and PDF downloads include complete diagram bounds", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const node = page.locator("[data-entity]").first();
  await node.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  const expectedWidth = await page
    .locator(".diagram-surface svg")
    .evaluate((svg: SVGSVGElement) => Math.ceil(svg.getBBox().width + 48) * 4);
  for (const format of ["SVG", "PNG", "JPG", "PDF"]) {
    await page
      .getByRole("button", { name: "Export diagram", exact: true })
      .click();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `Export ${format}`, exact: true })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      `Commerce schema.${format.toLowerCase()}`,
    );
    await download.saveAs(`test-results/export.${format.toLowerCase()}`);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const c of stream!) chunks.push(c);
    const data = Buffer.concat(chunks);
    expect(data.length).toBeGreaterThan(1000);
    if (format === "SVG") {
      expect(data.toString()).toContain("CUSTOMER");
      expect(data.toString()).toContain("translate(-30,0)");
    }
    if (format === "PNG") {
      expect(data.subarray(1, 4).toString()).toBe("PNG");
      expect(data.readUInt32BE(16)).toBe(expectedWidth);
    }
    if (format === "JPG")
      expect(data.subarray(0, 2).toString("hex")).toBe("ffd8");
    if (format === "PDF") {
      expect(data.subarray(0, 5).toString()).toBe("%PDF-");
      expect(data.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image\b/);
      expect(data.toString("latin1")).toContain("/Font");
    }
  }
});
