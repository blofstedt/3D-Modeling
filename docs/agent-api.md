# Driving Craft3D from an agent

Craft3D can be driven entirely by an AI agent: everything a person does with a finger or a mouse is also a **tool call**
(JSON in, JSON out). The full list, with arguments, is in [`agent-tools.md`](./agent-tools.md) (generated from the code).

There are four ways in. They all run the **same code** (`src/core`), so a model made one way opens in any other.

| You are… | Use | Needs a browser? |
| --- | --- | --- |
| A scheduled job, a hook, a server (Node) | the **library** (`Engine`) | no |
| An MCP client (Claude, an agent runtime) | the **MCP server** (stdio) | no |
| A webhook, a script, anything that speaks HTTP | the **HTTP API** | no |
| Sitting next to a person at the live app (an embedded panel, an assistant) | **`window.craft3d`** or **postMessage** | yes (it *is* the app) |

Build the Node pieces once: `npm run agent:build` (writes `dist-agent/`).

## The model of the world

- Millimetres. **x** right, **y** away from the front of the view, **z** up. A shape stands on its `bottom` z and rises to its `top`.
- A shape is a flat outline pushed up to a height (what the app calls sketch-and-extrude). Stock shapes, drawn outlines, rectangles
  and circles are all just outlines. A shape drawn on a **wall** grows out of the wall instead of up.
- `scene_get` lists shapes (id, name, size, centre, bottom/top, bounds, material, bevels, group, repeat). Ids are what every other call takes.
- Faces and edges are addressed by what `shape_faces` / `shape_edges` list: `"top"`, `"bottom"`, `{"kind":"wall","index":2}`; edges as `{"kind":"top","index":0}`.
  `shape_faces` says which way each wall faces ("right (+x)", "front (−y)"…), so you can pick "the wall on the right" without geometry.
- A **live repeat** (`repeat_set`) makes copies that follow their source: edit the source and every copy updates. Copies are read-only;
  edit the source, or `repeat_remove` to make them ordinary shapes.

## Every call answers the same way

```json
{ "ok": true,  "result": { "id": "body_3" }, "shapes": [ /* the shapes it touched, as they are now */ ], "changed": true, "revision": 7 }
{ "ok": false, "error": "No shape with id \"x\".", "hint": "Shapes: body_1 (Base), body_3 (Knob)", "changed": false, "revision": 7 }
```

- Errors say what was wrong and what to try. Nothing throws.
- `revision` goes up on every change, by anyone. Pass `ifRevision` to refuse a plan made on a stale view (a person may have edited meanwhile).
- `batch` runs several commands all-or-nothing and is one undo step.
- Sizes are held to what the shape allows (a bevel cannot be deeper than the shape): the result tells you the size you got.
- `shape_measure` builds the real solid and reports volume, area and whether it is **watertight** (will print).
- `export` gives STL or GLB (base64; GLB takes `scale` and `pivot` scene/asset/shape), OBJ or JSON. Headless, `path` writes the file for you (hand it to a slicer).

## Library (Node or browser)

```ts
import { Engine } from './dist-agent/craft3d-core.mjs';   // or import from src/core in this repo

const model = new Engine();                                 // or new Engine(parseDoc(savedJson))
const base = await model.execute('shape_add', { kind: 'box', width: 80, depth: 40, height: 30, name: 'Base' });
const id = base.shapes[0].id;
await model.execute('edge_bevel', { id, group: 'top', size: 4, style: 'round' });
await model.execute('shape_cut', { target: id, form: 'circle', center: { x: 0, y: 0 }, radius: 6 });   // a hole
await model.execute('repeat_set', { id, count: 4, direction: 0, gap: 100 });                          // a row of them
const stl = await model.execute('export', { format: 'stl' });                                         // stl.result.data is base64
model.subscribe((doc, revision) => save(doc));              // persist however you like
```

`Engine.tools` is the list of JSON-Schema tool specs to hand to an LLM. `model.undo()` / `redo()` work too.

## MCP server

```bash
CRAFT3D_DOC=/data/part.json npm run agent:mcp          # or: node dist-agent/mcp.mjs
```

Register it like any stdio MCP server, e.g. in `.mcp.json`:

```json
{ "mcpServers": { "craft3d": { "command": "node", "args": ["dist-agent/mcp.mjs"], "env": { "CRAFT3D_DOC": "/data/part.json" } } } }
```

The model is loaded from `CRAFT3D_DOC` and saved after every change (atomically), so separate runs (a scheduled task each night)
continue the same model. `CRAFT3D_START=starter` begins a new file with the starter block instead of an empty scene. Tools are
annotated read-only / destructive. Add `ifRevision` to any call to guard against stale plans.

## HTTP API

```bash
CRAFT3D_TOKEN=change-me CRAFT3D_DOC=/data/part.json PORT=3737 npm run agent:http
curl -H 'authorization: Bearer change-me' -d '{"tool":"shape_add","args":{"kind":"cylinder","height":50}}' localhost:3737/execute
curl -H 'authorization: Bearer change-me' localhost:3737/export.stl -o part.stl
```

`POST /execute { tool, args, ifRevision? }`, `GET /tools`, `GET /doc`, `GET /export.stl`, `GET /export.obj`.
It listens on `127.0.0.1` only; set `HOST` to expose it, which **requires** `CRAFT3D_TOKEN` (it refuses to start otherwise).
Put TLS in front of it if it leaves the machine.

## Driving the live app

Open the app and a person sees every change land. Each tool call is its own undo step (⌘Z takes back what the agent did).

```js
await window.craft3d.execute('shape_add', { kind: 'hexagon', height: 25 });
window.craft3d.subscribe((doc, revision) => { /* a person (or an agent) changed something */ });
window.craft3d.tools;      // the specs, including the screen-only ones below
```

Screen-only tools: `ui_select` (select shapes so the person sees what you mean), `ui_view` (turn the camera), `ui_xray`,
`ui_screenshot` (a PNG data URL of the 3D view: let a vision model check its work).

**Embedding in another page** (an iframe in Autora's UI): talk by `postMessage`.

```js
frame.contentWindow.postMessage({ craft3d: 'call', id: 1, tool: 'scene_get', args: {} }, 'https://craft3d.example');
window.addEventListener('message', (e) => { if (e.data.craft3d === 'result') console.log(e.data.id, e.data.response); });
```

The app answers only its own origin and the origins listed in the build-time variable `VITE_CRAFT3D_ALLOWED_ORIGINS`
(comma-separated; `*` accepts any embedder, which you should not do on a page that holds anything private). When embedded it also
posts `{ craft3d: 'ready', tools }` to those origins. The app autosaves to the browser's `localStorage`; an agent that needs the
model durable elsewhere should `subscribe` and store `getDoc()` itself.

## Working well as an agent

1. `scene_get` first, then act. Use ids from the responses; names are for people.
2. Prefer `batch` for multi-step edits: one undo step, all or nothing.
3. Ask before you cut: `shape_faces` / `shape_edges` / `shape_measure` are cheap ways to check what you are about to touch.
4. After a risky change, `shape_measure` (watertight?) or `ui_screenshot` (does it look right?).
5. Sizes in a request that the shape cannot hold are reduced, not rejected: read the result.
6. Things that are not supported yet fail loudly with the reason (for example beveling a shape drawn on a wall).
