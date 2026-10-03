# Craft3D

A browser-based CAD modeler: sketch a 2D profile, pull it into a solid,
then refine it with direct-manipulation tools. No backend — everything runs client-side and
autosaves to `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in dist/
npm run lint     # type-check (tsc --noEmit)
npm test         # headless geometry checks (rounding, bevels, moves)
```

## Using it

Pick a tool from the rail (or press its key). A bar at the top always shows what the active tool is
doing and the exact values you can type.

| Tool | Key | What it does |
| --- | --- | --- |
| Select | `V` | Click a body to select it. `Shift`-click for several. Drag empty space to orbit |
| Sketch | `N` | Draw a profile on a plane; existing bodies show as outlines you can snap to |
| Move & rotate | `M` | Drag an arrow to slide along an axis, the square to slide on the ground, the ring to rotate. Or type X / Y / height |
| Push / pull | `E` | Drag a top face or a wall directly. Click a wall first to choose it |
| Fillet & bevel | `B` | Hover an edge to preview it, click to select (`Shift` for more), set size and Round / Chamfer. Only selected edges change. Click a vertical corner line to round just that corner |
| Cut | `C` | Boolean-subtract one body from another |
| Pattern | `R` | Repeat a body along a line or curve |
| Group / Union | `G` / `U` | Group bodies so they select and move together, or merge overlapping ones |

**Sketch planes.** The *Sketching on* menu in the sketch view picks the ground or the top of any body.
New shapes are created at that height, so you can build up parts. *Sketch on top* in the selection bar
jumps straight there.

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete (or remove the selected bevels in the
bevel tool), `1`/`2` switch Sketch/Model, `Space`-drag or two-finger drag to pan the sketch, scroll or pinch
to zoom.

Export STL (Z-up, slicer-ready), OBJ or JSON from the Inspector's **Export** tab. Exports use the
same geometry you see in the viewport, including cutouts and bevels.

## Layout

```
src/
  App.tsx                 document state, history, shortcuts, layout
  components/
    ModelViewer3D.tsx     three.js scene, tool handles, hit-testing, edge picking, camera
    SketchCanvas.tsx      2D sketch canvas (pan / zoom / snapping, reference outlines)
    ToolRail.tsx          left tool palette
    ContextBar.tsx        per-tool bar: actions and exact values
    Sidebar.tsx           inspector: properties, material, bodies, export
    ViewCube.tsx          orientation cube
    *Modal.tsx            cut and pattern dialogs
  utils/
    geometry.ts           polygon booleans, corner rounding, patterns
    outline.ts            corner rounding, edge runs (a body = base outline + radii)
    edges.ts              pickable edges, per-edge bevel edits
    bodyGeometry.ts       extrusion + CSG bevels, shared by viewer and exporters
    transform.ts          move / rotate bodies
    exporters.ts          STL / OBJ / JSON
  hooks/useHistory.ts     debounced undo/redo
```
