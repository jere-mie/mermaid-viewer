# Mermaid Viewer

A small, frontend-only Mermaid workspace built with React, TypeScript, Vite, and Mermaid. No backend, account, API key, or database is needed. Source, names, and custom entity positions are automatically saved to `localStorage` on this browser and origin.

## Run

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`).

## Use

- Paste Mermaid into the source panel; the preview updates automatically.
- The workspace uses one compact toolbar with no footers. Drag the divider to resize the side-by-side panes, or focus it and use arrow keys. Double-click it for an even split.
- Toggle Code or Preview in the toolbar to hide either pane completely. The other pane fills the workspace; hiding the last visible pane switches to the other. Pane visibility and split size are remembered in this browser.
- Drag tables in ER diagrams, nodes in flowcharts, or classes in class diagrams. Connected paths, relationship markers, and labels follow. Positions survive source edits and reloads when entity identifiers remain the same.
- Drag blank canvas to pan. Shift-drag or middle-button-drag pans even over entities. Scroll to zoom around the pointer, or use the zoom buttons.
- Use Fit to bring the diagram into view and Fullscreen for more space.
- Focus an entity with Tab and use arrow keys to move it; Shift increases the step.
- Reset layout discards custom positions for the current diagram.
- Use the arrow beside the title to switch or delete diagrams; edit the title directly to rename it. Examples create a separate diagram.
- The export menu offers SVG, PNG, JPG, and PDF. Each format includes the entire diagram with your custom arrangement, independent of the current pan and zoom. Exports use the current light or dark theme with a solid background. PNG and JPG render at up to 4x resolution, capped at 16384 pixels per side and 64 megapixels. PNG is lossless; JPG uses maximum encoder quality. PDF uses vector paths and selectable text on a single page sized to the diagram, with HTML labels converted to positioned SVG text. Existing raster images in a diagram remain raster.
- The sun/moon button switches the interface and diagram between light and dark mode. It initially follows your system preference and remembers your choice.
- Click the zoom percentage to enter an exact value from 10 to 400, including decimals. Enter or clicking away applies it; Escape cancels. Values outside the range are clamped.
- The Copy button beside Download copies Mermaid code, SVG source as text, or a high-resolution PNG image with the current layout and theme. Native SVG, JPG, and PDF clipboard options are enabled only when the browser reports support. When PDF clipboard is unavailable, use Download. Clipboard access requires HTTPS or localhost and browser permission. Mermaid code can still be copied when its syntax is invalid.
- Diagram, example, copy, and export menus close when you click outside, move focus away, or press Escape.

All Mermaid diagram types can render. Entity rearrangement is implemented for ER, flowchart, and class diagrams; other types offer viewing, pan, zoom, fullscreen, and export. After a drag or keyboard move, connections are rerouted around fixed entity bounds with right-angle bends, separate attachment points, and collision-aware label placement. Routes are recreated on reload and included in downloads and clipboard images. Reset layout restores Mermaid's original arrangement and paths. Overlapping entities or crowded diagrams can still cause crossings; if no clear route exists, the connection retains its stretched path. Subgraph containers are not independently draggable and do not resize with manual moves. Mermaid source describes connections; custom entity positions are stored separately and are not encoded into that source.

The app bundles its fonts and Mermaid runtime. There are no analytics or runtime services, and diagram content is not uploaded. Clearing browser site data clears saved diagrams. A storage failure is reported in the UI and offers a JSON backup download. Mermaid runs with its strict security setting.

## Build and deploy

```sh
npm run build
npm run preview
```

Publish `dist/` to any static web host. This build requires no server runtime. For hosting under a subdirectory, set Vite's `base` option to that path before building. Serving the app still requires HTTP(S); opening the built HTML directly using `file://` is unsupported.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` builds and tests the app, then deploys `dist/` on pushes to `main`. It can also be run manually from the Actions tab on `main`. It uses the built-in GitHub token; no deployment secret is needed. If you use a different production branch, update both the push filter and the deploy job condition.

Before the first deployment:

1. In the repository's **Settings > Pages**, select **GitHub Actions** as the build source.
2. Set the Pages custom domain to `mermaid.zxcv.fyi`.
3. At your DNS provider, create a CNAME record for `mermaid` pointing to `<github-owner>.github.io`. Replace the placeholder with the account or organization that owns the repository, without a repository path.
4. Enable **Enforce HTTPS** in Pages settings once the certificate is available.
5. Push to `main` or run the workflow when you are ready to publish.

`public/CNAME` records the intended domain and is copied into the build, but a custom Actions workflow does not configure the Pages domain from that file. The repository setting and DNS setup above are still required. See [GitHub's custom domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) and [custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The static HTML includes canonical, Open Graph, and Twitter card metadata for this domain. The preview image is `public/og-image.png`; its editable source is `public/og-image.svg`. These tags are available to crawlers without running JavaScript.

Existing saved diagrams and pane settings from the earlier app name are read as a fallback and saved under the generic `mermaid-viewer` keys. Browser storage is specific to the origin, so localhost data does not automatically transfer to the deployed domain.

## Test

```sh
npx playwright install chromium
npm test
```

Browser tests cover edge and label movement, persistent positions, source edits, class and flowchart dragging, syntax recovery, other diagram types, keyboard controls, pan/zoom, fullscreen, SVG export, multiple documents, mobile layout, and unavailable browser storage. The test runner starts Vite automatically if needed.

## Implementation

- `src/main.tsx`: workspace, rendering, persistence, controls, and pointer interaction.
- `src/layout.ts`: stable entity identity, SVG layout adaptation, attachment points, and routing integration. Dragging uses fast interpolation; releasing triggers routing without moving entities.
- `src/routing.ts`: browser-only orthogonal path routing around entity bounds and label placement that penalizes overlaps and line crossings.
- `src/style.css`: responsive workspace styling.
- `src/export.ts`: browser-only SVG, PNG, JPG, and PDF downloads.

Mermaid is a substantial renderer and diagram implementations are split into lazy-loaded chunks. Vite may report large chunks for the core renderer and certain diagram types.

## License

Licensed under the [Zero-Clause BSD (0BSD) license](LICENSE). Third-party dependencies retain their respective licenses.
