import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import mermaid from "mermaid";
import {
  Check,
  ChevronDown,
  Code2,
  Download,
  Copy,
  Expand,
  Maximize,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Trash2,
  Moon,
  Sun,
} from "lucide-react";
import { createLayout, type Positions } from "./layout";
import {
  copyDiagram,
  supportsClipboardFormat,
  type CopyFormat,
} from "./clipboard";
import { exportDiagram, type ExportFormat } from "./export";
import "./style.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";

const ER = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : includes

    CUSTOMER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        int customer_id FK
        date created_at
        string status
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
    PRODUCT {
        int id PK
        string name
        decimal price
    }`;
const samples: Record<string, string> = {
  "Entity relationship": ER,
  Flowchart: `flowchart TD\n    A[An idea] --> B[Make something]\n    B --> C{Does it work?}\n    C -->|Yes| D[Ship it]\n    C -->|Not yet| B`,
  "Class diagram": `classDiagram\n    Customer "1" --> "*" Order : places\n    class Customer {\n        +int id\n        +string name\n        +placeOrder()\n    }\n    class Order {\n        +int id\n        +string status\n        +complete()\n    }`,
  Sequence: `sequenceDiagram\n    participant User\n    participant Browser\n    User->>Browser: Paste Mermaid code\n    Browser->>Browser: Render diagram\n    Browser-->>User: Diagram rendered`,
};
type Doc = { id: string; name: string; code: string; positions: Positions };
const KEY = "mermaid-viewer.workspace.v1";
const initialDoc = (): Doc => ({
  id: crypto.randomUUID(),
  name: "Commerce schema",
  code: ER,
  positions: {},
});
function load(): { docs: Doc[]; active: string } {
  try {
    const data = JSON.parse(
      localStorage.getItem(KEY) ||
        localStorage.getItem("meridian.workspace.v1") ||
        "null",
    );
    if (
      data?.docs?.length &&
      data.docs.every(
        (d: Doc) =>
          typeof d.id === "string" &&
          typeof d.name === "string" &&
          typeof d.code === "string" &&
          d.positions &&
          Object.values(d.positions).every(
            (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
          ),
      )
    )
      return {
        docs: data.docs,
        active: data.docs.some((d: Doc) => d.id === data.active)
          ? data.active
          : data.docs[0].id,
      };
  } catch {
    /* A blocked or invalid store must not prevent editing. */
  }
  const doc = initialDoc();
  return { docs: [doc], active: doc.id };
}
function configureMermaid(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    themeVariables: dark
      ? {
          darkMode: true,
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          background: "#181d1a",
          primaryColor: "#293b2d",
          primaryTextColor: "#e0e9dc",
          primaryBorderColor: "#81997a",
          lineColor: "#a4b79d",
          secondaryColor: "#253128",
          tertiaryColor: "#202923",
          textColor: "#e0e9dc",
          nodeTextColor: "#e0e9dc",
          edgeLabelBackground: "#202923",
          actorBkg: "#293b2d",
          actorTextColor: "#e0e9dc",
          actorBorder: "#81997a",
          signalColor: "#c3d1bb",
          signalTextColor: "#e0e9dc",
          attributeBackgroundColorOdd: "#253128",
          attributeBackgroundColorEven: "#202923",
        }
      : {
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          primaryColor: "#eff5ed",
          primaryTextColor: "#263a30",
          primaryBorderColor: "#8ca28f",
          lineColor: "#7c8d80",
          secondaryColor: "#f7f9f5",
          tertiaryColor: "#ffffff",
        },
    er: { useMaxWidth: false },
    flowchart: { useMaxWidth: false, htmlLabels: false },
    class: { useMaxWidth: false },
  });
}
let renderId = 0;
function App() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("mermaid-viewer.theme");
      if (saved) return saved === "dark";
    } catch {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("mermaid-viewer.theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  const [workspace, setWorkspace] = useState(load);
  const { docs, active } = workspace;
  const doc = docs.find((d) => d.id === active)!;
  const [saved, setSaved] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [panes, setPanes] = useState<{
    editor: boolean;
    preview: boolean;
    split: number;
  }>(() => {
    try {
      const p = JSON.parse(
        localStorage.getItem("mermaid-viewer.panes.v1") ||
          localStorage.getItem("meridian.panes.v1") ||
          "null",
      );
      if (
        p &&
        typeof p.editor === "boolean" &&
        typeof p.preview === "boolean" &&
        (p.editor || p.preview) &&
        Number.isFinite(p.split)
      )
        return { ...p, split: Math.max(15, Math.min(85, p.split)) };
    } catch {}
    return { editor: true, preview: true, split: 35 };
  });
  const { editor, preview, split } = panes;
  const workspaceElement = useRef<HTMLElement>(null);
  const resizing = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem("mermaid-viewer.panes.v1", JSON.stringify(panes));
    } catch {}
  }, [panes]);
  function togglePane(pane: "editor" | "preview") {
    setPanes((p) => ({
      ...p,
      [pane]: !p[pane],
      ...(!p[pane === "editor" ? "preview" : "editor"]
        ? { [pane === "editor" ? "preview" : "editor"]: true }
        : {}),
    }));
  }
  function resizePane(clientX: number) {
    const box = workspaceElement.current!.getBoundingClientRect();
    setPanes((p) => ({
      ...p,
      split: Math.max(
        15,
        Math.min(85, ((clientX - box.left) / box.width) * 100),
      ),
    }));
  }
  const [menu, setMenu] = useState(false);
  const [sampleMenu, setSampleMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [copyMenu, setCopyMenu] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const dismiss = (event: Event) => {
      const target = event.target as Element;
      if (!target.closest(".document-control")) setMenu(false);
      if (!target.closest(".sample-wrap")) setSampleMenu(false);
      if (!target.closest(".export-wrap")) setExportMenu(false);
      if (!target.closest(".copy-wrap")) setCopyMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        setSampleMenu(false);
        setExportMenu(false);
        setCopyMenu(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [layoutVersion, setLayoutVersion] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const layout = useRef<ReturnType<typeof createLayout> | null>(null);
  const current = useRef(doc);
  current.current = doc;
  const viewRef = useRef(view);
  viewRef.current = view;
  function update(patch: Partial<Doc>) {
    setSaved(false);
    setWorkspace((w) => ({
      ...w,
      docs: w.docs.map((d) => (d.id === w.active ? { ...d, ...patch } : d)),
    }));
  }
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(workspace));
        setSaved(true);
        setStorageError("");
      } catch {
        setStorageError(
          "Browser storage is unavailable or full. Export a backup to keep your work.",
        );
      }
    }, 350);
    return () => clearTimeout(t);
  }, [workspace]);
  function fit() {
    const svg = surface.current?.querySelector("svg");
    const host = canvas.current;
    if (!svg || !host) return;
    const b = svg.getBBox();
    const scale = Math.min(
      1.35,
      Math.max(
        0.1,
        Math.min(
          (host.clientWidth - 48) / Math.max(b.width, 1),
          (host.clientHeight - 48) / Math.max(b.height, 1),
        ),
      ),
    );
    setView({
      scale,
      x: (host.clientWidth - b.width * scale) / 2 - b.x * scale,
      y: (host.clientHeight - b.height * scale) / 2 - b.y * scale,
    });
  }
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    layout.current = null;
    const timer = setTimeout(async () => {
      try {
        if (!doc.code.trim()) {
          if (surface.current) surface.current.innerHTML = "";
          setBusy(false);
          return;
        }
        configureMermaid(dark);
        const result = await mermaid.render(`diagram-${++renderId}`, doc.code);
        if (cancelled || !surface.current) return;
        surface.current.innerHTML = result.svg;
        const svg = surface.current.querySelector("svg")!;
        svg.removeAttribute("style");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.removeAttribute("viewBox");
        svg.style.overflow = "visible";
        svg.style.width = "1px";
        svg.style.height = "1px";
        const movable = [
          "er",
          "flowchart",
          "flowchart-v2",
          "class",
          "classDiagram",
        ].includes(result.diagramType);
        layout.current = createLayout(
          svg,
          movable ? structuredClone(current.current.positions) : {},
        );
        if (!movable) {
          layout.current.nodes.forEach((n) => {
            delete n.element.dataset.entity;
            n.element.classList.remove("movable");
            n.element.removeAttribute("tabindex");
            n.element.removeAttribute("role");
            n.element.removeAttribute("aria-label");
          });
          layout.current.nodes.length = 0;
        }
        setBusy(false);
        requestAnimationFrame(fit);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setBusy(false);
          if (surface.current) surface.current.innerHTML = "";
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc.code, doc.id, layoutVersion, dark]);
  useEffect(() => {
    const host = canvas.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = host.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (layout.current) fit();
    });
    observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, []);
  function zoom(factor: number, px?: number, py?: number) {
    const v = viewRef.current;
    const x = px ?? canvas.current!.clientWidth / 2,
      y = py ?? canvas.current!.clientHeight / 2;
    const scale = Math.min(4, Math.max(0.1, v.scale * factor));
    setView({
      scale,
      x: x - ((x - v.x) * scale) / v.scale,
      y: y - ((y - v.y) * scale) / v.scale,
    });
  }
  const gesture = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    entity?: string;
    pointer: number;
  } | null>(null);
  function pointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as Element).closest("button")) return;
    const entity =
      e.button === 0 && !e.shiftKey
        ? (e.target as Element).closest<SVGGElement>("[data-entity]")?.dataset
            .entity
        : undefined;
    const p = entity
      ? layout.current?.positions[entity] || { x: 0, y: 0 }
      : view;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      vx: p.x,
      vy: p.y,
      entity,
      pointer: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function pointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (g.entity && layout.current) {
      layout.current.positions[g.entity] = {
        x: g.vx + dx / view.scale,
        y: g.vy + dy / view.scale,
      };
      layout.current.apply(false);
    } else setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
  }
  function pointerUp() {
    if (gesture.current?.entity && layout.current) {
      layout.current.apply();
      update({ positions: { ...layout.current.positions } });
    }
    gesture.current = null;
  }
  function add(
    code = "flowchart LR\n    A[Your idea] --> B[What comes next?]",
    name = "Untitled diagram",
  ) {
    const d = { id: crypto.randomUUID(), name, code, positions: {} };
    setWorkspace((w) => ({ docs: [...w.docs, d], active: d.id }));
    setMenu(false);
    setSampleMenu(false);
  }
  function download(content: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function runExport(format: ExportFormat) {
    const svg = surface.current?.querySelector("svg");
    if (!svg || exporting) return;
    setExportMenu(false);
    setExporting(true);
    setExportError("");
    try {
      await exportDiagram(svg, doc.name, format, dark ? "#181d1a" : "#ffffff");
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Export failed. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function runCopy(format: CopyFormat) {
    if (copying) return;
    setCopyMenu(false);
    setCopying(true);
    setCopyStatus("");
    setExportError("");
    try {
      await copyDiagram(
        format,
        doc.code,
        surface.current?.querySelector("svg") ?? null,
        dark ? "#181d1a" : "#ffffff",
      );
      setCopyStatus("Copied to clipboard");
    } catch (error) {
      setExportError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Clipboard access was denied. Allow clipboard access in your browser and try again."
          : error instanceof Error
            ? error.message
            : "Copy failed. Please try again.",
      );
    } finally {
      setCopying(false);
    }
  }
  function commitZoom(value: string) {
    const percent = Number(value.trim().replace(/%$/, ""));
    if (Number.isFinite(percent) && percent > 0)
      zoom(Math.max(10, Math.min(400, percent)) / 100 / viewRef.current.scale);
    setZoomDraft(null);
  }
  return (
    <div className="app">
      <header className="toolbar" aria-label="Diagram controls">
        <div className="document-control">
          <button
            className="icon-button"
            aria-label="Saved diagrams"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <ChevronDown size={17} />
          </button>
          <input
            aria-label="Diagram name"
            value={doc.name}
            onChange={(e) => update({ name: e.target.value })}
          />
          {menu && (
            <div className="dropdown document-menu">
              <p>YOUR DIAGRAMS</p>
              {docs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setWorkspace((w) => ({ ...w, active: d.id }));
                    setMenu(false);
                  }}
                >
                  <Network size={15} />
                  <span>{d.name || "Untitled diagram"}</span>
                  {d.id === active && <Check size={14} />}
                </button>
              ))}
              <button onClick={() => add()}>
                <Plus size={15} />
                New diagram
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm(`Delete "${doc.name}"? This cannot be undone.`)) {
                    const next = docs.filter((d) => d.id !== active);
                    if (!next.length) next.push(initialDoc());
                    setWorkspace({ docs: next, active: next[0].id });
                    setMenu(false);
                  }
                }}
              >
                <Trash2 size={15} />
                Delete current diagram
              </button>
            </div>
          )}
        </div>

        <span
          className="save-state"
          title={
            storageError
              ? "Not saved"
              : saved
                ? "Saved on this device"
                : "Saving..."
          }
          aria-label={
            storageError
              ? "Not saved"
              : saved
                ? "Saved on this device"
                : "Saving..."
          }
        >
          <Check size={14} />
          <span className="sr-only">{saved ? "Saved" : "Saving..."}</span>
        </span>
        <button
          title="New diagram"
          aria-label="New diagram"
          onClick={() => add()}
        >
          <Plus size={16} />
        </button>
        <div className="sample-wrap">
          <button
            aria-expanded={sampleMenu}
            onClick={() => setSampleMenu(!sampleMenu)}
          >
            Examples <ChevronDown size={12} />
          </button>
          {sampleMenu && (
            <div className="dropdown sample-menu">
              {Object.entries(samples).map(([name, code]) => (
                <button key={name} onClick={() => add(code, name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="toolbar-divider" />
        <div className="pane-controls">
          <button
            title={editor ? "Hide source" : "Show source"}
            aria-label={editor ? "Hide source" : "Show source"}
            aria-pressed={editor}
            onClick={() => togglePane("editor")}
          >
            <Code2 size={16} />
            <span>Code</span>
          </button>
          <button
            title={preview ? "Hide preview" : "Show preview"}
            aria-label={preview ? "Hide preview" : "Show preview"}
            aria-pressed={preview}
            onClick={() => togglePane("preview")}
          >
            <Network size={16} />
            <span>Preview</span>
          </button>
        </div>
        <div className="toolbar-spacer" />
        <div className="view-controls">
          <button
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => zoom(1 / 1.2)}
          >
            <Minus size={16} />
          </button>
          <label className="zoom-field">
            <input
              className="zoom-value"
              aria-label="Zoom percentage"
              title="Zoom percentage (10-400)"
              inputMode="decimal"
              value={zoomDraft ?? String(Math.round(view.scale * 10000) / 100)}
              onFocus={(e) => {
                setZoomDraft(String(Math.round(view.scale * 10000) / 100));
                e.currentTarget.select();
              }}
              onChange={(e) => setZoomDraft(e.target.value)}
              onBlur={(e) => commitZoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = String(viewRef.current.scale * 100);
                  setZoomDraft(null);
                  e.currentTarget.blur();
                }
              }}
            />
            <span>%</span>
          </label>
          <button
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => zoom(1.2)}
          >
            <Plus size={16} />
          </button>
          <span className="control-divider" />
          <button title="Fit diagram" aria-label="Fit diagram" onClick={fit}>
            <Maximize size={16} />
          </button>
          <button
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.querySelector(".app")?.requestFullscreen();
                requestAnimationFrame(fit);
              } catch {
                setStorageError("Fullscreen is unavailable in this browser.");
              }
            }}
          >
            <Expand size={16} />
          </button>
        </div>
        <button
          title="Reset layout"
          aria-label="Reset layout"
          onClick={() => {
            update({ positions: {} });
            setLayoutVersion((v) => v + 1);
          }}
          disabled={busy || !!error}
        >
          <RotateCcw size={16} />
        </button>
        <button
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setDark((d) => !d)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="copy-wrap">
          <button
            title={copying ? "Copying..." : copyStatus || "Copy diagram"}
            aria-label="Copy diagram"
            aria-expanded={copyMenu}
            onClick={() => setCopyMenu(!copyMenu)}
            disabled={copying}
          >
            {copyStatus ? <Check size={16} /> : <Copy size={16} />}
          </button>
          {copyMenu && (
            <div className="dropdown copy-menu">
              <button onClick={() => runCopy("code")}>Copy Mermaid code</button>
              <button
                disabled={
                  busy ||
                  !!error ||
                  !doc.code.trim() ||
                  !supportsClipboardFormat("png")
                }
                onClick={() => runCopy("png")}
              >
                Copy PNG image
              </button>
              <button
                disabled={
                  busy ||
                  !!error ||
                  !doc.code.trim() ||
                  !supportsClipboardFormat("svg-source")
                }
                onClick={() => runCopy("svg-source")}
              >
                Copy SVG source
              </button>
              {supportsClipboardFormat("svg") && (
                <button
                  disabled={busy || !!error || !doc.code.trim()}
                  onClick={() => runCopy("svg")}
                >
                  Copy SVG image
                </button>
              )}
              {supportsClipboardFormat("jpg") && (
                <button
                  disabled={busy || !!error || !doc.code.trim()}
                  onClick={() => runCopy("jpg")}
                >
                  Copy JPG image
                </button>
              )}
              <button
                title={
                  supportsClipboardFormat("pdf")
                    ? "Copy vector PDF"
                    : "PDF clipboard is not supported by this browser. Use Download instead."
                }
                disabled={
                  busy ||
                  !!error ||
                  !doc.code.trim() ||
                  !supportsClipboardFormat("pdf")
                }
                onClick={() => runCopy("pdf")}
              >
                Copy PDF
              </button>
              {!supportsClipboardFormat("pdf") && (
                <p className="copy-hint">PDF is available through Download.</p>
              )}
            </div>
          )}
          <span className="sr-only" role="status">
            {copying ? "Copying..." : copyStatus}
          </span>
        </div>
        <div className="export-wrap">
          <button
            title={exporting ? "Exporting..." : "Export diagram"}
            aria-label="Export diagram"
            aria-expanded={exportMenu}
            onClick={() => setExportMenu(!exportMenu)}
            disabled={busy || !!error || !doc.code.trim() || exporting}
          >
            <Download size={16} />
          </button>
          {exportMenu && (
            <div className="dropdown export-menu">
              {(["svg", "png", "jpg", "pdf"] as const).map((format) => (
                <button key={format} onClick={() => runExport(format)}>
                  Export {format.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <main
        ref={workspaceElement}
        style={{
          gridTemplateColumns:
            editor && preview
              ? `minmax(0, ${split}fr) 5px minmax(0, ${100 - split}fr)`
              : "minmax(0, 1fr)",
        }}
      >
        {editor && (
          <aside className="editor" aria-label="Source pane">
            {" "}
            <div className="code-area">
              <div className="line-numbers" aria-hidden="true">
                {doc.code.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                style={{
                  height: Math.max(160, doc.code.split("\n").length * 23 + 30),
                }}
                aria-label="Mermaid source"
                spellCheck={false}
                value={doc.code}
                onChange={(e) => update({ code: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const t = e.currentTarget,
                      start = t.selectionStart,
                      end = t.selectionEnd;
                    update({
                      code:
                        doc.code.slice(0, start) + "    " + doc.code.slice(end),
                    });
                    requestAnimationFrame(() => {
                      t.selectionStart = t.selectionEnd = start + 4;
                    });
                  }
                }}
              />
            </div>
          </aside>
        )}
        {editor && preview && (
          <div
            className="splitter"
            role="separator"
            aria-label="Resize code and preview"
            aria-orientation="vertical"
            aria-valuemin={15}
            aria-valuemax={85}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resizing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (resizing.current) resizePane(e.clientX);
            }}
            onPointerUp={() => {
              resizing.current = false;
            }}
            onPointerCancel={() => {
              resizing.current = false;
            }}
            onDoubleClick={() => setPanes((p) => ({ ...p, split: 50 }))}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                setPanes((p) => ({
                  ...p,
                  split:
                    e.key === "Home"
                      ? 15
                      : e.key === "End"
                        ? 85
                        : Math.max(
                            15,
                            Math.min(
                              85,
                              p.split + (e.key === "ArrowLeft" ? -2 : 2),
                            ),
                          ),
                }));
              }
            }}
          />
        )}
        <section
          className={preview ? "preview" : "preview preview-hidden"}
          aria-label="Preview pane"
          aria-hidden={!preview}
          inert={!preview}
        >
          <div
            ref={canvas}
            className="canvas"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onKeyDown={(e) => {
              const entity = (e.target as HTMLElement).closest<SVGGElement>(
                "[data-entity]",
              )?.dataset.entity;
              if (
                !entity ||
                !layout.current ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              const p = layout.current.positions[entity] || { x: 0, y: 0 };
              const step = e.shiftKey ? 30 : 10;
              layout.current.positions[entity] = {
                x:
                  p.x +
                  (e.key === "ArrowRight"
                    ? step
                    : e.key === "ArrowLeft"
                      ? -step
                      : 0),
                y:
                  p.y +
                  (e.key === "ArrowDown"
                    ? step
                    : e.key === "ArrowUp"
                      ? -step
                      : 0),
              };
              layout.current.apply();
              update({ positions: { ...layout.current.positions } });
            }}
          >
            <div
              ref={surface}
              className="diagram-surface"
              style={{
                transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
                visibility: busy || error ? "hidden" : "visible",
              }}
            />
            {busy && (
              <div className="empty-state">
                <span className="spinner" />
                Rendering your diagram...
              </div>
            )}
            {error && (
              <div className="error-state" role="alert">
                <Code2 size={24} />
                <h2>Invalid Mermaid syntax</h2>
                <p>Check the source. The preview updates automatically.</p>
                <pre>{error}</pre>
              </div>
            )}
            {!busy && !error && !doc.code.trim() && (
              <div className="empty-state">
                <Network size={32} />
                <h2>No diagram</h2>
                <p>Paste Mermaid code in the source panel to get started.</p>
              </div>
            )}
          </div>
        </section>
      </main>
      {exportError && (
        <div className="storage-warning" role="alert">
          {exportError}
          <button onClick={() => setExportError("")}>Dismiss</button>
        </div>
      )}
      {storageError && (
        <div className="storage-warning" role="alert">
          {storageError}
          <button
            onClick={() =>
              download(
                JSON.stringify(workspace, null, 2),
                "mermaid-viewer-backup.json",
                "application/json",
              )
            }
          >
            Export backup
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
