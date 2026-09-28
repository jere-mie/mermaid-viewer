import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
}
async function moveFirst(page: Page, dx = 90, dy = 35) {
  const node = page.locator("[data-entity]").first();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 15 + dy, {
    steps: 8,
  });
  await page.mouse.up();
}
test("ER entities move with relationship endpoints, labels, and reload persistence", async ({
  page,
}) => {
  await ready(page);
  const edge = page.locator("path.relationshipLine").first();
  const before = await edge.evaluate((e: SVGPathElement) => ({
    x: e.getPointAtLength(0).x,
    y: e.getPointAtLength(0).y,
  }));
  const label = await page
    .locator("g.edgeLabels > g.edgeLabel")
    .first()
    .getAttribute("transform");
  const node = page.locator("[data-entity]").first();
  const id = await node.getAttribute("data-entity");
  const scale = await page
    .locator(".diagram-surface")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await moveFirst(page);
  const after = await edge.evaluate((e: SVGPathElement) => ({
    x: e.getPointAtLength(0).x,
    y: e.getPointAtLength(0).y,
  }));
  expect(after.x - before.x).toBeCloseTo(90 / scale, 1);
  expect(after.y - before.y).toBeCloseTo(35 / scale, 1);
  await expect(
    page.locator("g.edgeLabels > g.edgeLabel").first(),
  ).not.toHaveAttribute("transform", label!);
  const transform = await node.getAttribute("transform");
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.reload();
  await expect(page.locator("[data-entity]").first()).toHaveAttribute(
    "transform",
    transform!,
  );
  // Changing source gives Mermaid a fresh render ID; saved entity identity must survive.
  await page
    .getByLabel("Mermaid source")
    .fill(
      (await page.getByLabel("Mermaid source").inputValue()) + "\n%% updated",
    );
  await expect(page.locator(`[data-entity="${id}"]`)).toHaveAttribute(
    "transform",
    transform!,
  );
  await page.getByRole("button", { name: "Reset layout" }).click();
  await expect(page.locator("[data-entity]").first()).toHaveAttribute(
    "transform",
    /^translate\(0,0\)/,
  );
});
test("flowchart and class nodes remain draggable and retain edge markers", async ({
  page,
}) => {
  await ready(page);
  for (const name of ["Flowchart", "Class diagram"]) {
    await page.getByRole("button", { name: "Examples" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-entity]")).toHaveCount(
      name === "Flowchart" ? 4 : 2,
    );
    const before = await page
      .locator("[data-entity]")
      .first()
      .getAttribute("transform");
    const edge = page.locator("path.flowchart-link, path.relation").first();
    const path = await edge.getAttribute("d");
    await moveFirst(page, 70, 20);
    await expect(page.locator("[data-entity]").first()).not.toHaveAttribute(
      "transform",
      before!,
    );
    await expect(edge).not.toHaveAttribute("d", path!);
    expect(await page.locator("marker").count()).toBeGreaterThan(0);
  }
});
test("syntax errors recover and sequence diagrams render", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Mermaid source").fill("erDiagram\n not valid !!!");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Mermaid source").fill("flowchart LR\n A --> B");
  await expect(page.locator("[data-entity]")).toHaveCount(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(page.locator(".diagram-surface svg")).toHaveAttribute(
    "aria-roledescription",
    "sequence",
  );
  await expect(page.locator("[data-entity]")).toHaveCount(0);
});
test("pan, zoom, fullscreen, keyboard movement and SVG export work", async ({
  page,
}) => {
  await ready(page);
  const node = page.locator("[data-entity]").first();
  const transform = await node.getAttribute("transform");
  await node.focus();
  await page.keyboard.press("ArrowRight");
  await expect(node).not.toHaveAttribute("transform", transform!);
  const before = await page.locator(".diagram-surface").getAttribute("style");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".diagram-surface")).not.toHaveAttribute(
    "style",
    before!,
  );
  const zoomed = await page.locator(".diagram-surface").getAttribute("style");
  const box = (await page.locator(".canvas").boundingBox())!;
  await page.mouse.move(box.x + 35, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 150);
  await page.mouse.up();
  await expect(page.locator(".diagram-surface")).not.toHaveAttribute(
    "style",
    zoomed!,
  );
  await page.getByRole("button", { name: "Toggle fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "Toggle fullscreen" }).click();
  await page
    .getByRole("button", { name: "Export diagram", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Commerce schema.svg");
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream!) chunks.push(c);
  const svg = Buffer.concat(chunks).toString();
  expect(svg).toContain("viewBox=");
  expect(svg).toContain("CUSTOMER");
  expect(svg).not.toContain("width: 1px");
});
test("multiple documents have isolated source and positions", async ({
  page,
}) => {
  await ready(page);
  await moveFirst(page);
  const original = await page
    .locator("[data-entity]")
    .first()
    .getAttribute("transform");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.locator("[data-entity]")).toHaveCount(2);
  await page.getByLabel("Diagram name").fill("Second diagram");
  await page.getByRole("button", { name: "Saved diagrams" }).click();
  await page
    .getByRole("button", { name: "Commerce schema", exact: true })
    .click();
  await expect(page.locator("[data-entity]").first()).toHaveAttribute(
    "transform",
    original!,
  );
});
test("narrow screen keeps editor and viewer accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.getByLabel("Mermaid source")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit diagram" })).toBeVisible();
  await page.getByRole("button", { name: "Hide source" }).click();
  await expect(page.getByLabel("Mermaid source")).toHaveCount(0);
  await page.getByRole("button", { name: "Show source" }).click();
  await expect(page.getByLabel("Mermaid source")).toBeVisible();
});
test("storage failures do not prevent rendering or editing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await ready(page);
  await expect(page.getByRole("alert")).toContainText("storage");
  await page.getByLabel("Mermaid source").fill("flowchart LR\n A --> B");
  await expect(page.locator("[data-entity]")).toHaveCount(2);
});
