/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { Body3D } from '../types';
import { cleanPolygonPoints, ensureWinding } from './geometry';

const toPath = <T extends THREE.Path>(path: T, pts: { x: number; y: number }[]): T => {
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return path;
};

/** The 2D outline (with holes) of a body as a three.js Shape, or null if degenerate. */
export function buildBodyShape(body: Body3D, pointsOverride?: { x: number; y: number }[]): THREE.Shape | null {
  const cleaned = cleanPolygonPoints(pointsOverride ?? body.points);
  if (cleaned.length < 3) return null;

  const shape = toPath(new THREE.Shape(), ensureWinding(cleaned, false));
  for (const rawHole of body.holes ?? []) {
    const hole = cleanPolygonPoints(rawHole);
    if (hole.length >= 3) shape.holes.push(toPath(new THREE.Path(), ensureWinding(hole, true)));
  }
  return shape;
}

/**
 * Solid geometry for a body, Y-up, base on y = 0, top exactly at `extrusionHeight`.
 * The bevel is carved inside the nominal envelope, so dimensions always match
 * what the inspector reports (and what gets exported).
 */
export function buildBodyGeometry(body: Body3D): THREE.BufferGeometry | null {
  const shape = buildBodyShape(body);
  if (!shape) return null;

  const height = Math.max(1, body.extrusionHeight || 20);
  const wantsBevel = body.bevelEnabled !== false && (body.bevelSize ?? 1) > 0;
  const bevelSize = Math.max(0.2, Math.min(10, body.bevelSize ?? 1));
  const bevelThickness = wantsBevel ? Math.min(bevelSize, height / 2 - 0.05) : 0;

  const make = (bevel: boolean) =>
    new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: bevel ? height - 2 * bevelThickness : height,
      bevelEnabled: bevel,
      bevelThickness,
      bevelSize,
      bevelOffset: -bevelSize,
      bevelSegments: Math.max(1, body.bevelSegments ?? 3),
    });

  let geometry: THREE.ExtrudeGeometry;
  let beveled = wantsBevel && bevelThickness > 0;
  try {
    geometry = make(beveled);
  } catch {
    try {
      geometry = make(false);
      beveled = false;
    } catch (err) {
      console.error(`Could not extrude "${body.name}"`, err);
      return null;
    }
  }

  if (beveled) geometry.translate(0, 0, bevelThickness);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
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
