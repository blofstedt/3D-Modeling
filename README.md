# Craft3D

A browser-based CAD modeler in the spirit of Shapr3D: sketch a 2D profile, pull it into a solid,
then refine it with direct-manipulation tools. No backend — everything runs client-side and
autosaves to `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in dist/
npm run lint     # type-check (tsc --noEmit)
```

## Using it

| Tool | Key | What it does |
| --- | --- | --- |
| Select | `V` | Click a body, face or wall. `Shift`-click to select several |
| New sketch | `N` | Polygon, rectangle, circle, triangle or bezier curve on a snapping grid |
| Extrude | `E` | Pull the arrow on a top face to set height (type an exact value in the bar) |
| Move face | `M` | Push/pull walls, drag corner handles |
| Fillet & bevel | `B` | 2D corner radius and 3D edge chamfer/round |
| Cut | `C` | Boolean-subtract one body from another |
| Pattern | `R` | Repeat a body along a line or curve |
| Group / Union | `G` / `U` | Group bodies, or merge overlapping ones |

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete, `1`/`2` switch Sketch/Model,
`Space`-drag or two-finger drag to pan the sketch, scroll or pinch to zoom.

Export STL (Z-up, slicer-ready), OBJ or JSON from the Inspector's **Export** tab. Exports use the
same geometry you see in the viewport, including cutouts and bevels.

## Layout

```
src/
  App.tsx                 document state, history, shortcuts, layout
  components/
    ModelViewer3D.tsx     three.js scene, gizmos, hit-testing, camera
    SketchCanvas.tsx      2D sketch canvas (pan / zoom / snapping)
    ToolRail.tsx          left tool palette
    Sidebar.tsx           inspector: properties, material, bodies, export
    DimensionBadge.tsx    floating exact-value editor
    ViewCube.tsx          orientation cube
    *Modal.tsx            cut, bevel, pattern dialogs
  utils/
    geometry.ts           polygon booleans, corner rounding, patterns
    bodyGeometry.ts       extrusion geometry shared by viewer and exporters
    exporters.ts          STL / OBJ / JSON
  hooks/useHistory.ts     debounced undo/redo
```
