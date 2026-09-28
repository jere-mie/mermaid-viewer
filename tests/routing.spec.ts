import { test, expect } from "@playwright/test";
import {
  routeConnection,
  crossesBox,
  placeLabel,
  overlaps,
} from "../src/routing";

test("parallel relationships get separate paths and labels", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page
    .getByLabel("Mermaid source")
    .fill(
      "flowchart LR\n A[Start] -->|first| B[End]\n A -->|second| B\n A -->|third| B",
    );
  await expect(page.locator("[data-entity]")).toHaveCount(2);
  await page.locator("[data-entity]").first().focus();
  await page.keyboard.press("ArrowLeft");
  const paths = await page
    .locator("path.flowchart-link")
    .evaluateAll((es) => es.map((e) => e.getAttribute("d")));
  expect(new Set(paths).size).toBe(3);
  const labels = await page
    .locator(".edgeLabels > .edgeLabel")
    .evaluateAll((es) =>
      es.map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      expect(overlaps(labels[i], labels[j])).toBe(false);
});

test("routes around intervening entities without moving its endpoints", () => {
  const boxes = [
    { x: 0, y: 100, width: 100, height: 80 },
    { x: 500, y: 100, width: 100, height: 80 },
    { x: 220, y: 60, width: 140, height: 170 },
  ];
  const path = routeConnection(
    { x: 100, y: 140 },
    { x: 500, y: 140 },
    "right",
    "left",
    boxes,
    [],
  )!;
  expect(path).not.toBeNull();
  expect(path.length).toBeGreaterThan(2);
  expect(path[0]).toEqual({ x: 100, y: 140 });
  expect(path.at(-1)).toEqual({ x: 500, y: 140 });
  for (let i = 1; i < path.length; i++) {
    expect(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y).toBe(
      true,
    );
    for (const box of boxes)
      expect(crossesBox(path[i - 1], path[i], box)).toBe(false);
  }
  const label = placeLabel(path, 100, 20, boxes, [path]);
  expect(boxes.some((box) => overlaps(label, box))).toBe(false);
  const second = placeLabel(path, 100, 20, [...boxes, label], [path]);
  expect(overlaps(label, second)).toBe(false);
});

test("self loops remain outside their entity and impossible routes have a fallback", () => {
  const box = { x: 0, y: 0, width: 100, height: 80 };
  const path = routeConnection(
    { x: 100, y: 40 },
    { x: 50, y: 80 },
    "right",
    "bottom",
    [box],
    [],
  )!;
  expect(path).not.toBeNull();
  expect(path.length).toBeGreaterThan(3);
  for (let i = 1; i < path.length; i++)
    expect(crossesBox(path[i - 1], path[i], box)).toBe(false);
  expect(
    routeConnection(
      { x: 100, y: 40 },
      { x: 130, y: 40 },
      "right",
      "left",
      [box, { x: 110, y: 0, width: 100, height: 80 }],
      [],
    ),
  ).toBeNull();
});

test("saved ER arrangement reroutes around a table and avoids label collisions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>(".diagram-surface svg")!;
    const workspace = JSON.parse(
      localStorage.getItem("mermaid-viewer.workspace.v1")!,
    );
    const doc = workspace.docs.find(
      (d: { id: string }) => d.id === workspace.active,
    );
    const target: Record<string, [number, number]> = {
      "entity-CUSTOMER": [0, 100],
      "entity-ORDER": [650, 100],
      "entity-PRODUCT": [300, 60],
      "entity-ORDER_ITEM": [400, 440],
    };
    for (const node of svg.querySelectorAll<SVGGElement>("[data-entity]")) {
      const id = node.dataset.entity!;
      const b = node.getBBox();
      const p = new DOMPoint(b.x, b.y).matrixTransform(
        svg.getCTM()!.inverse().multiply(node.getCTM()!),
      );
      doc.positions[id] = { x: target[id][0] - p.x, y: target[id][1] - p.y };
    }
    localStorage.setItem(
      "mermaid-viewer.workspace.v1",
      JSON.stringify(workspace),
    );
  });
  await page.reload();
  await expect(page.locator("[data-entity]")).toHaveCount(4);
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>(".diagram-surface svg")!;
    const bounds = (el: SVGGraphicsElement) => {
      const b = el.getBBox(),
        m = svg.getCTM()!.inverse().multiply(el.getCTM()!);
      const p = new DOMPoint(b.x, b.y).matrixTransform(m),
        q = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
      return { x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y };
    };
    const boxes = [...svg.querySelectorAll<SVGGElement>("[data-entity]")].map(
      bounds,
    );
    const labels = [
      ...svg.querySelectorAll<SVGGElement>(".edgeLabels > .edgeLabel"),
    ].map(bounds);
    const edge = svg.querySelector<SVGPathElement>(".relationshipLine")!;
    return {
      boxes,
      labels,
      d: edge.getAttribute("d"),
      points: Array.from({ length: 101 }, (_, i) => {
        const p = edge.getPointAtLength((edge.getTotalLength() * i) / 100);
        return { x: p.x, y: p.y };
      }),
    };
  });
  expect(geometry.boxes[0].x).toBeCloseTo(0);
  expect(geometry.boxes[1].x).toBeCloseTo(650);
  expect(geometry.boxes[3].x).toBeCloseTo(300);
  const obstacle = geometry.boxes[3];
  expect(
    geometry.points.some(
      (p) =>
        p.x > obstacle.x &&
        p.x < obstacle.x + obstacle.width &&
        p.y > obstacle.y &&
        p.y < obstacle.y + obstacle.height,
    ),
  ).toBe(false);
  for (const label of geometry.labels)
    for (const box of geometry.boxes) expect(overlaps(label, box)).toBe(false);
  for (let i = 0; i < geometry.labels.length; i++)
    for (let j = i + 1; j < geometry.labels.length; j++)
      expect(overlaps(geometry.labels[i], geometry.labels[j])).toBe(false);
  await page.screenshot({ path: "test-results/rerouted.png" });
  await page.reload();
  await expect(page.locator(".relationshipLine").first()).toHaveAttribute(
    "d",
    geometry.d!,
  );
});
