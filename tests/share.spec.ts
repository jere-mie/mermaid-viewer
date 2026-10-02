import { test, expect } from "@playwright/test";

test("shared snapshots preserve Unicode, layout, and existing local work", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.getByLabel("Diagram name").fill("Schema cafe 日本語");
  await page.locator("[data-entity]").first().focus();
  await page.keyboard.press("ArrowRight");
  const source = await page.getByLabel("Mermaid source").inputValue();
  await page
    .getByRole("button", { name: "Share diagram", exact: true })
    .click();
  const field = page.getByLabel("Share link", { exact: true });
  await expect(field).toHaveValue(/#diagram=v1\./);
  const link = await field.inputValue();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator(".share-menu [role=status]")).toHaveText(
    "Link copied",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.getByLabel("Mermaid source").click();
  await expect(page.locator(".share-menu")).toHaveCount(0);
  await page.getByLabel("Diagram name").fill("My local changes");
  await page.goto(link);
  await expect(page.getByLabel("Diagram name")).toHaveValue(
    "Schema cafe 日本語",
  );
  await expect(page.getByLabel("Mermaid source")).toHaveValue(source);
  await expect(page.locator("[data-entity]").first()).toHaveAttribute(
    "transform",
    /translate\(10,0\)/,
  );
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mermaid-viewer.workspace.v1")!),
  );
  expect(saved.docs).toHaveLength(2);
  expect(saved.docs[0].name).toBe("My local changes");
  await page.getByLabel("Diagram name").fill("Edited shared copy");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel("Diagram name")).toHaveValue(
    "Edited shared copy",
  );
});

test("links work in a fresh browser and handle corruption and oversized payloads", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  const link = await page.evaluate(async () => {
    const { createShareLink } = await import("/src/share.ts");
    return createShareLink({
      name: "日本語",
      code: "flowchart LR\n A[你好 🌿] --> B[Cafe]",
      positions: {},
    });
  });
  const fresh = await browser.newContext();
  const recipient = await fresh.newPage();
  await recipient.goto(link);
  await expect(recipient.getByLabel("Diagram name")).toHaveValue("日本語");
  await expect(recipient.locator("[data-entity]")).toHaveCount(2);
  await fresh.close();
  await page.goto("/#diagram=v1.broken");
  await expect(page.getByRole("alert")).toContainText("damaged");
  await expect(page.getByLabel("Diagram name")).toHaveValue("Commerce schema");
  const message = await page.evaluate(async () => {
    const { createShareLink } = await import("/src/share.ts");
    try {
      await createShareLink({
        name: "Large",
        code: "x".repeat(1_000_001),
        positions: {},
      });
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(message).toContain("too large");
});

test("share menu stays in bounds and supports manual copying", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  const button = page.getByRole("button", {
    name: "Share diagram",
    exact: true,
  });
  await button.click();
  await expect(page.getByLabel("Share link", { exact: true })).toHaveValue(
    /#diagram=/,
  );
  const box = (await page.locator(".share-menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () => Promise.reject(new Error("Denied")),
    }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator(".share-menu [role=status]")).toContainText(
    "manually",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".share-menu")).toHaveCount(0);
});
