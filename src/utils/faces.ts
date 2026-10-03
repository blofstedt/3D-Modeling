/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D, FaceSel } from '../types';
import { getBase, outwardNormal, wallEnds, withOutline } from './outline';

export const MIN_HEIGHT = 2;
export const MAX_HEIGHT = 600;

/** Slides one wall along its outward normal; positive pushes it out. */
export function offsetWall(body: Body3D, index: number, dist: number): Partial<Body3D> | null {
  const ends = wallEnds(body, index);
  if (!ends) return null;
  const n = outwardNormal(ends.a, ends.b, ends.winding);
  const base = getBase(body).map((p) => ({ ...p }));
  [index, (index + 1) % base.length].forEach((i) => {
    base[i] = { x: Math.round(base[i].x + n.x * dist), y: Math.round(base[i].y + n.y * dist) };
  });
  return withOutline(body, { basePoints: base });
}

/** Limits for pulling the bottom face down (negative) or pushing it up (positive) with the top fixed. */
export function bottomRange(body: Body3D): { min: number; max: number } {
  return { min: -(body.elevation ?? 0), max: body.extrusionHeight - MIN_HEIGHT };
}

/** Moves the bottom face by `delta` (negative = down) while the top stays where it is. */
export function moveBottom(body: Body3D, delta: number): Partial<Body3D> {
  const { min, max } = bottomRange(body);
  const d = Math.max(min, Math.min(max, Math.round(delta)));
  return { elevation: (body.elevation ?? 0) + d, extrusionHeight: body.extrusionHeight - d };
}

/** Pulls a face outward by `delta` mm (negative pushes it in). Returns the changes to apply to the body. */
export function extrudeFace(body: Body3D, face: FaceSel, delta: number): Partial<Body3D> | null {
  if (face.kind === 'top') {
    return { extrusionHeight: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(body.extrusionHeight + delta))) };
  }
  if (face.kind === 'bottom') return moveBottom(body, -delta);
  return face.index === undefined ? null : offsetWall(body, face.index, delta);
}

export const sameFace = (a: FaceSel | null | undefined, b: FaceSel | null | undefined) =>
  !!a && !!b && a.bodyId === b.bodyId && a.kind === b.kind && a.index === b.index;
