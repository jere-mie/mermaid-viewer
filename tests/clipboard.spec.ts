import { test, expect } from "@playwright/test";

test("copies source and rendered PNG to the clipboard, preserving custom layout", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const source = await page.getByLabel("Mermaid source").inputValue();
  const button = page.getByRole("button", {
    name: "Copy diagram",
    exact: true,
  });
  await button.click();
  await page
    .getByRole("button", { name: "Copy Mermaid code", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied to clipboard");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
  ).toBe(source);
  await page.locator("[data-entity]").first().focus();
  await page.keyboard.press("ArrowRight");
  await button.click();
  await page
    .getByRole("button", { name: "Copy SVG source", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied to clipboard");
  const svg = await page.evaluate(() => navigator.clipboard.readText());
  expect(svg).toContain("<svg");
  expect(svg).toContain("CUSTOMER");
  expect(svg).toContain("translate(10,0)");
  expect(svg).toContain("viewBox=");
  await button.click();
  await page
    .getByRole("button", { name: "Copy PNG image", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Copied to clipboard", {
    timeout: 20000,
  });
  const png = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType("image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      type: blob.type,
      signature: [...bytes.slice(0, 8)],
      width: new DataView(bytes.buffer).getUint32(16),
      height: new DataView(bytes.buffer).getUint32(20),
    };
  });
  expect(png.type).toBe("image/png");
  expect(png.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.width).toBeGreaterThan(1000);
  expect(png.height).toBeGreaterThan(1000);
  await page.getByLabel("Mermaid source").fill("invalid mermaid");
  await expect(page.getByRole("alert")).toBeVisible();
  await button.click();
  await expect(
    page.getByRole("button", { name: "Copy PNG image" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Copy Mermaid code" }).click();
  await expect(page.getByRole("status")).toHaveText("Copied to clipboard");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "invalid mermaid",
  );
});

test("copy menu stays in bounds, dismisses, and reports denied access", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const trigger = page.getByRole("button", {
    name: "Copy diagram",
    exact: true,
  });
  await trigger.click();
  const supported = await page.evaluate(() =>
    ClipboardItem.supports("application/pdf"),
  );
  if (!supported)
    await expect(
      page.getByRole("button", { name: "Copy PDF", exact: true }),
    ).toBeDisabled();
  await page
    .getByRole("button", { name: "Export diagram", exact: true })
    .click();
  await expect(page.locator(".copy-menu")).toHaveCount(0);
  await trigger.click();
  await expect(page.locator(".export-menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".copy-menu")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const box = (await page.locator(".copy-menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator(".canvas").click({ position: { x: 10, y: 400 } });
  await expect(page.locator(".copy-menu")).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await trigger.click();
  await page.getByRole("button", { name: "Copy Mermaid code" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was denied",
  );
  await expect(page.getByRole("status")).not.toHaveText("Copied to clipboard");
});
