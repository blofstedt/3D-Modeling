# Craft3D tools

_Generated from `src/core/tools.ts` by `npm run agent:docs`. Do not edit by hand._

Axes: **x** to the right, **y** away from the front, **z** up. Everything is in millimetres. Every call answers `{ ok, result, shapes, changed, revision }` or `{ ok: false, error, hint }`.

## `scene_get`

List every shape in the model with its id, name, size, position, material, bevels, group and repeat, plus groups and the overall bounding box. Start here. Axes: x to the right, y away from the front, z up; all in millimetres. A shape stands on its "bottom" z and rises to its "top".

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `includeCopies` | boolean | Also list the copies a live repeat makes (hidden by default; they follow their source). |

## `shape_get`

Everything about one shape: its summary, raw outline, faces and edges.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |

## `shape_faces`

The faces of a shape (top, bottom, each wall) with how to name them in commands, which way each wall faces, and its measurement.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |

## `shape_edges`

The bevel-able edges of a shape (top/bottom rims by index, vertical corners), with their length and any bevel.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |

## `shape_measure`

Build the real solid (bevels and all) and report its volume (mm³), surface area, triangle count and whether it is watertight (printable). Slower than the others.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |

## `shape_add`

Add a stock shape: box, roundedBox, cylinder, triangle, wedge, pentagon, hexagon, octagon or star. It is centred at x,y (default: beside the existing shapes), stands on elevation (default 0, the ground) and rises height mm. With onTopOf it sits on top of that shape.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `kind` | `box` \| `roundedBox` \| `cylinder` \| `triangle` \| `wedge` \| `pentagon` \| `hexagon` \| `octagon` \| `star` | required |
| `x` | number |  |
| `y` | number |  |
| `width` | number | Size along x, mm (default 60). |
| `depth` | number | Size along y, mm (default: same as width for round and regular shapes, else 60). |
| `height` | number | Default 40. |
| `elevation` | number | Height of its underside above the ground. |
| `onTopOf` | string | Id of a shape to sit on. |
| `name` | string |  |
| `color` | string | Hex colour such as "#3b82f6". |
| `material` | `matte` \| `metal` \| `glossy` \| `glass` \| `neon` |  |

## `shape_draw`

Sketch an outline (polygon with optional curved sides, rectangle or circle) on a surface and extrude it into a new shape (default 20 mm). On a wall the shape grows out of the wall.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `form` | `polygon` \| `rectangle` \| `circle` | required |
| `points` | list of { x: number, y: number } | polygon: the corners in order. |
| `bends` | list of { x: number, y: number } \| null | polygon: for each side (corner i to corner i+1, the last closes the shape) a point the side passes through, making it a curve; null keeps it straight. |
| `from` | { x: number, y: number } | rectangle: one corner. |
| `to` | { x: number, y: number } | rectangle: the opposite corner. |
| `center` | { x: number, y: number } | circle: its centre. |
| `radius` | number | circle: radius, mm. |
| `surface` | `ground` \| { topOf: string } \| { z: number } \| { wallOf: string, wall: integer, along: number, up: number } | Where to draw. "ground" (default); {"topOf": id} the top face of a shape; {"z": mm} a horizontal plane at a height; or {"wallOf": id, "wall": index, "along"?: mm, "up"?: mm} one of its walls (the sketch then lies in the wall: x runs to the right as you face it, y runs up, both from the middle of the wall; "along"/"up" shift that origin). |
| `height` | number | How far it extrudes, mm (default 20). On a wall: out from the wall. |
| `name` | string |  |
| `color` | string | Hex colour such as "#3b82f6". |
| `material` | `matte` \| `metal` \| `glossy` \| `glass` \| `neon` |  |

## `shape_cut`

Cut a hole or pocket into a shape: sketch an outline on its top face and cut it down by depth mm (or all the way through when depth is omitted). Upright shapes only.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `target` | string | required |
| `form` | `polygon` \| `rectangle` \| `circle` | required |
| `points` | list of { x: number, y: number } | polygon: the corners in order. |
| `bends` | list of { x: number, y: number } \| null | polygon: for each side (corner i to corner i+1, the last closes the shape) a point the side passes through, making it a curve; null keeps it straight. |
| `from` | { x: number, y: number } | rectangle: one corner. |
| `to` | { x: number, y: number } | rectangle: the opposite corner. |
| `center` | { x: number, y: number } | circle: its centre. |
| `radius` | number | circle: radius, mm. |
| `surface` | `ground` \| { topOf: string } \| { z: number } \| { wallOf: string, wall: integer, along: number, up: number } | Where to draw. "ground" (default); {"topOf": id} the top face of a shape; {"z": mm} a horizontal plane at a height; or {"wallOf": id, "wall": index, "along"?: mm, "up"?: mm} one of its walls (the sketch then lies in the wall: x runs to the right as you face it, y runs up, both from the middle of the wall; "along"/"up" shift that origin). |
| `depth` | number |  |

## `shape_set`

Change a shape: name, colour, material, visibility, height, elevation (its underside), one radius for all vertical corners, or replace its outline with new corner points (this clears its holes and bevels).

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |
| `name` | string |  |
| `color` | string | Hex colour such as "#3b82f6". |
| `material` | `matte` \| `metal` \| `glossy` \| `glass` \| `neon` |  |
| `visible` | boolean |  |
| `height` | number |  |
| `elevation` | number |  |
| `cornerRadius` | number |  |
| `outline` | { points: list of { x: number, y: number }, cornerRadii: list of number } |  |

## `shape_move`

Move shapes (and their group-mates; a live repeat's path goes with its shape). Either by an offset, or to a place: footprint centre x,y and underside z.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |
| `by` | { x: number, y: number, z: number } |  |
| `to` | { x: number, y: number, z: number } |  |

## `shape_turn`

Turn shapes about the vertical axis. Positive degrees turn counter-clockwise seen from above. Default pivot: the centre of the shapes.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |
| `degrees` | number | required |
| `about` | { x: number, y: number } | A point on the ground plane, mm. |

## `shape_resize`

Set a shape's overall width (x), depth (y) and/or height (z). Corners and bevels stay valid.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |
| `width` | number |  |
| `depth` | number |  |
| `height` | number |  |

## `face_set`

Type a number for a face, as a person would: set the height (top/bottom) or the size across a wall. The shape grows or shrinks to match.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |
| `face` | `top` \| `bottom` \| { kind: `wall`, index: integer } | required · A face: "top", "bottom", or {"kind":"wall","index":n}. shape_faces lists them with their indices. |
| `value` | number | required |

## `face_push`

Push or pull a face by a distance (positive pulls it outward, negative pushes it in).

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |
| `face` | `top` \| `bottom` \| { kind: `wall`, index: integer } | required · A face: "top", "bottom", or {"kind":"wall","index":n}. shape_faces lists them with their indices. |
| `by` | number | required |

## `edge_bevel`

Bevel edges: curved ("round") or flat ("chamfer"). Choose edges by list, by group (top, bottom, corner = vertical corners, all) or every edge around a face. size 0 removes the bevel; for vertical corners size is the corner radius. Sizes are held to what the shape allows; the result reports the size you got.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |
| `edges` | list of { kind: `top` \| `bottom` \| `corner`, index: integer } |  |
| `group` | `top` \| `bottom` \| `corner` \| `all` |  |
| `aroundFace` | `top` \| `bottom` \| { kind: `wall`, index: integer } | A face: "top", "bottom", or {"kind":"wall","index":n}. shape_faces lists them with their indices. |
| `size` | number | required |
| `style` | `round` \| `chamfer` |  |

## `shape_delete`

Delete shapes (and their group-mates, and the copies of their live repeats).

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |

## `shape_duplicate`

Duplicate shapes, offset by (35, −35) mm unless by is given.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |
| `by` | { x: number, y: number } |  |

## `group_create`

Group shapes so they select, move and turn together, and give the group a name (it becomes the object name in GLB export). Groups nest: a group that is wholly inside the ids is put inside the new one, so group "head" + "body" makes one "character".

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |
| `name` | string |  |

## `group_rename`

Rename a group (e.g. "head"). Find group ids with scene_get.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `group` | string | required |
| `name` | string | required |

## `library_list`

The project library: reusable objects with their size and how many linked copies are placed.

_read-only · headless and live_

## `library_save`

Save a group (or one ungrouped shape) to the project library under its name. It stays in the scene as the first linked copy. If the group was opened with object_unlink it updates its library object instead, and every linked copy follows.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `group` | string |  |
| `id` | string | A single ungrouped shape, when there is no group. |
| `name` | string |  |

## `library_place`

Place a linked copy of a library object (default: beside the scene; or on top of a shape). A linked copy moves, turns and deletes as one piece and follows its library object; to change the object use object_unlink then library_save.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `item` | string | required |
| `x` | number |  |
| `y` | number |  |
| `z` | number |  |
| `angle` | number | Degrees, counter-clockwise from above. |
| `onTopOf` | string |  |
| `name` | string |  |

## `object_unlink`

Open a linked copy for editing: its shapes become ordinary, you edit them, then library_save the group to update the library object (all copies follow). With forget:true it becomes separate shapes for good.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `group` | string | required |
| `forget` | boolean |  |

## `library_thumbnail`

A small picture of a library object (or of a shape group in the scene via `shapes`) as SVG text: isometric, coloured, no GL needed.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `item` | string |  |
| `shapes` | list of string |  |
| `size` | number | Pixels, default 96. |

## `library_share`

Keep a library object in the app-wide library too, so every project can place it (shared:false stops that; placed copies stay). Only the live app has an app-wide library; elsewhere use library_export / library_import to carry objects between projects.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `item` | string | required |
| `shared` | boolean | Default true. |

## `library_export`

The library objects as JSON (all, or the ones in `items`), to keep or to hand to library_import in another project.

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `items` | list of string |  |

## `library_import`

Add library objects from library_export. An object already here is replaced only by a newer one (its linked copies follow).

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `items` | list of object | required |

## `library_rename`

Rename a library object.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `item` | string | required |
| `name` | string | required |

## `library_remove`

Remove a library object. Its placed copies stay as ordinary shapes.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `item` | string | required |

## `group_remove`

Dissolve one group (its shapes and inner groups stay, moving up into the group around it).

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `group` | string | required |

## `shapes_join`

Join shapes into one solid: outlines are united wherever they overlap or touch, each keeping its own height and elevation. Bevels on the inputs are not kept.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required · Shape ids. |

## `shapes_subtract`

Cut the cutters out of the "from" shapes where they overlap in height (the cutters are used up). A short cutter leaves a slab above and below.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `from` | list of string | required · Shape ids. |
| `cutters` | list of string | required · Shape ids. |

## `repeat_set`

Make (or change) a live repeat: copies of a shape equally spaced along a straight or curved path, or around a circle. The copies follow the shape: edit the source and all of them update. count includes the original. Path: give "end", or "direction" (degrees) and "gap"; "bend" curves it. Around: "center" of the circle. Call again with the same id to change the repeat.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required · The shape to repeat. |
| `kind` | `path` \| `around` |  |
| `count` | integer |  |
| `gap` | number | Distance between neighbours along the path, mm. |
| `end` | { x: number, y: number } | A point on the ground plane, mm. |
| `direction` | number |  |
| `bend` | { x: number, y: number } \| null |  |
| `center` | { x: number, y: number } | A point on the ground plane, mm. |
| `follow` | boolean | Turn each copy to face along the path. |

## `repeat_remove`

Let go of a live repeat: its copies stay as ordinary shapes you can edit one by one.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `id` | string | required |

## `doc_get`

The whole document as JSON (shapes, groups, repeats): save it, or hand it back to doc_set later.

_read-only · headless and live_

## `doc_set`

Replace the whole model with a document from doc_get.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `doc` | object | required |

## `doc_clear`

Remove every shape.

_changes the model · headless and live_

## `history_undo`

Undo the last change.

_changes the model · headless and live_

## `history_redo`

Redo the last undone change.

_changes the model · headless and live_

## `export`

Export the visible shapes. format "stl" (binary, Z-up, returned as base64), "glb" (binary glTF for game engines: metres, Y-up, keeps colours and materials, returned as base64), "obj" (text) or "json" (the document). glb options: scale (output metres per scene mm, default 0.001) and pivot ("scene" as placed, "asset" centred on the ground, "shape" one pivot per shape at the centre of its base).

_read-only · headless and live_

| argument | type | |
| --- | --- | --- |
| `format` | `stl` \| `glb` \| `obj` \| `json` | required |
| `scale` | number |  |
| `pivot` | `scene` \| `asset` \| `shape` |  |

## `batch`

Run several commands in order. By default all-or-nothing: if one fails nothing is changed and you are told which. Later commands can use ids returned earlier only by calling again, so give shapes explicit names and look them up with scene_get, or use ids from the response.

_changes the model · headless and live_

| argument | type | |
| --- | --- | --- |
| `commands` | list of { tool: string, args: object } | required |
| `atomic` | boolean |  |

## `ui_select`

Select shapes in the live app, so the person sees what you mean.

_changes the model · live app only_

| argument | type | |
| --- | --- | --- |
| `ids` | list of string | required |

## `ui_view`

Turn the live app's camera: iso, top, bottom, front, back, left or right; "fit" frames everything.

_changes the model · live app only_

| argument | type | |
| --- | --- | --- |
| `view` | `iso` \| `top` \| `bottom` \| `front` \| `back` \| `left` \| `right` \| `fit` | required |

## `ui_xray`

Turn See through mode on or off in the live app.

_changes the model · live app only_

| argument | type | |
| --- | --- | --- |
| `on` | boolean | required |

## `ui_screenshot`

A PNG of the live app's 3D view, as a data URL.

_read-only · live app only_
