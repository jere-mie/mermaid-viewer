import { test, expect } from "@playwright/test";

test("splitter supports dragging, keyboard adjustment, and saved pane preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const separator = page.getByRole("separator");
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(720, box.y + 100);
  await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow", "50");
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "48");
  await page.reload();
  await expect(separator).toHaveAttribute("aria-valuenow", "48");
  await page.getByRole("button", { name: "Hide source" }).click();
  await expect(page.getByLabel("Mermaid source")).toHaveCount(0);
  await expect(separator).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show source" })).toBeVisible();
  await page.getByRole("button", { name: "Show source" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "48");
});

test("code-only mode keeps rendering up to date and either pane can fill the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(page.getByLabel("Preview pane")).toBeHidden();
  expect((await page.getByLabel("Source pane").boundingBox())!.width).toBe(
    1440,
  );
  await page
    .getByLabel("Mermaid source")
    .fill("flowchart LR\n A[Updated while hidden] --> B[Still connected]");
  await expect(page.locator("[data-entity]")).toHaveCount(2);
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.getByLabel("Preview pane")).toBeVisible();
  await expect(page.locator(".diagram-surface")).toContainText(
    "Updated while hidden",
  );
  await page.getByRole("button", { name: "Hide source" }).click();
  expect((await page.getByLabel("Preview pane").boundingBox())!.width).toBe(
    1440,
  );
  // Hiding the last visible pane opens the other one, never leaving a blank workspace.
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(page.getByLabel("Mermaid source")).toBeVisible();
  await expect(page.getByLabel("Preview pane")).toBeHidden();
});
