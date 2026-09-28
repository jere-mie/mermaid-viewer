export type Point = { x: number; y: number };
export type Positions = Record<string, Point>;
type Node = {
  id: string;
  element: SVGGElement;
  transform: string;
  box: DOMRect;
  inverse: DOMMatrix;
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
  }[];
};

// Keep Mermaid's shapes, markers, and labels. Deform each original edge by the
// displacement of its two endpoints, so relationship notation stays attached.
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
      return {
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
    return {
      element,
      transform: element.getAttribute("transform") || "",
      inverse: matrix(
        element.parentElement as unknown as SVGGraphicsElement,
      ).inverse(),
      t: index / (points.length - 1),
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
      edge.labels.push(info);
    });
  function apply() {
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
  }
  apply();
  return { nodes, apply, positions };
}
