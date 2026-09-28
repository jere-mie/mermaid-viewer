export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type Side = "left" | "right" | "top" | "bottom";
export const directions: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
export function overlaps(a: Box, b: Box, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
export function crossesBox(a: Point, b: Point, box: Box) {
  if (Math.abs(a.y - b.y) < 0.01)
    return (
      a.y > box.y + 0.01 &&
      a.y < box.y + box.height - 0.01 &&
      Math.max(a.x, b.x) > box.x + 0.01 &&
      Math.min(a.x, b.x) < box.x + box.width - 0.01
    );
  if (Math.abs(a.x - b.x) < 0.01)
    return (
      a.x > box.x + 0.01 &&
      a.x < box.x + box.width - 0.01 &&
      Math.max(a.y, b.y) > box.y + 0.01 &&
      Math.min(a.y, b.y) < box.y + box.height - 0.01
    );
  return false;
}

// A rectilinear visibility grid: obstacle boundaries define useful lanes.
// A* chooses a short path with a bend penalty; nodes are never repositioned.
export function routeConnection(
  start: Point,
  end: Point,
  startSide: Side,
  endSide: Side,
  boxes: Box[],
  previous: Point[][],
): Point[] | null {
  const pad = 18,
    stub = 32;
  const a = {
    x: start.x + directions[startSide].x * stub,
    y: start.y + directions[startSide].y * stub,
  };
  const b = {
    x: end.x + directions[endSide].x * stub,
    y: end.y + directions[endSide].y * stub,
  };
  const obstacles = boxes.map((r) => ({
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }));
  const xs = [
    ...new Set([a.x, b.x, ...obstacles.flatMap((r) => [r.x, r.x + r.width])]),
  ].sort((x, y) => x - y);
  const ys = [
    ...new Set([a.y, b.y, ...obstacles.flatMap((r) => [r.y, r.y + r.height])]),
  ].sort((x, y) => x - y);
  if (xs.length * ys.length > 120000) return null;
  const width = xs.length;
  const index = (p: Point) => ys.indexOf(p.y) * width + xs.indexOf(p.x);
  const point = (id: number) => ({
    x: xs[id % width],
    y: ys[Math.floor(id / width)],
  });
  const inside = (p: Point) =>
    obstacles.some(
      (r) =>
        p.x > r.x + 0.01 &&
        p.x < r.x + r.width - 0.01 &&
        p.y > r.y + 0.01 &&
        p.y < r.y + r.height - 0.01,
    );
  if (inside(a) || inside(b)) return null;
  const goal = index(b),
    initial =
      index(a) * 2 + (startSide === "left" || startSide === "right" ? 0 : 1);
  const distance = new Map<number, number>([[initial, 0]]),
    parent = new Map<number, number>();
  const heap: { id: number; cost: number; priority: number }[] = [];
  const push = (item: (typeof heap)[number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].priority <= item.priority) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].priority < heap[c].priority) c++;
        if (heap[c].priority >= last.priority) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  push({ id: initial, cost: 0, priority: 0 });
  while (heap.length) {
    const item = pop();
    if (item.cost !== distance.get(item.id)) continue;
    const id = Math.floor(item.id / 2),
      p = point(id);
    if (id === goal) {
      const path = [p];
      let current = item.id;
      while (parent.has(current)) {
        current = parent.get(current)!;
        path.push(point(Math.floor(current / 2)));
      }
      const full = [start, ...path.reverse(), end];
      return full.filter(
        (p, i) =>
          i === 0 ||
          i === full.length - 1 ||
          !(
            (full[i - 1].x === p.x && p.x === full[i + 1].x) ||
            (full[i - 1].y === p.y && p.y === full[i + 1].y)
          ),
      );
    }
    const x = id % width,
      y = Math.floor(id / width);
    for (const [nx, ny, direction] of [
      [x - 1, y, 0],
      [x + 1, y, 0],
      [x, y - 1, 1],
      [x, y + 1, 1],
    ]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= ys.length) continue;
      const q = { x: xs[nx], y: ys[ny] };
      if (inside(q) || obstacles.some((r) => crossesBox(p, q, r))) continue;
      let penalty = 0;
      for (const path of previous)
        for (let i = 1; i < path.length; i++) {
          const s = path[i - 1],
            t = path[i];
          const lane = {
            x: Math.min(s.x, t.x) - 6,
            y: Math.min(s.y, t.y) - 6,
            width: Math.abs(s.x - t.x) + 12,
            height: Math.abs(s.y - t.y) + 12,
          };
          if (crossesBox(p, q, lane)) penalty += 35;
        }
      const next = (ny * width + nx) * 2 + direction;
      const cost =
        item.cost +
        Math.abs(p.x - q.x) +
        Math.abs(p.y - q.y) +
        (direction !== item.id % 2 ? 24 : 0) +
        penalty;
      if (cost >= (distance.get(next) ?? Infinity)) continue;
      distance.set(next, cost);
      parent.set(next, item.id);
      push({
        id: next,
        cost,
        priority: cost + Math.abs(q.x - b.x) + Math.abs(q.y - b.y),
      });
    }
  }
  return null;
}

export function placeLabel(
  path: Point[],
  width: number,
  height: number,
  occupied: Box[],
  paths: Point[][],
  terminal?: "start" | "end",
): Box {
  const candidates: Box[] = [];
  for (let i = 1; i < path.length; i++) {
    if (
      (terminal === "start" && i !== 1) ||
      (terminal === "end" && i !== path.length - 1)
    )
      continue;
    const a = path[i - 1],
      b = path[i];
    for (const fraction of terminal
      ? [terminal === "start" ? 0.15 : 0.85, 0.5]
      : [0.5, 0.25, 0.75]) {
      const x = a.x + (b.x - a.x) * fraction,
        y = a.y + (b.y - a.y) * fraction;
      for (const offset of [1, -1, 2, -2, 3, -3]) {
        const horizontal = Math.abs(a.y - b.y) < 0.01;
        candidates.push({
          x: x - width / 2 + (horizontal ? 0 : offset * (width / 2 + 8)),
          y: y - height / 2 + (horizontal ? offset * (height / 2 + 8) : 0),
          width,
          height,
        });
      }
    }
  }
  if (!candidates.length) return { x: path[0].x, y: path[0].y, width, height };
  const score = (box: Box, i: number) =>
    occupied.reduce((n, r) => n + (overlaps(box, r, 5) ? 100000 : 0), 0) +
    paths.reduce(
      (n, route) =>
        n +
        route.slice(1).filter((p, j) => crossesBox(route[j], p, box)).length *
          500,
      0,
    ) +
    i;
  return candidates[
    candidates.reduce(
      (best, box, i) =>
        score(box, i) < score(candidates[best], best) ? i : best,
      0,
    )
  ];
}
