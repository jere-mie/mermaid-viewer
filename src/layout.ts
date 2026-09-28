import { routeConnection, placeLabel, type Box, type Side } from "./routing";

export type Point = { x: number; y: number };
export type Positions = Record<string, Point>;
type Node = {
  id: string;
  element: SVGGElement;
  transform: string;
  box: DOMRect;
  inverse: DOMMatrix;
  outline?: Point[];
};
type Edge = {
  element: SVGPathElement;
  original: string;
  points: Point[];
  inverse: DOMMatrix;
  start?: Node;
  end?: Node;
  labels: {
    element: SVGGElement;
    transform: string;
    inverse: DOMMatrix;
    t: number;
    box: Box;
    terminal?: "start" | "end";
  }[];
};

// Keep Mermaid's shapes and markers. During dragging, deform the original paths;
// on release, route around the fixed entities and place labels in clear space.
export function createLayout(svg: SVGSVGElement, positions: Positions) {
  positions = Object.assign(Object.create(null), positions);
  const matrix = (el: SVGGraphicsElement) =>
    svg.getCTM()!.inverse().multiply(el.getCTM()!);
  const vector = (p: Point, m: DOMMatrix) => ({
    x: m.a * p.x + m.c * p.y,
    y: m.b * p.x + m.d * p.y,
  });
  const candidates = [...svg.querySelectorAll<SVGGElement>("g.node")];
  const nodes: Node[] = candidates
    .filter((el) => !el.parentElement?.closest("g.node"))
    .map((element) => {
      const raw = element.id.replace(`${svg.id}-`, "");
      const id = raw.replace(/^flowchart-/, "").replace(/-\d+$/, "");
      element.dataset.entity = id;
      element.classList.add("movable");
      element.setAttribute("tabindex", "0");
      element.setAttribute("role", "button");
      element.setAttribute(
        "aria-label",
        `Move ${element.textContent?.trim().slice(0, 80)} with arrow keys`,
      );
      const box = element.getBBox();
      const m = matrix(element);
      const corners = [
        new DOMPoint(box.x, box.y).matrixTransform(m),
        new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(m),
      ];
      const polygon = element.querySelector<SVGPolygonElement>("polygon");
      const outline = polygon
        ? Array.from({ length: polygon.points.numberOfItems }, (_, i) => {
            const p = polygon.points
              .getItem(i)
              .matrixTransform(matrix(polygon));
            return { x: p.x, y: p.y };
          })
        : undefined;
      return {
        outline,
        id,
        element,
        transform: element.getAttribute("transform") || "",
        box: new DOMRect(
          corners[0].x,
          corners[0].y,
          corners[1].x - corners[0].x,
          corners[1].y - corners[0].y,
        ),
        inverse: matrix(
          element.parentElement as unknown as SVGGraphicsElement,
        ).inverse(),
      };
    });
  function nearest(p: Point) {
    let best: Node | undefined,
      distance = Infinity;
    for (const node of nodes) {
      const b = node.box;
      const d = Math.hypot(
        Math.max(b.x - p.x, 0, p.x - b.right),
        Math.max(b.y - p.y, 0, p.y - b.bottom),
      );
      if (d < distance) {
        distance = d;
        best = node;
      }
    }
    return distance < 80 ? best : undefined;
  }
  const labels = [
    ...svg.querySelectorAll<SVGGElement>("g.edgeLabels > g.edgeLabel"),
  ];
  const edges: Edge[] = [
    ...svg.querySelectorAll<SVGPathElement>(
      "path.flowchart-link, path.relationshipLine, path.relation",
    ),
  ].map((element) => {
    const length = element.getTotalLength();
    const count = Math.max(12, Math.min(160, Math.ceil(length / 6)));
    const m = matrix(element);
    const points = Array.from({ length: count + 1 }, (_, i) => {
      const p = element
        .getPointAtLength((length * i) / count)
        .matrixTransform(m);
      return { x: p.x, y: p.y };
    });
    const related = labels.filter((label) =>
      [...label.querySelectorAll("[data-id]"), label].some((el) =>
        [element.id, element.id.replace(`${svg.id}-`, "")].includes(
          el.getAttribute("data-id") || "",
        ),
      ),
    );
    return {
      element,
      original: element.getAttribute("d") || "",
      points,
      inverse: m.inverse(),
      start: nearest(points[0]),
      end: nearest(points[count]),
      labels: related.map((element) => labelInfo(element, points)),
    };
  });
  function labelInfo(element: SVGGElement, points: Point[]) {
    const p = new DOMPoint(0, 0).matrixTransform(matrix(element));
    let index = 0;
    points.forEach((v, i) => {
      if (
        Math.hypot(v.x - p.x, v.y - p.y) <
        Math.hypot(points[index].x - p.x, points[index].y - p.y)
      )
        index = i;
    });
    const bbox = element.getBBox();
    const corner = new DOMPoint(bbox.x, bbox.y).matrixTransform(
      matrix(element),
    );
    const opposite = new DOMPoint(
      bbox.x + bbox.width,
      bbox.y + bbox.height,
    ).matrixTransform(matrix(element));
    return {
      element,
      transform: element.getAttribute("transform") || "",
      inverse: matrix(
        element.parentElement as unknown as SVGGraphicsElement,
      ).inverse(),
      t: index / (points.length - 1),
      box: {
        x: corner.x,
        y: corner.y,
        width: opposite.x - corner.x,
        height: opposite.y - corner.y,
      },
      terminal: undefined as "start" | "end" | undefined,
    };
  }
  // Mermaid versions without data-id use the same edge/label ordering.
  if (labels.length === edges.length)
    edges.forEach((edge, i) => {
      if (!edge.labels.length)
        edge.labels.push(labelInfo(labels[i], edge.points));
    });
  // Class cardinalities are separate SVG siblings, not part of the central label.
  svg
    .querySelectorAll<SVGGElement>("g.edgeLabels > g.edgeTerminals")
    .forEach((element) => {
      let sibling = element.previousElementSibling;
      while (sibling && !sibling.classList.contains("edgeLabel"))
        sibling = sibling.previousElementSibling;
      const edge = edges.find((e) =>
        e.labels.some((l) => l.element === sibling),
      );
      if (!edge) return;
      const info = labelInfo(element, edge.points);
      info.t = info.t < 0.5 ? 0 : 1;
      info.terminal = info.t === 0 ? "start" : "end";
      edge.labels.push(info);
    });
  function reroute() {
    const boxes = new Map(
      nodes.map((n) => {
        const p = positions[n.id] || { x: 0, y: 0 };
        return [
          n,
          {
            x: n.box.x + p.x,
            y: n.box.y + p.y,
            width: n.box.width,
            height: n.box.height,
          },
        ] as const;
      }),
    );
    const requests = edges
      .filter((e) => e.start && e.end)
      .map((edge) => {
        const a = boxes.get(edge.start!)!,
          b = boxes.get(edge.end!)!;
        const dx = b.x + b.width / 2 - a.x - a.width / 2,
          dy = b.y + b.height / 2 - a.y - a.height / 2;
        let source: Side, target: Side;
        if (edge.start === edge.end) {
          source = "right";
          target = "bottom";
        } else if (
          Math.abs(dx) / (a.width + b.width) >
          Math.abs(dy) / (a.height + b.height)
        ) {
          source = dx >= 0 ? "right" : "left";
          target = dx >= 0 ? "left" : "right";
        } else {
          source = dy >= 0 ? "bottom" : "top";
          target = dy >= 0 ? "top" : "bottom";
        }
        return { edge, source, target };
      });
    // Allocate separate attachment points when several edges share an entity side.
    const slots = new Map<string, { edge: Edge; end: "source" | "target" }[]>();
    requests.forEach((r) => {
      for (const end of ["source", "target"] as const) {
        const node = end === "source" ? r.edge.start! : r.edge.end!;
        const key = `${node.id}:${r[end]}`;
        slots.set(key, [...(slots.get(key) || []), { edge: r.edge, end }]);
      }
    });
    const port = (
      edge: Edge,
      node: Node,
      side: Side,
      end: "source" | "target",
    ) => {
      const b = boxes.get(node)!,
        list = slots.get(`${node.id}:${side}`)!;
      const fraction =
        0.25 +
        (0.5 * (list.findIndex((s) => s.edge === edge && s.end === end) + 1)) /
          (list.length + 1);
      let x =
        side === "left"
          ? b.x
          : side === "right"
            ? b.x + b.width
            : b.x + b.width * fraction;
      let y =
        side === "top"
          ? b.y
          : side === "bottom"
            ? b.y + b.height
            : b.y + b.height * fraction;
      // Round and polygon flowchart nodes need a port on their actual outline.
      if (node.outline || node.element.querySelector("circle, ellipse")) {
        const cx = b.x + b.width / 2,
          cy = b.y + b.height / 2;
        const dx = (x - cx) / (b.width / 2),
          dy = (y - cy) / (b.height / 2);
        if (node.outline) {
          const shift = positions[node.id] || { x: 0, y: 0 };
          const ray = { x: x - cx, y: y - cy };
          for (let i = 0; i < node.outline.length; i++) {
            const p = node.outline[i],
              q = node.outline[(i + 1) % node.outline.length];
            const sx = q.x - p.x,
              sy = q.y - p.y,
              denominator = ray.x * sy - ray.y * sx;
            if (Math.abs(denominator) < 0.00001) continue;
            const px = p.x + shift.x - cx,
              py = p.y + shift.y - cy;
            const t = (px * sy - py * sx) / denominator,
              u = (px * ray.y - py * ray.x) / denominator;
            if (t >= 0 && u >= 0 && u <= 1) {
              x = cx + ray.x * t;
              y = cy + ray.y * t;
              break;
            }
          }
        } else {
          const divisor = Math.hypot(dx, dy);
          x = cx + (x - cx) / divisor;
          y = cy + (y - cy) / divisor;
        }
      }
      return { x, y };
    };
    const paths: Point[][] = [];
    const routed = new Map<Edge, Point[]>();
    requests.forEach(({ edge, source, target }) => {
      const start = port(edge, edge.start!, source, "source"),
        end = port(edge, edge.end!, target, "target");
      const path = routeConnection(
        start,
        end,
        source,
        target,
        [...boxes.values()],
        paths,
      );
      if (!path) return; // Overlapping entities can have no clear route; retain the live path.
      paths.push(path);
      routed.set(edge, path);
      edge.element.setAttribute(
        "d",
        path
          .map((p, i) => {
            const q = new DOMPoint(p.x, p.y).matrixTransform(edge.inverse);
            return `${i ? "L" : "M"}${q.x},${q.y}`;
          })
          .join(" "),
      );
    });
    const occupied: Box[] = [...boxes.values()];
    // Endpoint cardinalities get first choice, followed by relationship names.
    const labels = [...routed.entries()]
      .flatMap(([edge, path]) => edge.labels.map((label) => ({ label, path })))
      .sort((a, b) => Number(!!b.label.terminal) - Number(!!a.label.terminal));
    labels.forEach(({ label, path }) => {
      const box = placeLabel(
        path,
        label.box.width,
        label.box.height,
        occupied,
        paths,
        label.terminal,
      );
      occupied.push(box);
      const p = vector(
        { x: box.x - label.box.x, y: box.y - label.box.y },
        label.inverse,
      );
      label.element.setAttribute(
        "transform",
        `translate(${p.x},${p.y}) ${label.transform}`,
      );
    });
  }
  function apply(route = true) {
    const zero = { x: 0, y: 0 };
    nodes.forEach((n) => {
      const p = vector(positions[n.id] || zero, n.inverse);
      n.element.setAttribute(
        "transform",
        `translate(${p.x},${p.y}) ${n.transform}`,
      );
    });
    edges.forEach((e) => {
      const a = (e.start && positions[e.start.id]) || zero;
      const b = (e.end && positions[e.end.id]) || zero;
      e.element.setAttribute(
        "d",
        a.x || a.y || b.x || b.y
          ? e.points
              .map((p, i) => {
                const t = i / (e.points.length - 1);
                const q = new DOMPoint(
                  p.x + a.x * (1 - t) + b.x * t,
                  p.y + a.y * (1 - t) + b.y * t,
                ).matrixTransform(e.inverse);
                return `${i ? "L" : "M"}${q.x},${q.y}`;
              })
              .join(" ")
          : e.original,
      );
      e.labels.forEach((l) => {
        const p = vector(
          { x: a.x * (1 - l.t) + b.x * l.t, y: a.y * (1 - l.t) + b.y * l.t },
          l.inverse,
        );
        l.element.setAttribute(
          "transform",
          `translate(${p.x},${p.y}) ${l.transform}`,
        );
      });
    });
    if (route && nodes.some((n) => positions[n.id]?.x || positions[n.id]?.y))
      reroute();
  }
  apply();
  return { nodes, apply, positions };
}
