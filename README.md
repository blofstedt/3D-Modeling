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

There are no tools to pick. Point at something and drag it; the cursor and a hint line say what will happen.

| You want to | Do this |
| --- | --- |
| Select a shape | Click it. `Shift`-click to add more |
| Move it | Drag the shape itself (`Shift` locks to one axis). Or type X / Y / Lift in the bar |
| Extrude a face | Tap a face (top, bottom or a wall): it lights up with an arrow. Drag the face or its arrow to pull it out or push it in, or type/nudge in the bar |
| Change its height | Tap the top face and drag it (or drag the arrow), or type Height |
| Push or pull a wall | Drag the white dot on that wall |
| Rotate it | Drag the ring around it (`Shift` snaps to 15°), or use the rotate buttons |
| Resize it | Type Width / Depth / Height in the bar |
| Bevel an edge | Hover an edge (it lights up) and click it. A panel appears right beside the edge: drag the slider or type a size, switch Curved or Flat. Only that edge changes. Tap a face and drag it (or its arrow) to extrude it |
| Round one corner | Click the vertical corner line the same way |
| Look around | Drag empty space to orbit, right-drag to pan, scroll to zoom |

The bar at the top always belongs to the selection and shows exactly what can be typed or done with it.

**Isolating.** Select a shape (or a group) and press `I`, or use the focus button on its row in the Bodies
list. Everything else disappears from both the 3D view and the sketch view until you press `I` or *Show all*.
Escape steps back one level at a time: edge, face, selection, isolation.

**Editing a shape in 2D.** With a shape selected, *Edit this shape's outline* opens the sketch view on it.
Drag its corners to reshape it, or drag the shape to move it. With it isolated, nothing else gets in the way.

**Sketching.** `N` starts a new sketch. Existing shapes show as outlines you can snap to. *Sketching on* picks
the ground or the top of any shape, and new shapes are created at that height so parts can be stacked.

Commands (left rail, also in the bar): New sketch `N`, Isolate `I`, Group `G`, Union `U`, Cut `C`,
Repeat `R`. Grouped shapes select and move together.

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete (or remove the selected bevels), `1`/`2`
switch Sketch/Model, `Space`-drag or two-finger drag to pan the sketch, scroll or pinch to zoom.

Export STL (Z-up, slicer-ready), OBJ or JSON from the Inspector's **Export** tab. Exports use the
same geometry you see in the viewport, including cutouts and bevels.

### Performance notes

Dragging is built to stay cheap: moves and rotations are applied as transforms to the existing meshes and
committed once on release, height drags stretch the mesh and rebuild it on release, wall drags skip the bevel
cut until you let go, input is applied once per frame, the scene only renders when something changed, and
resolution drops briefly while you orbit or drag on high-DPI screens.

## Layout

```
src/
  App.tsx                 document state, history, shortcuts, layout
  components/
    ModelViewer3D.tsx     three.js scene, direct-manipulation handles, hit-testing, edge picking, camera
    SketchCanvas.tsx      2D sketch canvas (pan / zoom / snapping, reference outlines)
    ToolRail.tsx          left command rail (sketch, isolate, group, union, cut, repeat)
    FloatingControls.tsx  edge bevel panel pinned to the selected edge
    Sidebar.tsx           inspector: properties, material, bodies, export
    ViewCube.tsx          orientation cube
    *Modal.tsx            cut and pattern dialogs
  utils/
    geometry.ts           polygon booleans, corner rounding, patterns
    outline.ts            corner rounding, edge runs (a body = base outline + radii)
    edges.ts              pickable edges, per-edge bevel edits
    faces.ts              face extrusion (top, bottom, walls)
    bodyGeometry.ts       extrusion + CSG bevels, shared by viewer and exporters
    transform.ts          move / rotate bodies
    exporters.ts          STL / OBJ / JSON
  hooks/useHistory.ts     debounced undo/redo
```
