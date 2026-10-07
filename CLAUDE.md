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

### 1. Repeat along a path — make it direct and truly equally spaced

Today (`RepeatPatternModal`, `calculateLinearPattern/CurvedPattern`, `App.handleApplyPattern`) it is a modal
dialog; the path is a 2-point line or one quadratic curve drawn on the ground only; there is no live preview;
copies are loose shapes that can't be edited afterwards; and curved spacing samples equal *Bezier parameter*
steps, so copies are **not** equally spaced along a curve. Target behaviour:

- Select a shape → **Repeat** → ghost copies appear immediately beside it with two handles: drag the end to
  set the line, drag the middle to bend it, drag the count dot (or tap its number) to change how many. No dialog.
- Spacing is by **arc length**, and the user picks the meaning on the object: *N copies fit between the ends* or
  *a fixed gap* (drag to resize the gap, copies fill the path). Optional: turn copies to follow the path.
- The path can be any rail, not just a custom line: tap an existing edge, a drawn path or a shape outline
  and the copies follow it. Circular repeat (around a point) is a first-class path, not an extra feature.
- The repeat stays **live**: store `{source, path, count/gap, follow}` so changing the source, path or
  count updates every copy; a tap on "Make independent" bakes them to plain shapes.
- Works in 3D (path may rise/fall), not only on the ground plane.

### 2. Draw tool — Tinkercad's, but with paths that behave

Draw a 2D outline on the ground **or on a face**, then extrude it with the existing face-extrude gesture.

- No plane-picker step: the first tap decides the plane (ground or the face under the finger); the grid
  and hint show it. A face's outline is shown as the working area.
- Corners are plain points: tap to add, drag a point to move it, tap the first point to close. To curve a
  side, **drag the side itself** (it bends into an arc) instead of Bezier handles; corner rounding already
  exists on shapes. Snap to the grid, axes, and other shapes' corners/edges, with the snap shown.
- Quick forms for the common cases: drag out a rectangle or circle; hold to draw freehand and simplify.
- A closed outline becomes a normal shape (immediately extrudable, bevelable, repeatable). Drawing inside
  an existing shape's face makes a cutout, reusing the existing hole support.
- Model note: ground/top/bottom faces fit today's model (outline + extrude along Z). **Drawing on a wall**
  needs a per-shape orientation (a plane transform on `Body3D`) — plan that change deliberately, with a
  geometry check, before building the UI.

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
