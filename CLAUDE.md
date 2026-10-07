# CLAUDE.md

Craft3D is a browser-based sketch-and-extrude CAD modeler (React + three.js, no backend). It is being grown
into a tool that the owner's **Autora** project can drive. Read this before changing anything the user sees.

## The one rule: it must be obvious

> You tap, hold, move, select, etc. exactly where and what you want to change, and it's just obvious how it works.

Every UI decision is judged against that sentence. Utility is never traded away, but **UI that isn't needed is
removed**. When a feature seems to need a panel, a mode or a dialog, first find a way to do it on the object itself.

### How to apply it

1. **Act on the thing, where it is.** Controls appear on the selected object (handles, dots, arrows, a number
   next to the arrow), not in a distant panel. Tapping a face, edge or shape is the only "tool picker" needed.
2. **Gestures mean the same thing everywhere.** Tap = select / step deeper. Drag = move or change the thing
   under the finger. Press-and-hold = add to / remove from the selection. Two-finger tap = exact axes.
   Escape / tap empty space = step back one level. A new feature must reuse these, not invent new ones.
3. **No modes the user has to remember.** Prefer "the thing you touched decides what happens" over toolbar modes.
   If a short-lived mode is unavoidable (drawing a path), it must show what it is, show the next step in the
   hint line, and exit with Escape / tap-away / Done. Never leave one active silently.
4. **Show, don't ask.** Preview the result live while dragging (ghost copies, outlines, the number). Avoid
   dialogs with an Apply button; changes apply immediately and Undo is the safety net. Modal dialogs are a last resort.
5. **Defaults that work.** Every new thing should be useful with zero configuration: sensible size, snapped,
   placed where the user was looking or on the face they selected.
6. **Numbers are optional, never required.** Everything can be dragged; anything dragged can also be typed
   (`12cm`, `5in`, bare = mm) by tapping the number that is already on screen.
7. **Progressive disclosure.** The common action is one gesture; the advanced option is one more tap away on
   the same object (e.g. tap an edge again to widen to the whole rim). Don't add a second place for the same thing.
8. **Touch first.** Targets are finger-sized (the edge pick area is deliberately generous). Everything works
   without a keyboard, hover or right click; shortcuts are extras.
9. **Say what will happen.** The cursor and the one-line hint tell the user what a press will do *before* they press.
10. **Budget check before adding UI.** Before adding a button, menu item, panel or dialog, write down why the
    object itself can't carry the control. If a control only matters for the current selection, it belongs in
    the top bar (properties) or on the object, not the bottom bar (tools).

11. **Touch, desktop and agent parity.** Every capability must work by finger *and* mouse (no hover, `Shift`, `Alt`,
    right-click or keyboard-only path: a shortcut is an extra, never the only way; a mode you can leave with `Esc`
    also has a ✕), and must exist as a **tool call** in `src/core` so an AI agent can do it too. Build the operation in
    `src/core/ops.ts` first, expose it in `src/core/tools.ts`, and have the UI call that same operation (`runOp` in `App.tsx`).
    Add a case to `scripts/agent-check.ts`, then `npm run agent:docs`.

When in doubt, run the app (`/run`) and try the feature with a thumb, not a mouse: if you have to read the hint
to know what to do, it isn't obvious enough yet.

## Where things live

Two bars: **top = properties of the selection**, **bottom = tools/commands**. See `README.md` for the gesture
table and the file map. Key facts:

- A shape (`Body3D`, `src/types.ts`) is a 2D outline + `extrusionHeight` + `elevation`, with optional corner
  radii, holes and per-edge bevels. That *is* sketch-and-extrude: anything that produces an outline can produce a shape.
- Geometry/maths in `src/utils/` is UI-free and mostly pure. **Keep it that way**: it is what Autora will call.
  Don't put document logic in components.
- `src/components/ModelViewer3D.tsx` (~2000 lines) owns hit-testing, handles and camera. New interactions go in
  as small, separate units rather than growing it further.
- Performance rules in the README ("Performance notes") are requirements: drags are transforms, rebuild on release.

## Commands

```bash
npm run dev     # http://localhost:3000
npm run lint    # tsc --noEmit
npm test        # headless geometry checks (scripts/geometry-check.ts); add a check for every geometry change
npm run build
```

Run `lint` and `test` before committing. UI changes need to be tried in the browser, not just type-checked.

## Roadmap (agreed direction, not yet built)

### 1. Repeat along a path — direct, equally spaced, live (built)

`R` opens ghost copies on the shape with no dialog (`utils/repeat.ts`, `RepeatChip`, the preview effect in
`ModelViewer3D`). Spacing is by arc length. Drag the end dot, drag the middle dot to bend, `− +` count, type a
gap, **Around** (circle), **Turn** (follow the path). Enter keeps it, Esc cancels.

A kept repeat is **live**: it is stored in `Doc.repeats` and its copies (`Body3D.repeatOf`) are *derived* —
`syncRepeats` rebuilds them on every document change (all changes go through `setDoc` in `App.tsx`; never write
copies directly). Rules that keep it obvious: tapping/dragging a copy acts on the source (the viewer maps the hit);
moving/turning carries the path with it; the path stays anchored to the source's centre; deleting the source
deletes its copies; if the source disappears another way (join, subtract) the copies stay as plain shapes;
**Organize → Make copies separate** breaks the link on purpose. Pressing Repeat on a repeated shape edits it.

Still to do:
- Use any existing edge, drawn path or outline as the rail (tap it) instead of only a line/curve/circle.
- Paths that rise and fall (3D), not only on the ground plane.
- "Turn" pivots about the shape's bounding-box centre; very asymmetric shapes may want a pivot handle.
- Performance with many bevelled copies: every source edit rebuilds each copy's geometry (copies share the
  source's outline, so cache one build and transform it). Max is 60 copies today.
- Duplicate (⌘D) on a repeated shape copies the shape only, not its row.

### 2. Draw tool — Tinkercad's, but with paths that behave (first version built)

Built: **Draw** (`D`) sketches on the ground or on the top of a shape (`utils/draw.ts`, `components/drawTool.ts`,
`DrawChip`). No plane step: the first tap's surface is the plane (or a selected top face). Tap to place corners; drag
a corner to move it; drag a *side* to curve it (it becomes an arc, flattened to points); tap the green first corner
or Enter to close; Rectangle / Circle (the pill) are dragged out; a circle is a square rounded all the way, like
the stock cylinder. The result is a normal shape, 20 mm tall, top face selected so the pull-up arrow is right there.
While drawing, the camera looks straight at the surface and rotation is off, so it feels like flat paper (drag pans); the old viewing angle returns afterwards. Drawing on a wall must do the same, facing the wall head-on. The tool owns its own pointer handlers while open; the viewer's handlers bail out (`live.current.draw`).

Still to do:
- Bottom faces, undersides and slopes are refused for now; so is drawing on a shape that is itself on a wall.
- Cutting from the Draw pill goes straight through; a pocket of a given depth exists only as the `shape_cut` tool (`depth`).
- Cut-outs into walls, and pockets from a wall, need a mesh-backed body (a wall shape is a sideways prism, which the outline-and-height model cannot subtract from an upright one).
- Curved sides are flattened into many small sides, so bevelling them is per-segment; smooth runs (like corner
  rounding's `arcMid`) would let a whole curve be one edge.
- Freehand (hold to draw, then simplify), and snapping to edges / midpoints with the snap shown.
- Sketch dimensions you can type while drawing (the number beside the pointer is read-only today).
- Insert a corner by tapping a side; delete a single corner.
- Check on a real touch screen: corner/side hit reach is 24 px for touch, untested.

#### Wall shapes (built): how the model works

A shape drawn on a wall has `Body3D.frame` (`{x, y, h, angle}`: where its outline's origin sits on the wall and which
way it grows). Its outline, height and bevels stay ordinary: they are built "as if standing on the ground", in the
shape's *own space*, and `frameMatrix(frame)` (utils/frame.ts) stands that space on the wall. Rules to keep:
- Geometry code (`bodyGeometry`, `outline`, `faces`, `edges`) stays frame-free. The frame is applied at the edges: exporters,
  the viewer's `BodyEntry.root`, and `transformBody` (which moves the frame, not the outline).
- In the viewer, handles for a wall shape are built in its own space inside `gizmoFrame`; pointer rays are read in that
  space (`intersectPlane(..., frame)`, `Drag.frame`), and height drags follow the arrow's direction on screen (`axisScreen`).
  Hits are converted into the shape's space in `resolveHit`.
- Not yet for wall shapes: bevels / edge picking, move arrows, rotate ring, Join, Subtract, cutting, drawing on them. (Repeat works: the path lives in the shape's own space and the frame stays put.)
  Each is refused or hidden rather than half-working. Supporting them means doing that conversion in the matching code.
- Position X/Y/Z are hidden in the properties bar for them (the size boxes read Across / Up / Out instead).

### Bevels (curved / flat)

Edges beveled alike that meet at a corner are merged into one cutter (`joinBevelRuns` in `utils/bodyGeometry.ts`):
separate cutters overlapped at corners and left cracks and doubled faces (dark specks, non-watertight STL). `npm test`
checks that rims, partial runs, L-shapes and holes are watertight; keep that true. Sizes are honest: you can't set a
size the shape won't show (`maxBevelSize`), a first bevel is visible (`defaultBevelSize`), and the picker/label says
"largest that fits". The highlight on a beveled rim hugs the bevel and mitres at corners.
Cuts are done by Manifold (`utils/manifoldBoolean.ts`, WebAssembly), which always returns a closed solid, so neighbouring edges
with *different* sizes no longer crack. It starts asynchronously: `await initManifold()` before building geometry (`main.tsx`,
`execute`, and the test scripts do; Node needs `manifold.wasm` beside the bundle). If it is not ready, or an input is not a
closed solid, the old three-bvh-csg + `meshHeal.ts` path is the fallback (good, not exact).
`npm run test:slicer` prints 14 real parts through PrusaSlicer's CLI and ADMesh (`sudo apt install prusa-slicer admesh`; skips
if absent) and checks manifold, size, bed contact, volume vs `shape_measure`, and G-code. Keep it passing.

### Groups = objects (built: named, nested)

A group is a named object ("head"). Groups nest (`ShapeGroup.parentId`); a body names only its innermost group
(`Body3D.groupId`) and `bodyIds` is derived, so edits set those two pointers and `settle` → `normalizeGroups`
(`utils/groups.ts`) repairs the rest (groups under two shapes dissolve; contents move up). Tap = the outermost group,
tap again = one group deeper, then the shape (`pickInGroups`). Dragging, deleting and turning act on the outermost group.
Rename by tapping the name in the top bar (or `group_rename`). `group_create` nests any group wholly inside the ids.
GLB export writes the groups as a node tree.

#### Library (built: project library, linked copies)

`Doc.library` holds `LibraryItem`s: a snapshot of a group (or one shape), centred on the ground at the origin (`templateOf`,
`utils/library.ts`). A placed copy is a group with `libraryId` + `place` ({x,y,z,angle}); its shapes (`Body3D.instanceOf`) and
inner groups are *derived* by `syncInstances` in `settle`, exactly like live-repeat copies, so never write them directly.
Rules: tap picks the whole copy (never steps inside); move/turn only change `place` (`applyTransform`); deleting a copy deletes
its group; editing one of its shapes is refused with the way out. **Edit** (`object_unlink`) turns a copy into ordinary
shapes that remember the item; **Save** (`library_save`) on it updates the item and every copy follows; **Separate**
(`forget`) cuts the link. Removing an item leaves its copies as plain shapes. Tools: `library_list/save/place/rename/remove`,
`object_unlink`.

**App-wide library (built):** a project object marked `shared` (globe button in Shape → Your objects, or `library_share`) is also
kept in `localStorage` (`utils/sharedLibrary.ts`, key `craft3d:library:v1`). Items carry `rev` (ms); `mergeShared` keeps a
project object and its twin (same id) equal, newer wins, and an update flows to every linked copy in the project. Objects that
only live app-wide show in the list too; placing one imports it into the project first (`library_import`), so projects stay
self-contained. The sync lives in `App.tsx` (the browser is the only host with that storage); the headless/agent route is
`library_export` / `library_import`. Next: file import/export in the UI, a server-backed store for Autora, item thumbnails, per-copy colour overrides,
saving wall shapes, and a hierarchy view.

### Picking things that are buried

`See through` (X, under the view cube) makes every shape glassy and picks the innermost shape under the pointer;
Alt-click picks the next shape behind. The selected shape's outline ignores depth. I could not confirm how Tinkercad
handles this (a web search found nothing specific); the approach follows common CAD conventions (x-ray, pick-behind).
Not done: box (marquee) selection, which would also reach buried shapes but needs a gesture that doesn't clash with orbit.

### 3. Autora integration — the agent API (built)

The Autora repo isn't available in this environment, so nothing here assumes its interface; this is the generic surface.
`src/core` is the single place document edits live: `ops.ts` (pure `(doc, args) → { doc, result }`), `tools.ts` (JSON-Schema
specs + dispatcher), `agent.ts` (`execute`: results, touched shapes, hints, `ifRevision`, `batch`), `engine.ts` (the headless
model + history), `bridge.ts` (`window.craft3d` + postMessage in the live app). `scripts/agent/` has the MCP (stdio) and HTTP
servers. The app itself uses `ops` (`runOp`) for add / duplicate / delete / group / join / subtract / cut, so people and agents
share one set of rules. **Rules:** no React or DOM in `src/core`; a document change goes through `setDoc`/`runOp`, never straight
to state; every new capability gets a tool (see rule 11); keep `docs/agent-tools.md` generated (`npm run agent:docs`).
Details for the Autora side: `docs/agent-api.md`.

Still to do: a screen-less preview (render a PNG headless, so scheduled jobs can show their work); selection-aware tools;
a way to stream changes to a remote viewer; attaching the embedded app's autosave to a server instead of `localStorage`.

### 4. General UI/performance pass

Audit every control against the rules above; remove or fold duplicates; check touch behaviour on a phone-sized
viewport; profile large scenes (many repeated shapes will stress CSG bevel rebuilds, so cache per-shape geometry
and reuse it across identical copies).

## Working style for this repo

- Small, reviewable commits with descriptive messages. Don't rewrite unrelated code while adding a feature.
- Match the surrounding code's style and comment density.
- If a request would add visible UI, say how it satisfies "obvious" before building it.
