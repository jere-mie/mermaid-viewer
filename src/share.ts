import type { Positions } from "./layout";

export type SharedDiagram = {
  name: string;
  code: string;
  positions: Positions;
};
const MAX_BYTES = 1_000_000;
const MAX_LINK = 64_000;

function validate(value: unknown): SharedDiagram {
  const d = value as SharedDiagram & { v: number };
  if (
    !d ||
    d.v !== 1 ||
    typeof d.name !== "string" ||
    d.name.length > 1000 ||
    typeof d.code !== "string" ||
    !d.positions ||
    typeof d.positions !== "object" ||
    Array.isArray(d.positions) ||
    Object.keys(d.positions).length > 10000
  )
    throw new Error("Invalid or unsupported share link.");
  const positions: Positions = Object.create(null);
  for (const [key, p] of Object.entries(d.positions)) {
    if (
      !p ||
      typeof p !== "object" ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > 1_000_000 ||
      Math.abs(p.y) > 1_000_000
    )
      throw new Error("Invalid positions in share link.");
    positions[key] = { x: p.x, y: p.y };
  }
  return { name: d.name, code: d.code, positions };
}

export async function createShareLink(diagram: SharedDiagram): Promise<string> {
  if (typeof CompressionStream === "undefined")
    throw new Error(
      "This browser cannot create share links. Try a newer browser.",
    );
  const data = new Blob([
    JSON.stringify({ v: 1, ...validate({ v: 1, ...diagram }) }),
  ]);
  if (data.size > MAX_BYTES)
    throw new Error(
      "This diagram is too large for a share link. Export it instead.",
    );
  const bytes = new Uint8Array(
    await new Response(
      data.stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = new URL(location.href);
  url.search = "";
  url.hash = `diagram=v1.${encoded}`;
  if (url.href.length > MAX_LINK)
    throw new Error(
      "This diagram is too large for a share link. Export it instead.",
    );
  return url.href;
}

export async function readShareLink(
  hash: string,
): Promise<SharedDiagram | null> {
  if (!hash.startsWith("#diagram=")) return null;
  if (hash.length > MAX_LINK) throw new Error("This share link is too large.");
  const match = /^#diagram=v1\.([A-Za-z0-9_-]+)$/.exec(hash);
  if (!match) throw new Error("Invalid or unsupported share link.");
  if (typeof DecompressionStream === "undefined")
    throw new Error(
      "This browser cannot open share links. Try a newer browser.",
    );
  try {
    const binary = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"))
      .getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) throw new Error("Share data is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return validate(JSON.parse(await new Blob(chunks as BlobPart[]).text()));
  } catch {
    throw new Error(
      "This share link is damaged or contains invalid diagram data.",
    );
  }
}
