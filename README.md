# Autora 3D

Autora 3D is a browser-based CAD modeler in the spirit of Tinkercad: drop in simple shapes, then group, join or subtract
them and refine them with direct-manipulation tools. No backend — everything runs client-side and
autosaves to `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in dist/
npm run lint     # type-check (tsc --noEmit)
npm test         # headless geometry, agent-API and server checks
npm run test:slicer  # prints parts through PrusaSlicer + ADMesh (needs them installed; skips otherwise)
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
| Draw a shape | Press **Draw** (`D`). On a top face, **Add / Cut** in the pill chooses between a new shape and a hole cut straight through it. The camera turns to look straight down, like paper (drag empty space to pan, pinch or scroll to zoom), and returns to your old angle when you finish. Tap the ground, the top of a shape or **one of its walls** to choose where to draw (a wall turns the camera square on to it, with nothing placed yet), then tap corners; the sketch lands on that surface. With a top face or a wall already selected, Draw starts there. Drag a corner to move it, drag a side to curve it (drag it back flat to straighten), tap the green corner or press `Enter` to finish. **Rectangle** and **Circle** (the pill at the bottom) are drawn by dragging them out. The result is an ordinary shape 20 mm tall (20 mm *out of the wall* on a wall) with its outer face selected, so pull it out straight away. A wall shape can be slid along its wall, resized, pulled and repeated along its wall; it can't be beveled, joined or cut yet. `Backspace` (or the take-back button) removes the last corner, `Esc` (or ✕) stops |
| Repeat a shape | Select it and press **Repeat** (`R`). Ghost copies appear at once, equally spaced. Drag the white dot to set where they end, the lilac dot to bend the path, `−` / `+` for how many, the gap box to type an exact distance, **Around** to circle the shape, **Turn** to face along the path. `Enter` or the tick keeps them, `Esc` cancels |
| Edit a repeat | The copies are **live**: change the first shape (height, walls, bevels, colour…) and every copy follows. Tap or drag any copy to work on the first shape; moving or turning it carries the whole row. Select the shape and press **Repeat** again to change the path, count or gap. **Organize → Make copies separate** lets go of them so each can be edited on its own. Deleting the first shape deletes its copies |
| Pick a shape buried inside another | Press **See through** under the view cube (or `X`): every shape turns glassy with its outline showing, and a tap picks the *innermost* shape under your finger, so a shape sitting inside another is easy to grab. Without it, **Alt-click** picks the shape behind the one in front (again for the next). A selected shape's outline always shows through whatever covers it, and the Bodies list can select anything |
| Delete | Delete in the bottom bar (asks first), or `Del` |
| Look around | Drag empty space to orbit, right-drag to pan, scroll to zoom |

**Two bars.** The top bar is for *properties* and changes with what you have selected: a shape shows its
name (properties, corner rounding, bevels), *Size & position* (width, depth, height, X, Y, Z) and *Material*; a face or an
edge shows its own numbers. The file button exports and clears. The bottom bar is for
*tools*: Shape, Move, Group (Ungroup when a group is selected), Repeat, Organize (Join, Subtract, Isolate, Hide) and Delete.

**Isolating.** Select a shape (or a group) and press `I`, or use the focus button on its row in the Bodies
list. Everything else disappears from the 3D view until you press `I` or *Show all*.
Escape steps back one level at a time: edge, face, selection, isolation.

Tools (bottom bar): Draw `D`, Move `M`, Group `G`, Isolate `I`, Hide `H`, Join `J` (stick the selected shapes together into one solid, each keeping its own height), Subtract `S`
(select 2+ shapes; the one you picked last is cut out of the others, but only where they overlap in height), Repeat `R` (see the table). Grouped shapes select and move together.

Also: `⌘/Ctrl+Z` undo, `⇧⌘Z` redo, `⌘D` duplicate, `Del` delete (or remove the selected bevels).

Save a group (or a shape) to the project library from the top bar, place linked copies from Shape → Your objects; Edit a copy, Save, and every copy follows. Export STL (Z-up, slicer-ready), GLB (metres, Y-up, colours and materials: for game engines), OBJ or JSON from the file menu at the top right. Exports use the
same geometry you see in the viewport, including cutouts and bevels.

### Phone, tablet and desktop

Everything works by touch; keyboard shortcuts are extras. Tap selects, drag moves or pulls, press-and-hold adds to the selection,
a two-finger tap shows the move arrows, **See through** (under the view cube) reaches shapes inside other shapes, and every
mode that has an `Esc` / `Enter` / `Backspace` has a button on its pill (✕, ✓, take back). Turning and the repeat path pull to 15° steps
without `Shift`. Alt-click picks the shape behind; on a phone use See through.

### For AI agents

Everything a person can do is also a tool call: shapes, drawing on the ground / a top face / a wall, holes and pockets, bevels, live repeats,
join / subtract / group, export, undo. The same commands run **headless** (Node, no browser), as an **MCP server**, as an **HTTP API**, and
inside the live app (`window.craft3d`, or `postMessage` to an embedding page). See [`docs/agent-api.md`](docs/agent-api.md) and the
generated tool reference [`docs/agent-tools.md`](docs/agent-tools.md).

```bash
npm run agent:build                       # builds dist-agent/ (library, MCP server, HTTP API)
CRAFT3D_DOC=model.json npm run agent:mcp  # MCP over stdio; the model is saved to model.json after every change
```

### Performance notes

Dragging is built to stay cheap: moves and rotations are applied as transforms to the existing meshes and
committed once on release, height drags stretch the mesh and rebuild it on release, wall drags skip the bevel
cut until you let go, input is applied once per frame, the scene only renders when something changed, and
resolution drops briefly while you orbit or drag on high-DPI screens.

## Layout

```
src/
  App.tsx                 document state, history, shortcuts, layout
  core/                   the agent API: commands on a document (no React, no DOM), shared by the app, Node and MCP
    ops.ts / tools.ts     every edit as a pure function / as a JSON-Schema tool; agent.ts runs them; engine.ts is the headless model; bridge.ts the live-app bridge

  components/
    ModelViewer3D.tsx     three.js scene, direct-manipulation handles, hit-testing, edge picking, camera
    TopBar.tsx / BottomBar.tsx / Menu.tsx   the properties bar, the tools bar and their round pop-up menus
    FloatingControls.tsx  edge bevel panel pinned to the selected edge
    Sidebar.tsx           content of the bar menus: properties, material, scene list, export
    drawTool.ts           the Draw tool's pointer handling and preview (attached while a sketch is open)
    ViewCube.tsx          orientation cube
  utils/
    geometry.ts           polygon booleans, corner rounding
    frame.ts              where a shape drawn on a wall stands (its frame), and the maths to move it
    draw.ts               sketches to outlines: curved sides, rectangle, circle, snapping
    repeat.ts             equally spaced copies along a line, curve or circle; keeps live copies in step with their shape
    primitives.ts         stock shapes (box, cylinder, triangle, hexagon)
    outline.ts            corner rounding, edge runs (a body = base outline + radii)
    edges.ts              pickable edges, per-edge bevel edits
    faces.ts              face extrusion (top, bottom, walls)
    bodyGeometry.ts       extrusion + CSG bevels, shared by viewer and exporters
    transform.ts          move / rotate bodies
    exporters.ts          STL / GLB / OBJ / JSON (glb.ts writes the glTF)
  hooks/useHistory.ts     debounced undo/redo
scripts/agent/            MCP (stdio) and HTTP servers over the headless engine
```

## Inside Autora

Autora 3D is also a window in [Autora](https://github.com/blofstedt/autora): the same app, wearing Autora's theme, opened beside the
conversation with `?embed=autora`. Autora keeps the model on its server, so the agent's `cad_*` tools and the person's hands work on one
document (protocol in `src/embed.ts`; the tools are `docs/agent-tools.md`). Autora carries a copy of this source in `autora-3d/`; change it here
and sync it there with Autora's `scripts/sync-autora-3d.mjs`.
