import { createDiagramBlob } from "./export";

export type CopyFormat = "code" | "png" | "svg-source" | "svg" | "pdf" | "jpg";
const types = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  jpg: "image/jpeg",
};

export function supportsClipboardFormat(format: CopyFormat) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    return false;
  if (format === "code" || format === "svg-source" || format === "png")
    return true;
  return (
    typeof ClipboardItem.supports === "function" &&
    ClipboardItem.supports(types[format])
  );
}

export async function copyDiagram(
  format: CopyFormat,
  code: string,
  svg: SVGSVGElement | null,
  background: string,
) {
  if (format === "code") {
    if (!navigator.clipboard?.writeText)
      throw new Error(
        "Clipboard access is unavailable. Open the app over HTTPS or localhost.",
      );
    await navigator.clipboard.writeText(code);
    return;
  }
  if (!svg) throw new Error("Render a valid diagram before copying it.");
  if (!supportsClipboardFormat(format))
    throw new Error(
      "Your browser cannot copy this format. Use Download instead.",
    );
  const type = format === "svg-source" ? "text/plain" : types[format];
  const data = createDiagramBlob(
    svg,
    format === "svg-source" ? "svg" : format,
    background,
  ).then((blob) =>
    format === "svg-source" ? new Blob([blob], { type: "text/plain" }) : blob,
  );
  // Start the clipboard write in the click handler. Awaiting image/PDF generation
  // first can lose the user activation required by Safari and other browsers.
  await navigator.clipboard.write([new ClipboardItem({ [type]: data })]);
}
