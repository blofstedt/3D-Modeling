# Craft3D

A browser-based CAD modeler in the spirit of Tinkercad: drop in simple shapes, then group, join or subtract
them and refine them with direct-manipulation tools. No backend — everything runs client-side and
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
| Add a shape | Bottom bar → **Shape** opens the common shapes (box, rounded box, cylinder, triangle, wedge, pentagon, hexagon, octagon, star). With a top face selected, the new shape sits on it |
| Select a shape | Click it. `Shift`-click to add more |
| Move it | Drag the shape itself (`Shift` locks to one axis). For exact X / Y / Z motion, **two-finger tap** (or `M`, or the Move tool) shows red / green / blue arrows: drag one to move along that axis. Tap again to hide them |
| Extrude a face | Tap a face (top, bottom or a wall): it lights up with an arrow. Drag the face or its arrow to pull it out or push it in |
| Push or pull a wall | Drag the white dot on that wall |
| Rotate it | Drag the ring around it (`Shift` snaps to 15°) |
| Bevel an edge | Click an edge, tap the yellow dot, then press Curved or Flat and drag to set the size |
| Round one corner | Click the vertical corner line the same way |
| Delete | Delete in the bottom bar (asks first), or `Del` |
| Look around | Drag empty space to orbit, right-drag to pan, scroll to zoom |

**Two bars.** The top bar is for *properties* and changes with what you have selected: a shape shows its
name (properties, corner rounding, bevels), *Size & position* (width, depth, height, X, Y, Z) and *Material*; a face or an
edge shows its own numbers. *Scene* lists every shape, and the file button exports and clears. The bottom bar is for
*tools*: Shape, Move, Isolate, Group, Join, Subtract, Repeat and Delete.

**Isolating.** Select a shape (or a group) and press `I`, or use the focus button on its row in the Bodies
list. Everything else disappears from the 3D view until you press `I` or *Show all*.
Escape steps back one level at a time: edge, face, selection, isolation.

Tools (bottom bar): Move `M`, Isolate `I`, Group `G`, Join `J` (merge overlapping shapes into one), Subtract `S`
(cut one shape out of another), Repeat `R`. Grouped shapes select and move together.

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete (or remove the selected bevels).

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
    TopBar.tsx / BottomBar.tsx / Menu.tsx   the properties bar, the tools bar and their round pop-up menus
    FloatingControls.tsx  edge bevel panel pinned to the selected edge
    Sidebar.tsx           inspector: properties, material, bodies, export
    ViewCube.tsx          orientation cube
    *Modal.tsx            cut and pattern dialogs
  utils/
    geometry.ts           polygon booleans, corner rounding, patterns
    primitives.ts         stock shapes (box, cylinder, triangle, hexagon)
    outline.ts            corner rounding, edge runs (a body = base outline + radii)
    edges.ts              pickable edges, per-edge bevel edits
    faces.ts              face extrusion (top, bottom, walls)
    bodyGeometry.ts       extrusion + CSG bevels, shared by viewer and exporters
    transform.ts          move / rotate bodies
    exporters.ts          STL / OBJ / JSON
  hooks/useHistory.ts     debounced undo/redo
```
