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
| Select a shape | Click it. To select several, **press and hold** another shape while one is selected (or `Shift`-click); hold a selected shape to drop it again |
| Move it | Drag the shape itself (`Shift` locks to one axis). For exact X / Y / Z motion, **two-finger tap** (or `M`, or the Move tool) shows red / green / blue arrows: drag one to move along that axis. Tap again to hide them |
| Extrude a face | Tap a face (top, bottom or a wall): it lights up with an arrow. Drag the face or its arrow to pull it out or push it in |
| Type an exact number | Tapping a face shows its number (Height, or Width / Depth for a wall) next to the arrow, and it stays while you drag. Tap it to type a value; add a unit if you like (`12cm`, `1.2m`, `5in`), a bare number is mm. It fades after 3 seconds |
| Push or pull a wall | Drag the white dot on that wall |
| Rotate it | Drag the ring around it (`Shift` snaps to 15°) |
| Bevel an edge | Tap an edge (it lights up, and the touch area is generous). **Tap it again** to widen to the whole rim, once more to go back to one edge. **Press and hold** another edge to add it (hold a selected one to drop it); `Shift`-click works on a desktop. Or tap a face and press **Edges** to select every edge around it. The top bar's **Select** menu picks all top edges, bottom edges, vertical corners or every edge. Then tap the yellow dot, press Curved or Flat and drag: every selected edge gets the same bevel and size |
| Round one corner | Click the vertical corner line the same way |
| Delete | Delete in the bottom bar (asks first), or `Del` |
| Look around | Drag empty space to orbit, right-drag to pan, scroll to zoom |

**Two bars.** The top bar is for *properties* and changes with what you have selected: a shape shows its
name (properties, corner rounding, bevels), *Size & position* (width, depth, height, X, Y, Z) and *Material*; a face or an
edge shows its own numbers. The file button exports and clears. The bottom bar is for
*tools*: Shape, Move, Group (Ungroup when a group is selected), Repeat, Organize (Join, Subtract, Isolate, Hide) and Delete.

**Isolating.** Select a shape (or a group) and press `I`, or use the focus button on its row in the Bodies
list. Everything else disappears from the 3D view until you press `I` or *Show all*.
Escape steps back one level at a time: edge, face, selection, isolation.

Tools (bottom bar): Move `M`, Group `G`, Isolate `I`, Hide `H`, Join `J` (stick the selected shapes together into one solid, each keeping its own height), Subtract `S`
(select 2+ shapes; the one you picked last is cut out of the others, but only where they overlap in height), Repeat `R`. Grouped shapes select and move together.

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete (or remove the selected bevels).

Export STL (Z-up, slicer-ready), OBJ or JSON from the file menu at the top right. Exports use the
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
    Sidebar.tsx           content of the bar menus: properties, material, scene list, export
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
