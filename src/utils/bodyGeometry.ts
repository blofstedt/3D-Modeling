/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BevelStyle, Body3D, Point2D } from '../types';
import { cleanPolygonPoints, ensureWinding } from './geometry';
import { Outline, getBase, getOutline, outwardNormal, runId, runPath, sideRun } from './outline';

const toPath = <T extends THREE.Path>(path: T, pts: { x: number; y: number }[]): T => {
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return path;
};

/** The 2D outline (with holes) of a body as a three.js Shape, or null if degenerate. */
export function buildBodyShape(body: Body3D): THREE.Shape | null {
  const cleaned = cleanPolygonPoints(body.points);
  if (cleaned.length < 3) return null;
  const shape = toPath(new THREE.Shape(), ensureWinding(cleaned, false));
  for (const rawHole of body.holes ?? []) {
    const hole = cleanPolygonPoints(rawHole);
    if (hole.length >= 3) shape.holes.push(toPath(new THREE.Path(), ensureWinding(hole, true)));
  }
  return shape;
}

// ---------------------------------------------------------------------------
// Bevel cutters
// ---------------------------------------------------------------------------

const ARC_STEPS = 8;

/** Cross-section (h = outward, v = up) of the material a bevel removes at a top edge. */
function bevelProfile(size: number, style: BevelStyle): THREE.Vector2[] {
  const e = size + 1;
  const pts: THREE.Vector2[] = [];
  if (style === 'round') {
    for (let k = 0; k <= ARC_STEPS; k++) {
      const t = (k / ARC_STEPS) * (Math.PI / 2);
      pts.push(new THREE.Vector2(-size + size * Math.sin(t), -size + size * Math.cos(t)));
    }
  } else {
    pts.push(new THREE.Vector2(-size, 0), new THREE.Vector2(0, -size));
  }
  pts.push(new THREE.Vector2(e, -size), new THREE.Vector2(e, e), new THREE.Vector2(-size, e));
  return pts;
}

const signedVolume = (pos: number[], idx: number[]) => {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    v +=
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) /
      6;
  }
  return v;
};

/**
 * Sweeps the bevel profile along an edge path to make a closed solid that, subtracted
 * from the body, leaves a chamfer or round. Mitred at the joints between path segments.
 */
export function buildBevelCutter(
  path: Point2D[],
  closed: boolean,
  winding: 1 | -1,
  side: 'top' | 'bottom',
  size: number,
  style: BevelStyle,
  planeY: number
): THREE.BufferGeometry | null {
  // Drop repeated points (closed paths repeat the first point at the end).
  const pts: Point2D[] = [];
  path.forEach((p) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) pts.push(p);
  });
  if (closed && pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.01) {
    pts.pop();
  }
  const m = pts.length;
  if (m < 2 || (closed && m < 3)) return null;

  const segCount = closed ? m : m - 1;
  const segNormal = (k: number) => outwardNormal(pts[k % m], pts[(k + 1) % m], winding);

  // Per-station outward direction, scaled so the offset stays `h` from the edge at a mitre.
  const stations = pts.map((_, i) => {
    const prev = closed ? segNormal((i - 1 + m) % m) : i > 0 ? segNormal(i - 1) : null;
    const next = closed ? segNormal(i) : i < segCount ? segNormal(i) : null;
    const a = prev ?? next!;
    const b = next ?? prev!;
    let nx = a.x + b.x;
    let ny = a.y + b.y;
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) {
      nx = a.x;
      ny = a.y;
    } else {
      nx /= len;
      ny /= len;
    }
    const scale = 1 / Math.max(0.4, nx * a.x + ny * a.y);
    return { nx, ny, scale };
  });

  const profile = bevelProfile(size, style).map((v) => (side === 'top' ? v : new THREE.Vector2(v.x, -v.y)));
  const P = profile.length;
  const positions: number[] = [];
  stations.forEach((st, i) => {
    profile.forEach((q) => {
      positions.push(
        pts[i].x + st.nx * q.x * st.scale,
        planeY + q.y,
        -(pts[i].y + st.ny * q.x * st.scale)
      );
    });
  });

  const index: number[] = [];
  for (let i = 0; i < segCount; i++) {
    const i2 = (i + 1) % m;
    for (let k = 0; k < P; k++) {
      const k2 = (k + 1) % P;
      const A = i * P + k;
      const B = i * P + k2;
      const C = i2 * P + k2;
      const D = i2 * P + k;
      index.push(A, B, C, A, C, D);
    }
  }

  if (!closed) {
    const faces = THREE.ShapeUtils.triangulateShape(profile.map((v) => v.clone()), []);
    const polyArea = THREE.ShapeUtils.area(profile);
    const triArea = (f: number[]) => {
      const [a, b, c] = f.map((i) => profile[i]);
      return ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    };
    faces.forEach((f) => {
      const sameAsPolygon = Math.sign(triArea(f)) === Math.sign(polyArea);
      const [a, b, c] = f;
      // End cap follows the polygon's order, start cap runs against it.
      if (sameAsPolygon) {
        index.push((m - 1) * P + a, (m - 1) * P + b, (m - 1) * P + c);
        index.push(a, c, b);
      } else {
        index.push((m - 1) * P + a, (m - 1) * P + c, (m - 1) * P + b);
        index.push(a, b, c);
      }
    });
  }

  if (signedVolume(positions, index) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const asBrush = (geometry: THREE.BufferGeometry) => {
  const g = geometry.index ? geometry.clone() : geometry.clone();
  g.clearGroups();
  g.deleteAttribute('uv');
  if (!g.index) {
    const count = g.attributes.position.count;
    g.setIndex(Array.from({ length: count }, (_, i) => i));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const brush = new Brush(g);
  brush.updateMatrixWorld(true);
  return brush;
};

interface ResolvedBevel {
  side: 'top' | 'bottom';
  size: number;
  style: BevelStyle;
  path: Point2D[];
  closed: boolean;
}

function resolveBevels(body: Body3D, outline: Outline): ResolvedBevel[] {
  const n = getBase(body).length;
  const height = Math.max(1, body.extrusionHeight);
  const done = new Set<string>();
  const out: ResolvedBevel[] = [];

  // Later entries win when two bevels end up on the same run.
  for (const bevel of [...(body.edgeBevels ?? [])].reverse()) {
    if (bevel.edge < 0 || bevel.edge >= n || bevel.size <= 0) continue;
    const run = sideRun(outline, n, bevel.edge);
    const key = `${bevel.side}:${runId(run)}`;
    if (done.has(key)) continue;
    done.add(key);

    // A bevel can't be larger than the rounding it wraps around, or than half the body.
    let size = Math.min(bevel.size, height / 2 - 0.05);
    const corners = outline.radii.filter((r, v) => r > 0 && run.includes(v) && run.includes((v - 1 + n) % n));
    if (corners.length) size = Math.min(size, Math.min(...corners) * 0.9);
    if (size < 0.1) continue;

    const { pts, closed } = runPath(outline, run, n);
    out.push({ side: bevel.side, size, style: bevel.style, path: pts, closed });
  }
  return out;
}

/**
 * Solid geometry for a body, Y-up, underside at `elevation`, top at elevation + height.
 * Only edges listed in `edgeBevels` are beveled. `fast` skips the bevel cuts, for live previews while dragging.
 */
export function buildBodyGeometry(body: Body3D, options: { fast?: boolean } = {}): THREE.BufferGeometry | null {
  const shape = buildBodyShape(body);
  if (!shape) return null;

  const height = Math.max(1, body.extrusionHeight || 20);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
  } catch (err) {
    console.error(`Could not extrude "${body.name}"`, err);
    return null;
  }
  geometry.rotateX(-Math.PI / 2);

  const bevels = !options.fast && body.edgeBevels?.length ? resolveBevels(body, getOutline(body)) : [];
  if (bevels.length) {
    try {
      const evaluator = new Evaluator();
      evaluator.attributes = ['position', 'normal'];
      evaluator.useGroups = false;
      let result = asBrush(geometry);
      for (const b of bevels) {
        const winding = getOutline(body).winding;
        const cutter = buildBevelCutter(b.path, b.closed, winding, b.side, b.size, b.style, b.side === 'top' ? height : 0);
        if (cutter) result = evaluator.evaluate(result, asBrush(cutter), SUBTRACTION);
      }
      geometry.dispose();
      geometry = result.geometry;
    } catch (err) {
      console.error(`Bevel failed on "${body.name}"; showing it without bevels`, err);
    }
  }

  geometry.deleteAttribute('uv');
  const smooth = toCreasedNormals(geometry, THREE.MathUtils.degToRad(32));
  if (smooth !== geometry) geometry.dispose();
  smooth.translate(0, body.elevation ?? 0, 0);
  return smooth;
}
const edgesOf = (ring: { x: number; y: number }[]) =>
  ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const);

/**
 * A point guaranteed to lie on the body's top face (unlike the vertex average,
 * which falls in the notch of a concave outline). Scans at the centroid height
 * and picks the middle of the widest interior span.
 */
export function getInteriorAnchor(body: Body3D): { x: number; y: number } {
  const pts = body.points;
  const n = pts.length;
  const avg = {
    x: pts.reduce((a, p) => a + p.x, 0) / n,
    y: pts.reduce((a, p) => a + p.y, 0) / n,
  };
  const rings = [pts, ...(body.holes ?? [])];

  const widestSpanAt = (y: number) => {
    const xs: number[] = [];
    for (const ring of rings) {
      for (const [a, b] of edgesOf(ring)) {
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    xs.sort((p, q) => p - q);
    let best: { x: number; width: number } | null = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (!best || width > best.width) best = { x: (xs[i] + xs[i + 1]) / 2, width };
    }
    return best;
  };

  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  // Try the centroid height first, then fan out; offsets avoid hitting vertices exactly.
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = t === 0.5 ? avg.y + 0.01 : minY + (maxY - minY) * t + 0.01;
    const span = widestSpanAt(y);
    if (span && span.width > 1) return { x: span.x, y };
  }
  return avg;
}
