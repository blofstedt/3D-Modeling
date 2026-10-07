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
The tool owns its own pointer handlers while open; the viewer's handlers bail out (`live.current.draw`).

Still to do:
- **Drawing on a wall** needs a per-shape orientation (a plane transform on `Body3D`) — plan that with a geometry
  check before building the UI. Bottom faces and undersides are refused for now.
- Drawing *inside* a face to make a cutout (reusing hole support), instead of a separate shape on top.
- Curved sides are flattened into many small sides, so bevelling them is per-segment; smooth runs (like corner
  rounding's `arcMid`) would let a whole curve be one edge.
- Freehand (hold to draw, then simplify), and snapping to edges / midpoints with the snap shown.
- Sketch dimensions you can type while drawing (the number beside the pointer is read-only today).
- Insert a corner by tapping a side; delete a single corner.
- Check on a real touch screen: corner/side hit reach is 24 px for touch, untested.

### 3. Autora integration

The Autora repo isn't available in this environment, so no assumptions about its interface are baked in.
Direction: expose the document model (`Body3D[]` + groups, JSON export already exists) and the pure `utils/`
operations through a small headless API, so Autora can create/modify shapes, run repeats and export STL/OBJ
without the UI. Decide the actual contract once Autora's side is known.

### 4. General UI/performance pass

Audit every control against the rules above; remove or fold duplicates; check touch behaviour on a phone-sized
viewport; profile large scenes (many repeated shapes will stress CSG bevel rebuilds, so cache per-shape geometry
and reuse it across identical copies).

## Working style for this repo

- Small, reviewable commits with descriptive messages. Don't rewrite unrelated code while adding a feature.
- Match the surrounding code's style and comment density.
- If a request would add visible UI, say how it satisfies "obvious" before building it.
