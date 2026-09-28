export type ExportFormat = "svg" | "png" | "jpg" | "pdf";

// PDF has no HTML layout engine. Measure the already-rendered HTML labels and
// replace them with SVG text at the same local coordinates, preserving wrapping.
function vectorizeHtmlLabels(original: SVGSVGElement, copy: SVGSVGElement) {
  const originals = [
    ...original.querySelectorAll<SVGForeignObjectElement>("foreignObject"),
  ];
  copy.querySelectorAll("foreignObject").forEach((target, index) => {
    const source = originals[index];
    const inverse = source.getScreenCTM()!.inverse();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    if (source.hasAttribute("transform"))
      group.setAttribute("transform", source.getAttribute("transform")!);
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const style = getComputedStyle(node.parentElement!);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const size = parseFloat(style.fontSize) || 14;
      const range = document.createRange();
      let run = "",
        runX = 0,
        runY = 0;
      const flush = () => {
        if (!run) return;
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        text.setAttribute("x", String(runX));
        text.setAttribute("y", String(runY));
        text.setAttribute("font-family", "Helvetica");
        text.setAttribute("font-size", String(size));
        text.setAttribute("font-weight", style.fontWeight);
        text.setAttribute("font-style", style.fontStyle);
        text.setAttribute("fill", style.color);
        text.setAttribute("text-anchor", "start");
        text.setAttribute("xml:space", "preserve");
        text.style.fontFamily = "helvetica";
        text.style.fontSize = `${size}px`;
        text.style.fontWeight = style.fontWeight;
        text.style.fontStyle = style.fontStyle;
        text.style.fill = style.color;
        text.style.textAnchor = "start";
        text.textContent = run;
        group.append(text);
        run = "";
      };
      for (let i = 0; i < node.textContent.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const top = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
        const bottom = new DOMPoint(rect.left, rect.bottom).matrixTransform(
          inverse,
        );
        const y = bottom.y - (bottom.y - top.y - size) / 2 - size * 0.2;
        if (run && Math.abs(y - runY) > 0.5) flush();
        if (!run) {
          runX = top.x;
          runY = y;
        }
        run += node.textContent[i];
      }
      flush();
    }
    target.replaceWith(group);
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function createDiagramBlob(
  svg: SVGSVGElement,
  format: ExportFormat,
  background: string,
): Promise<Blob> {
  const box = svg.getBBox();
  const width = Math.ceil(box.width + 48),
    height = Math.ceil(box.height + 48);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute(
    "viewBox",
    `${box.x - 24} ${box.y - 24} ${width} ${height}`,
  );
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(box.x - 24));
  rect.setAttribute("y", String(box.y - 24));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", background);
  copy.prepend(rect);
  const source = new XMLSerializer().serializeToString(copy);
  if (format === "svg") {
    return new Blob([source], { type: "image/svg+xml" });
  }
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    await import("svg2pdf.js");
    // Resolve Mermaid's stylesheet while the original SVG is still attached.
    // Detached computed styles otherwise lose strokes, marker fills, and fonts.
    const sourceElements = [svg, ...svg.querySelectorAll("*")];
    const targetElements = [copy, ...copy.querySelectorAll("*")].filter(
      (el) => el !== rect,
    );
    const properties = [
      "fill",
      "fill-opacity",
      "stroke",
      "stroke-width",
      "stroke-opacity",
      "stroke-dasharray",
      "stroke-linecap",
      "stroke-linejoin",
      "opacity",
      "font-size",
      "font-weight",
      "font-style",
      "text-anchor",
      "dominant-baseline",
      "visibility",
    ];
    sourceElements.forEach((element, i) => {
      const target = targetElements[i] as SVGElement;
      const style = getComputedStyle(element);
      properties.forEach((property) =>
        target.style.setProperty(property, style.getPropertyValue(property)),
      );
      target.style.fontFamily = "helvetica";
      // SVG treats an all-zero dash pattern as solid; PDF does not.
      const dash = style.strokeDasharray;
      if (
        dash !== "none" &&
        dash.split(/[ ,]+/).every((value) => parseFloat(value) === 0)
      ) {
        target.style.setProperty("stroke-dasharray", "none", "important");
        target.removeAttribute("stroke-dasharray");
      }
    });
    vectorizeHtmlLabels(svg, copy);
    // A single page matching the full diagram, with no viewport cropping.
    const pageScale = Math.min(0.75, 14000 / width, 14000 / height);
    const w = width * pageScale,
      h = height * pageScale;
    const pdf = new jsPDF({
      orientation: w > h ? "landscape" : "portrait",
      unit: "pt",
      format: [w, h],
      compress: true,
    });
    await pdf.svg(copy, { x: 0, y: 0, width: w, height: h });
    return pdf.output("blob");
  }
  // Use a data URL so SVG foreignObject labels stay origin-clean in Chromium.
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  // Render at 4x, bounded to avoid oversized canvas allocations on large graphs.
  const scale = Math.min(
    4,
    16384 / width,
    16384 / height,
    Math.sqrt(64_000_000 / (width * height)),
  );
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable in this browser.");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not create the image.")),
      format === "jpg" ? "image/jpeg" : "image/png",
      1,
    ),
  );
  return blob;
}

export async function exportDiagram(
  svg: SVGSVGElement,
  name: string,
  format: ExportFormat,
  background: string,
) {
  const filename = (name.trim() || "diagram").replace(
    /[<>:"/\\|?*\x00-\x1F]/g,
    "-",
  );
  saveBlob(
    await createDiagramBlob(svg, format, background),
    `${filename}.${format}`,
  );
}
