/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D, DrawSession, EdgeSel, FaceSel, Frame, MaterialType, Point2D, RepeatLink, RepeatSession, ShapeGroup, SWATCHES } from '../types';
import { BodyTransform, resizeBody, selectionBounds, transformBody } from '../utils/transform';
import { cutShape, getPolygonSignedArea } from '../utils/geometry';
import { joinBodies } from '../utils/join';
import { SHAPE_LABELS, ShapeKind, primitiveOutline } from '../utils/primitives';
import { getBase, outwardNormal, wallEnds, withOutline } from '../utils/outline';
import { MAX_HEIGHT, MIN_HEIGHT, extrudeFace, faceMeasure, setFaceMeasure } from '../utils/faces';
import { EdgeGroup, applyEdgeChange, edgesAroundFace, edgesOfKind, edgeSize, maxBevelSize } from '../utils/edges';
import { DRAWN_HEIGHT, DrawnOutline, circleOutline, drawnBody, rectangleOutline, shapeOutline } from '../utils/draw';
import { wallFrame } from '../utils/frame';
import { bendThrough, defaultSession, spacing, toAround, transformLink, withCount, withSpacing } from '../utils/repeat';
import { Doc, IdGen, settle } from './doc';
import { fail } from './errors';

const round2 = (n: number) => Math.round(n * 100) / 100;
const MATERIALS: MaterialType[] = ['matte', 'metal', 'glossy', 'glass', 'neon'];
/** The tallest a shape may be through the agent API (the sliders in the app stop at 600). */
export const API_MAX_HEIGHT = 5000;

export interface OpResult<T = unknown> {
  doc: Doc;
  result: T;
}

// ---- Lookups ------------------------------------------------------------------------------------

export function need(doc: Doc, id: unknown): Body3D {
  if (typeof id !== 'string') return fail('A shape id (a string) is required.', 'Call scene_get to list the ids.');
  const b = doc.bodies.find((x) => x.id === id);
  if (!b) {
    const near = doc.bodies.filter((x) => !x.repeatOf).slice(0, 12).map((x) => `${x.id} (${x.name})`);
    return fail(`No shape with id "${id}".`, near.length ? `Shapes: ${near.join(', ')}` : 'The scene is empty.');
  }
  return b;
}

/** A repeat's copies are derived: asking to edit one means editing the shape it follows. */
export function editable(doc: Doc, id: unknown): Body3D {
  const b = need(doc, id);
  if (b.repeatOf) return fail(`"${b.id}" is a copy made by a live repeat, so it cannot be edited directly.`, `Edit its source "${b.repeatOf}" (every copy follows), or call repeat_remove first to make the copies separate shapes.`);
  return b;
}

function idList(doc: Doc, ids: unknown, what = 'ids'): Body3D[] {
  if (!Array.isArray(ids) || !ids.length) return fail(`${what} must be a non-empty list of shape ids.`);
  return [...new Set(ids as string[])].map((id) => editable(doc, id));
}

/** The shapes plus everything grouped with them: a group moves, turns and is deleted together. */
function withGroupMates(doc: Doc, bodies: Body3D[]): Body3D[] {
  const groups = new Set(bodies.map((b) => b.groupId).filter(Boolean));
  if (!groups.size) return bodies;
  const all = new Map(bodies.map((b) => [b.id, b]));
  doc.bodies.forEach((b) => {
    if (b.groupId && groups.has(b.groupId) && !b.repeatOf) all.set(b.id, b);
  });
  return [...all.values()];
}

const num = (v: unknown, name: string, fallback?: number): number => {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    return fail(`${name} is required.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return fail(`${name} must be a number, got ${JSON.stringify(v)}.`);
  return n;
};

const point = (v: unknown, name: string): Point2D => {
  const p = v as Partial<Point2D> | undefined;
  if (!p || typeof p !== 'object') return fail(`${name} must be a point like {"x": 0, "y": 0}.`);
  return { x: num(p.x, `${name}.x`), y: num(p.y, `${name}.y`) };
};

const replace = (doc: Doc, id: string, patch: Partial<Body3D>): Doc => ({ ...doc, bodies: doc.bodies.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

const colorOf = (v: unknown, fallback: string): string => {
  if (v === undefined) return fallback;
  if (typeof v !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return fail(`color must be a hex string like "#3b82f6", got ${JSON.stringify(v)}.`);
  return v;
};

const materialOf = (v: unknown, fallback: MaterialType): MaterialType => {
  if (v === undefined) return fallback;
  if (!MATERIALS.includes(v as MaterialType)) return fail(`material must be one of ${MATERIALS.join(', ')}.`);
  return v as MaterialType;
};

const heightOf = (v: unknown, fallback: number): number => {
  const h = num(v, 'height', fallback);
  if (h < MIN_HEIGHT || h > API_MAX_HEIGHT) return fail(`height must be between ${MIN_HEIGHT} and ${API_MAX_HEIGHT} mm.`);
  return round2(h);
};

// ---- Adding shapes -------------------------------------------------------------------------------

export interface AddShapeArgs {
  kind: ShapeKind;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
  height?: number;
  elevation?: number;
  onTopOf?: string;
  name?: string;
  color?: string;
  material?: MaterialType;
}

const BASE_SIZE = 60; // the footprint stock shapes are drawn at (see primitives.ts)

export function addShape(doc: Doc, ids: IdGen, a: AddShapeArgs): OpResult<{ id: string }> {
  if (!(a.kind in SHAPE_LABELS)) return fail(`kind must be one of ${Object.keys(SHAPE_LABELS).join(', ')}.`);
  const count = doc.bodies.filter((b) => !b.repeatOf).length + 1;
  const host = a.onTopOf ? need(doc, a.onTopOf) : null;
  if (host?.frame) return fail('Shapes cannot be placed on top of a shape that is on a wall yet.');
  let cx = 0;
  let cy = 0;
  let elevation = a.elevation !== undefined ? num(a.elevation, 'elevation') : 0;
  if (host) {
    const b = selectionBounds([host])!;
    cx = b.centerX;
    cy = b.centerY;
    elevation = round2((host.elevation ?? 0) + host.extrusionHeight);
  } else if (a.x === undefined && a.y === undefined) {
    const b = selectionBounds(doc.bodies.filter((x) => x.visible && !x.frame));
    if (b) {
      cx = Math.round(b.maxX + 50);
      cy = Math.round(b.centerY);
    }
  }
  if (a.x !== undefined) cx = num(a.x, 'x');
  if (a.y !== undefined) cy = num(a.y, 'y');
  if (elevation < 0) return fail('elevation cannot be below the ground (0).');

  const width = a.width !== undefined ? num(a.width, 'width') : BASE_SIZE;
  const depth = a.depth !== undefined ? num(a.depth, 'depth') : a.width !== undefined && ['cylinder', 'box', 'roundedBox', 'octagon', 'hexagon', 'pentagon', 'star'].includes(a.kind) && a.depth === undefined ? width : BASE_SIZE;
  if (width < 1 || depth < 1) return fail('width and depth must be at least 1 mm.');
  const outline = primitiveOutline(a.kind, 0, 0);
  const sx = width / BASE_SIZE;
  const sy = depth / BASE_SIZE;
  const scale = (p: Point2D): Point2D => ({ x: round2(cx + p.x * sx), y: round2(cy + p.y * sy) });
  const basePoints = outline.basePoints.map(scale);
  const id = ids('body');
  const body: Body3D = {
    id,
    name: a.name ?? `${SHAPE_LABELS[a.kind]} ${count}`,
    points: basePoints,
    basePoints,
    extrusionHeight: heightOf(a.height, 40),
    elevation: round2(elevation),
    color: colorOf(a.color, SWATCHES[(count - 1) % SWATCHES.length].value),
    materialType: materialOf(a.material, 'matte'),
    visible: true,
    createdAt: new Date().toISOString(),
  };
  if (outline.cornerRadii) {
    // A cylinder is a square rounded all the way, whatever its size; a rounded box keeps its rounding in proportion.
    const r = a.kind === 'cylinder' ? Math.max(width, depth) / 2 : (outline.cornerRadii[0] ?? 0) * Math.min(sx, sy);
    body.points = withOutline(body, { basePoints, cornerRadii: basePoints.map(() => round2(r)) }).points;
    body.cornerRadii = basePoints.map(() => round2(r));
  }
  return { doc: { ...doc, bodies: [...doc.bodies, body] }, result: { id } };
}

// ---- Drawing ------------------------------------------------------------------------------------

export type SurfaceSpec =
  | 'ground'
  | { topOf: string }
  | { z: number }
  | { wallOf: string; wall: number; along?: number; up?: number };

export interface DrawArgs {
  form: 'polygon' | 'rectangle' | 'circle';
  surface?: SurfaceSpec;
  /** polygon: corners in order. */
  points?: Point2D[];
  /** polygon: for each side (corner i to the next), a point it passes through to make it a curve, or null. */
  bends?: (Point2D | null)[];
  /** rectangle: two opposite corners. */
  from?: Point2D;
  to?: Point2D;
  /** circle: centre and radius. */
  center?: Point2D;
  radius?: number;
  height?: number;
  name?: string;
  color?: string;
  material?: MaterialType;
}

/** Where a sketch lies: the ground, a height, the top of a shape, or one of a shape's walls. */
export function resolveSurface(doc: Doc, spec: SurfaceSpec | undefined): { elevation: number; frame?: Frame; label: string } {
  if (spec === undefined || spec === 'ground') return { elevation: 0, label: 'the ground' };
  if (typeof spec !== 'object') return fail(`surface must be "ground", {"topOf": id}, {"z": height} or {"wallOf": id, "wall": index}.`);
  if ('z' in spec) return { elevation: round2(num(spec.z, 'surface.z')), label: `height ${spec.z}` };
  if ('topOf' in spec) {
    const host = need(doc, spec.topOf);
    if (host.frame) return fail('Drawing on a shape that is itself on a wall is not supported yet.');
    return { elevation: round2((host.elevation ?? 0) + host.extrusionHeight), label: `the top of "${host.name}"` };
  }
  if ('wallOf' in spec) {
    const host = need(doc, spec.wallOf);
    if (host.frame) return fail('Drawing on a shape that is itself on a wall is not supported yet.');
    const index = num(spec.wall, 'surface.wall');
    const ends = wallEnds(host, index);
    if (!ends) return fail(`"${host.id}" has no wall ${index}.`, 'Call shape_faces to list its walls.');
    const n = outwardNormal(ends.a, ends.b, ends.winding);
    const along = num(spec.along, 'surface.along', 0);
    const up = num(spec.up, 'surface.up', 0);
    // Sketch coordinates start at the middle of the wall at half its height: x runs to the right as you face it, y up.
    const t = { x: -n.y, y: n.x };
    const mid = { x: (ends.a.x + ends.b.x) / 2 + t.x * along, y: (ends.a.y + ends.b.y) / 2 + t.y * along };
    const frame = { ...wallFrame(mid, n), h: round2((host.elevation ?? 0) + host.extrusionHeight / 2 + up) };
    return { elevation: 0, frame, label: `wall ${index} of "${host.name}"` };
  }
  return fail('surface not understood.');
}

function sketchOutline(a: DrawArgs): DrawnOutline {
  if (a.form === 'rectangle') {
    const o = rectangleOutline(point(a.from, 'from'), point(a.to, 'to'));
    return o ?? fail('That rectangle is too small (each side must be at least 2 mm).');
  }
  if (a.form === 'circle') {
    const c = point(a.center, 'center');
    const r = num(a.radius, 'radius');
    const o = circleOutline(c, { x: c.x + r, y: c.y });
    return o ?? fail('That circle is too small.');
  }
  if (a.form !== 'polygon') return fail('form must be "polygon", "rectangle" or "circle".');
  if (!Array.isArray(a.points) || a.points.length < 3) return fail('A polygon needs at least 3 points.');
  const points = a.points.map((p, i) => point(p, `points[${i}]`));
  const bends = (a.bends ?? []).map((b, i) => (b ? point(b, `bends[${i}]`) : null));
  const o = shapeOutline({ points, bends });
  return o ?? fail('Those points do not enclose an area (they are in a line, or too small).');
}

export function drawShape(doc: Doc, ids: IdGen, a: DrawArgs): OpResult<{ id: string; surface: string }> {
  const surface = resolveSurface(doc, a.surface);
  const outline = sketchOutline(a);
  const count = doc.bodies.filter((b) => !b.repeatOf).length + 1;
  const id = ids('body');
  const body = drawnBody(outline, surface.elevation, id, a.name ?? `${outline.name} ${count}`, colorOf(a.color, SWATCHES[(count - 1) % SWATCHES.length].value), surface.frame);
  body.extrusionHeight = heightOf(a.height, DRAWN_HEIGHT);
  body.materialType = materialOf(a.material, 'matte');
  return { doc: { ...doc, bodies: [...doc.bodies, body] }, result: { id, surface: surface.label } };
}

/** Where a drawn session would start, for the app: kept here so the app and agents share one rule. */
export function drawSessionFor(doc: Doc, spec: SurfaceSpec | undefined): DrawSession {
  const s = resolveSurface(doc, spec);
  return { form: 'shape', planeY: s.frame ? 0 : s.elevation, points: [], bends: [], ...(s.frame ? { frame: s.frame } : {}) };
}

// ---- Editing ------------------------------------------------------------------------------------

export interface SetArgs {
  id: string;
  name?: string;
  color?: string;
  material?: MaterialType;
  visible?: boolean;
  height?: number;
  elevation?: number;
  /** One radius for every vertical corner. */
  cornerRadius?: number;
  /** Replace the outline: the sharp corner points, and optionally a radius for each. */
  outline?: { points: Point2D[]; cornerRadii?: number[] };
}

export function setShape(doc: Doc, a: SetArgs): OpResult<{ id: string }> {
  const b = editable(doc, a.id);
  let patch: Partial<Body3D> = {};
  if (a.name !== undefined) patch.name = String(a.name);
  if (a.color !== undefined) patch.color = colorOf(a.color, b.color);
  if (a.material !== undefined) patch.materialType = materialOf(a.material, b.materialType);
  if (a.visible !== undefined) patch.visible = !!a.visible;
  if (a.height !== undefined) patch.extrusionHeight = heightOf(a.height, b.extrusionHeight);
  if (a.elevation !== undefined) {
    if (b.frame) return fail('A shape on a wall has no elevation: move it with shape_move.');
    const e = num(a.elevation, 'elevation');
    if (e < 0) return fail('elevation cannot be below the ground (0).');
    patch.elevation = round2(e);
  }
  if (a.outline) {
    const pts = (a.outline.points ?? []).map((p, i) => point(p, `outline.points[${i}]`));
    if (pts.length < 3) return fail('outline.points needs at least 3 points.');
    if (Math.abs(getPolygonSignedArea(pts)) < 4) return fail('outline.points enclose no area.');
    patch = { ...patch, ...withOutline(b, { basePoints: pts, cornerRadii: a.outline.cornerRadii ?? pts.map(() => 0) }), holes: undefined, holeBases: undefined, holeRadii: undefined, edgeBevels: undefined, cornerBevels: undefined };
  }
  if (a.cornerRadius !== undefined) {
    const r = num(a.cornerRadius, 'cornerRadius');
    if (r < 0) return fail('cornerRadius cannot be negative.');
    const base = (patch.basePoints ?? getBase(b)) as Point2D[];
    patch = { ...patch, ...withOutline({ points: patch.points ?? b.points, basePoints: base, cornerRadii: patch.cornerRadii ?? b.cornerRadii }, { cornerRadii: base.map(() => r) }) };
  }
  return { doc: replace(doc, b.id, patch), result: { id: b.id } };
}

export interface MoveArgs {
  ids: string[];
  /** Move by this much. */
  by?: { x?: number; y?: number; z?: number };
  /** Or place the group's footprint centre at x, y and its underside at z (give any of them). */
  to?: { x?: number; y?: number; z?: number };
}

export interface TurnArgs {
  ids: string[];
  degrees: number;
  /** The point to turn about; the centre of the shapes by default. */
  about?: Point2D;
}

/** Rigid move/turn of shapes and the live repeats they carry: the same rule the app uses. */
export function applyTransform(doc: Doc, ids: string[], t: BodyTransform): Doc {
  const set = new Set(ids);
  return {
    ...doc,
    bodies: doc.bodies.map((b) => (set.has(b.id) && !b.repeatOf ? { ...b, ...transformBody(b, t) } : b)),
    repeats: doc.repeats.map((l) => (set.has(l.bodyId) ? transformLink(l, t) : l)),
  };
}

export function moveShapes(doc: Doc, a: MoveArgs): OpResult<{ moved: string[] }> {
  const bodies = withGroupMates(doc, idList(doc, a.ids));
  if (!a.by && !a.to) return fail('Give "by" ({"x","y","z"} to move by) or "to" (where to put them).');
  let d = { x: 0, y: 0, z: 0 };
  if (a.by) d = { x: num(a.by.x, 'by.x', 0), y: num(a.by.y, 'by.y', 0), z: num(a.by.z, 'by.z', 0) };
  else if (a.to) {
    if (bodies.some((b) => b.frame)) return fail('"to" does not work for shapes on a wall; use "by".');
    const b = selectionBounds(bodies)!;
    d = {
      x: a.to.x !== undefined ? num(a.to.x, 'to.x') - b.centerX : 0,
      y: a.to.y !== undefined ? num(a.to.y, 'to.y') - b.centerY : 0,
      z: a.to.z !== undefined ? num(a.to.z, 'to.z') - b.minElevation : 0,
    };
  }
  const minLift = Math.min(...bodies.filter((b) => !b.frame).map((b) => b.elevation ?? 0), Infinity);
  if (Number.isFinite(minLift) && minLift + d.z < -1e-6) return fail('That would put the shape below the ground (z < 0).', `Lowest allowed z move here is ${round2(-minLift)}.`);
  const t: BodyTransform = { dx: round2(d.x), dy: round2(d.y), dz: round2(d.z), angle: 0, cx: 0, cy: 0 };
  return { doc: applyTransform(doc, bodies.map((b) => b.id), t), result: { moved: bodies.map((b) => b.id) } };
}

export function turnShapes(doc: Doc, a: TurnArgs): OpResult<{ turned: string[] }> {
  const bodies = withGroupMates(doc, idList(doc, a.ids));
  const angle = (num(a.degrees, 'degrees') * Math.PI) / 180;
  const upright = bodies.filter((b) => !b.frame);
  const b = upright.length ? selectionBounds(upright)! : null;
  const pivot = a.about ? point(a.about, 'about') : b ? { x: b.centerX, y: b.centerY } : { x: bodies[0].frame!.x, y: bodies[0].frame!.y };
  const t: BodyTransform = { dx: 0, dy: 0, dz: 0, angle, cx: pivot.x, cy: pivot.y };
  return { doc: applyTransform(doc, bodies.map((x) => x.id), t), result: { turned: bodies.map((x) => x.id) } };
}

export function resizeShape(doc: Doc, a: { id: string; width?: number; depth?: number; height?: number }): OpResult<{ id: string }> {
  const b = editable(doc, a.id);
  const bb = selectionBounds([b])!;
  let next = doc;
  if (a.width !== undefined || a.depth !== undefined) {
    const w = a.width !== undefined ? num(a.width, 'width') : bb.maxX - bb.minX;
    const d = a.depth !== undefined ? num(a.depth, 'depth') : bb.maxY - bb.minY;
    if (w < 1 || d < 1) return fail('width and depth must be at least 1 mm.');
    next = replace(next, b.id, resizeBody(b, w, d));
  }
  if (a.height !== undefined) next = replace(next, b.id, { extrusionHeight: heightOf(a.height, b.extrusionHeight) });
  return { doc: next, result: { id: b.id } };
}

// ---- Faces and edges -----------------------------------------------------------------------------

export type FaceSpec = 'top' | 'bottom' | { kind: 'top' | 'bottom' | 'wall'; index?: number } | string;

export function parseFace(id: string, spec: FaceSpec): FaceSel {
  if (spec === 'top' || spec === 'bottom') return { bodyId: id, kind: spec };
  if (typeof spec === 'string') {
    const m = spec.match(/^wall[:\s#-]*(\d+)$/i);
    if (m) return { bodyId: id, kind: 'wall', index: Number(m[1]) };
    return fail(`face "${spec}" not understood.`, 'Use "top", "bottom", or {"kind":"wall","index":n}. shape_faces lists them.');
  }
  if (spec && typeof spec === 'object' && (spec.kind === 'top' || spec.kind === 'bottom')) return { bodyId: id, kind: spec.kind };
  if (spec && typeof spec === 'object' && spec.kind === 'wall' && spec.index !== undefined) return { bodyId: id, kind: 'wall', index: num(spec.index, 'face.index') };
  return fail('face must be "top", "bottom", or {"kind":"wall","index":n}.');
}

export function setFace(doc: Doc, a: { id: string; face: FaceSpec; value: number }): OpResult<{ id: string; measure: { label: string; value: number } | null }> {
  const b = editable(doc, a.id);
  const face = parseFace(b.id, a.face);
  if (face.kind === 'wall' && (face.index === undefined || !wallEnds(b, face.index))) return fail(`"${b.id}" has no wall ${face.index}.`, 'shape_faces lists its walls.');
  const value = num(a.value, 'value');
  if (value <= 0) return fail('value must be positive.');
  const patch = setFaceMeasure(b, face, value);
  if (!patch) return fail('That face has no number to set.');
  const next = replace(doc, b.id, patch);
  return { doc: next, result: { id: b.id, measure: faceMeasure(next.bodies.find((x) => x.id === b.id)!, face) } };
}

export function pushFace(doc: Doc, a: { id: string; face: FaceSpec; by: number }): OpResult<{ id: string }> {
  const b = editable(doc, a.id);
  const face = parseFace(b.id, a.face);
  if (face.kind === 'wall' && (face.index === undefined || !wallEnds(b, face.index))) return fail(`"${b.id}" has no wall ${face.index}.`, 'shape_faces lists its walls.');
  const patch = extrudeFace(b, face, num(a.by, 'by'));
  if (!patch) return fail('That face cannot be pushed or pulled.');
  return { doc: replace(doc, b.id, patch), result: { id: b.id } };
}

export interface BevelArgs {
  id: string;
  /** Specific edges, as listed by shape_edges. */
  edges?: { kind: 'top' | 'bottom' | 'corner'; index: number }[];
  /** Or a whole set: every top edge, every bottom edge, every vertical corner, or all of them. */
  group?: EdgeGroup;
  /** Or every edge around a face. */
  aroundFace?: FaceSpec;
  /** mm. 0 removes the bevel. For a vertical corner this is its radius. */
  size: number;
  /** "round" for a curved edge, "chamfer" for a flat bevel. */
  style?: 'round' | 'chamfer';
}

export function bevelEdges(doc: Doc, a: BevelArgs): OpResult<{ id: string; size: number; style: string | null; edges: number }> {
  const b = editable(doc, a.id);
  if (b.frame) return fail('Bevels on shapes drawn on a wall are not supported yet.');
  let sels: EdgeSel[] = [];
  if (a.edges) sels = a.edges.map((e) => ({ bodyId: b.id, kind: e.kind, index: num(e.index, 'edges[].index') }));
  else if (a.group) {
    if (!['top', 'bottom', 'corner', 'all'].includes(a.group)) return fail('group must be "top", "bottom", "corner" or "all".');
    sels = edgesOfKind(b, a.group);
  } else if (a.aroundFace !== undefined) sels = edgesAroundFace(b, parseFace(b.id, a.aroundFace));
  else return fail('Say which edges: "edges", "group" or "aroundFace".', 'shape_edges lists the edges of a shape.');
  if (!sels.length) return fail('No edges matched.');
  const size = num(a.size, 'size');
  if (size < 0) return fail('size cannot be negative.');
  if (a.style !== undefined && a.style !== 'round' && a.style !== 'chamfer') return fail('style must be "round" (curved) or "chamfer" (flat).');
  const patch = applyEdgeChange(b, sels, { size, style: a.style });
  const next = replace(doc, b.id, patch);
  const after = next.bodies.find((x) => x.id === b.id)!;
  const rim = sels.find((s) => s.kind !== 'corner');
  return {
    doc: next,
    result: {
      id: b.id,
      size: rim ? edgeSize(after, rim) : size,
      style: rim ? after.edgeBevels?.find((e) => e.side === rim.kind && e.edge === rim.index)?.style ?? null : null,
      edges: sels.length,
    },
  };
}

/** The largest bevel an edge selection can take, for agents that want to ask first. */
export const bevelRoom = (b: Body3D, sels: EdgeSel[]) => maxBevelSize(b, sels);

// ---- Structure ------------------------------------------------------------------------------------

export function deleteShapes(doc: Doc, a: { ids: string[] }): OpResult<{ deleted: string[] }> {
  const bodies = withGroupMates(doc, idList(doc, a.ids));
  const gone = new Set(bodies.map((b) => b.id));
  const deleted = bodies.map((b) => b.id);
  const next: Doc = {
    bodies: doc.bodies.filter((b) => !gone.has(b.id) && !(b.repeatOf && gone.has(b.repeatOf))),
    repeats: doc.repeats.filter((l) => !gone.has(l.bodyId)),
    groups: doc.groups.map((g) => ({ ...g, bodyIds: g.bodyIds.filter((id) => !gone.has(id)) })).filter((g) => g.bodyIds.length > 1),
  };
  return { doc: next, result: { deleted } };
}

export function duplicateShapes(doc: Doc, ids: IdGen, a: { ids: string[]; by?: { x?: number; y?: number } }): OpResult<{ created: string[] }> {
  const bodies = idList(doc, a.ids);
  const dx = num(a.by?.x, 'by.x', 35);
  const dy = num(a.by?.y, 'by.y', -35);
  const clones = bodies.map((b) => {
    const id = ids('body');
    return { ...b, ...transformBody(b, { dx, dy, dz: 0, angle: 0, cx: 0, cy: 0 }), id, name: `${b.name} copy`, groupId: undefined, createdAt: new Date().toISOString() } as Body3D;
  });
  return { doc: { ...doc, bodies: [...doc.bodies, ...clones] }, result: { created: clones.map((c) => c.id) } };
}

export function groupShapes(doc: Doc, ids: IdGen, a: { ids: string[]; name?: string }): OpResult<{ group: string }> {
  const bodies = idList(doc, a.ids);
  if (bodies.length < 2) return fail('A group needs at least two shapes.');
  const gid = ids('group');
  const set = new Set(bodies.map((b) => b.id));
  const group: ShapeGroup = { id: gid, name: a.name ?? `Group ${doc.groups.length + 1}`, bodyIds: [...set] };
  const next: Doc = {
    ...doc,
    groups: [...doc.groups.map((g) => ({ ...g, bodyIds: g.bodyIds.filter((id) => !set.has(id)) })).filter((g) => g.bodyIds.length > 1), group],
    bodies: doc.bodies.map((b) => (set.has(b.id) ? { ...b, groupId: gid } : b)),
  };
  return { doc: next, result: { group: gid } };
}

export function ungroupShapes(doc: Doc, a: { group: string }): OpResult<{ released: string[] }> {
  const g = doc.groups.find((x) => x.id === a.group);
  if (!g) return fail(`No group "${a.group}".`, `Groups: ${doc.groups.map((x) => x.id).join(', ') || 'none'}`);
  return {
    doc: { ...doc, groups: doc.groups.filter((x) => x.id !== g.id), bodies: doc.bodies.map((b) => (b.groupId === g.id ? { ...b, groupId: undefined } : b)) },
    result: { released: g.bodyIds },
  };
}

function noWall(bodies: Body3D[]) {
  if (bodies.some((b) => b.frame)) fail('Shapes drawn on a wall cannot be joined or cut yet.');
}

export function joinShapes(doc: Doc, ids: IdGen, a: { ids: string[] }): OpResult<{ created: string[] }> {
  const targets = idList(doc, a.ids);
  if (targets.length < 2) return fail('Joining needs at least two shapes.');
  noWall(targets);
  const stamp = ids('join');
  const merged = joinBodies(targets, stamp);
  if (!merged.length) return fail('Nothing came out of that join.');
  // Several pieces (steps, or parts that do not touch) are grouped so they still act as one shape.
  const groupId = merged.length > 1 ? ids('group') : undefined;
  const pieces = merged.map((b) => ({ ...b, groupId }));
  const gone = new Set(targets.map((b) => b.id));
  const next: Doc = {
    ...doc,
    bodies: [...doc.bodies.filter((b) => !gone.has(b.id)), ...pieces],
    groups: [
      ...doc.groups.map((g) => ({ ...g, bodyIds: g.bodyIds.filter((id) => !gone.has(id)) })).filter((g) => g.bodyIds.length > 1),
      ...(groupId ? [{ id: groupId, name: `${targets[0].name} (joined)`, bodyIds: pieces.map((b) => b.id), joined: true }] : []),
    ],
  };
  return { doc: next, result: { created: pieces.map((p) => p.id) } };
}

/**
 * Subtract: the cutters are cut out of the targets, where they overlap in height, and used up. A short cutter leaves
 * slabs above and below it (kept as one group). Returns what the targets became.
 */
export function subtractShapes(doc: Doc, ids: IdGen, a: { from: string[]; cutters: string[] }): OpResult<{ created: string[]; changed: boolean }> {
  const targets0 = idList(doc, a.from, 'from');
  const cutters0 = withGroupMates(doc, idList(doc, a.cutters, 'cutters'));
  const cutterIds = new Set(cutters0.map((c) => c.id));
  const targets = targets0.filter((t) => !cutterIds.has(t.id));
  if (!targets.length) return fail('Nothing to cut from: "from" and "cutters" are the same shapes.');
  noWall([...targets, ...cutters0]);

  const area = (r: { points: Point2D[]; holes?: Point2D[][] }) =>
    Math.abs(getPolygonSignedArea(r.points)) - (r.holes ?? []).reduce((sum, h) => sum + Math.abs(getPolygonSignedArea(h)), 0);
  const stamp = ids('cut');
  let counter = 0;
  let changed = false;

  const cutOne = (piece: Body3D, cutter: Body3D): Body3D[] => {
    const tLo = piece.elevation ?? 0;
    const tHi = tLo + piece.extrusionHeight;
    const lo = Math.max(tLo, cutter.elevation ?? 0);
    const hi = Math.min(tHi, (cutter.elevation ?? 0) + cutter.extrusionHeight);
    if (hi <= lo) return [piece];
    const results = cutShape(piece.points, piece.holes, cutter.points, cutter.holes);
    if (results.length === 1 && Math.abs(area(results[0]) - area(piece)) < 0.5) return [piece]; // footprints do not touch
    changed = true;

    const full = lo <= tLo && hi >= tHi;
    const clean = { edgeBevels: undefined, cornerBevels: undefined, cornerRadii: undefined };
    const out: Body3D[] = [];
    if (!full && lo > tLo) out.push({ ...piece, ...clean, basePoints: piece.points, id: `${stamp}_${counter++}`, name: `${piece.name} (base)`, elevation: tLo, extrusionHeight: lo - tLo });
    results.forEach((r, i) => {
      out.push({
        ...piece,
        ...clean,
        points: r.points,
        basePoints: r.points,
        holes: r.holes,
        elevation: lo,
        extrusionHeight: hi - lo,
        id: i === 0 && full ? piece.id : `${stamp}_${counter++}`,
        name: i === 0 ? piece.name : `${piece.name} (part ${i + 1})`,
      });
    });
    if (!full && hi < tHi) out.push({ ...piece, ...clean, basePoints: piece.points, id: `${stamp}_${counter++}`, name: `${piece.name} (top)`, elevation: hi, extrusionHeight: tHi - hi });
    return out;
  };

  const replaced = new Map<string, Body3D[]>();
  targets.forEach((t) => {
    let pieces: Body3D[] = [t];
    cutters0.forEach((c) => {
      pieces = pieces.flatMap((p) => cutOne(p, c));
    });
    replaced.set(t.id, pieces);
  });
  if (!changed) return { doc, result: { created: [], changed: false } };

  const newGroups: ShapeGroup[] = [];
  const next: Body3D[] = doc.bodies
    .filter((b) => !cutterIds.has(b.id))
    .flatMap((b) => {
      const pieces = replaced.get(b.id);
      if (!pieces) return [b];
      if (pieces.length > 1) {
        const gid = b.groupId ?? ids('group');
        if (!b.groupId) newGroups.push({ id: gid, name: `${b.name}`, bodyIds: [], joined: true });
        return pieces.map((p) => ({ ...p, groupId: gid }));
      }
      return pieces;
    });
  const allGroups = [...doc.groups, ...newGroups]
    .map((g) => ({ ...g, bodyIds: next.filter((b) => b.groupId === g.id).map((b) => b.id) }))
    .filter((g) => g.bodyIds.length > 1);
  return {
    doc: { ...doc, bodies: next, groups: allGroups },
    result: { created: targets.flatMap((t) => (replaced.get(t.id) ?? []).map((p) => p.id)), changed: true },
  };
}

export interface CutArgs {
  /** The shape to cut into. */
  target: string;
  form: 'polygon' | 'rectangle' | 'circle';
  /** Where to cut from: the top of the target by default. */
  surface?: SurfaceSpec;
  points?: Point2D[];
  bends?: (Point2D | null)[];
  from?: Point2D;
  to?: Point2D;
  center?: Point2D;
  radius?: number;
  /** How deep to cut, mm. Omit to cut all the way through. */
  depth?: number;
}

/** Cuts a pocket or a hole: draws the outline on the top of the target and subtracts it downwards. */
export function cutInto(doc: Doc, ids: IdGen, a: CutArgs): OpResult<{ created: string[]; changed: boolean }> {
  const target = editable(doc, a.target);
  if (target.frame) return fail('Cutting into shapes drawn on a wall is not supported yet.');
  const surface = resolveSurface(doc, a.surface ?? { topOf: target.id });
  if (surface.frame) return fail('Cutting from a wall is not supported yet.');
  const top = (target.elevation ?? 0) + target.extrusionHeight;
  const depth = a.depth === undefined ? target.extrusionHeight + 2 : num(a.depth, 'depth');
  if (depth <= 0) return fail('depth must be positive.');
  const outline = sketchOutline(a as DrawArgs);
  const cutterId = ids('body');
  const lo = Math.max(0, round2(surface.elevation - depth));
  const cutter = { ...drawnBody(outline, lo, cutterId, 'cutter', '#ef4444'), extrusionHeight: round2(Math.max(MIN_HEIGHT, surface.elevation - lo + 1)) };
  void top;
  const withCutter: Doc = { ...doc, bodies: [...doc.bodies, cutter] };
  return subtractShapes(withCutter, ids, { from: [target.id], cutters: [cutterId] });
}

// ---- Repeats ------------------------------------------------------------------------------------

export interface RepeatArgs {
  id: string;
  kind?: 'path' | 'around';
  /** Number of shapes including the original. */
  count?: number;
  /** Distance between neighbours along the path, mm (stretches the path). */
  gap?: number;
  /** Path: where the last copy goes. Or give a direction instead. */
  end?: Point2D;
  /** Path: direction in degrees (0 = +x, 90 = +y) used when `end` is not given. */
  direction?: number;
  /** Path: a point the middle of the path passes through, to curve it; null for straight. */
  bend?: Point2D | null;
  /** Around: the centre of the circle. */
  center?: Point2D;
  /** Turn each copy to follow the path. */
  follow?: boolean;
}

export function setRepeat(doc: Doc, ids: IdGen, a: RepeatArgs): OpResult<{ id: string; copies: string[]; gap: number }> {
  const b = editable(doc, a.id);
  if (b.frame) return fail('Repeating shapes drawn on a wall is not supported yet.');
  const existing = doc.repeats.find((l) => l.bodyId === b.id);
  let s: RepeatSession = existing ? { ...existing } : defaultSession(b);
  // The path is anchored to the shape's centre.
  const c = selectionBounds([b])!;
  s = { ...s, start: { x: round2(c.centerX), y: round2(c.centerY) } };
  const wasKind = s.kind;
  if (a.kind !== undefined) {
    if (a.kind !== 'path' && a.kind !== 'around') return fail('kind must be "path" or "around".');
    s = a.kind === 'around' && wasKind !== 'around' ? toAround(s) : { ...s, kind: a.kind };
  }
  if (a.count !== undefined) {
    const n = Math.round(num(a.count, 'count'));
    if (n < 2 || n > 200) return fail('count must be between 2 and 200 (it includes the original).');
    s = withCount(s, n);
  }
  if (s.kind === 'path') {
    if (a.end) s = { ...s, end: point(a.end, 'end'), bend: s.bend };
    else if (a.direction !== undefined) {
      const g = a.gap !== undefined ? num(a.gap, 'gap') : spacing(s);
      const rad = (num(a.direction, 'direction') * Math.PI) / 180;
      const len = g * (s.count - 1);
      s = { ...s, end: { x: round2(s.start.x + Math.cos(rad) * len), y: round2(s.start.y + Math.sin(rad) * len) } };
    }
    if (a.bend !== undefined) s = { ...s, bend: a.bend === null ? null : bendThrough(s, point(a.bend, 'bend')) };
  } else if (a.center) {
    s = { ...s, end: point(a.center, 'center') };
  }
  if (a.gap !== undefined && !(s.kind === 'path' && a.direction !== undefined && !a.end)) s = withSpacing(s, num(a.gap, 'gap'));
  if (a.follow !== undefined) s = { ...s, follow: !!a.follow };
  if (s.kind === 'path' && Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) < 1) return fail('The path has no length: give "end", or "direction" with "gap".');
  const link: RepeatLink = { ...s, linkId: existing?.linkId ?? ids('repeat') };
  const next = settle({ ...doc, repeats: [...doc.repeats.filter((l) => l.linkId !== link.linkId), link] });
  return { doc: next, result: { id: b.id, copies: next.bodies.filter((x) => x.repeatOf === b.id).map((x) => x.id), gap: round2(spacing(link)) } };
}

export function removeRepeat(doc: Doc, a: { id: string }): OpResult<{ id: string; keptAsShapes: string[] }> {
  const link = doc.repeats.find((l) => l.bodyId === a.id);
  if (!link) return fail(`"${a.id}" has no repeat.`);
  const copies = doc.bodies.filter((b) => b.repeatOf === a.id).map((b) => b.id);
  return { doc: settle({ ...doc, repeats: doc.repeats.filter((l) => l !== link) }), result: { id: a.id, keptAsShapes: copies } };
}
