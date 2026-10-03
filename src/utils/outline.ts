/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D, Point2D } from '../types';
import { getPolygonSignedArea } from './geometry';

const ARC_SEGMENTS = 8;

/** What a segment of the final outline belongs to: a flat side, or the rounding at a corner. */
export type SegmentRole = { kind: 'side'; index: number } | { kind: 'corner'; index: number };

export interface Outline {
  points: Point2D[];
  /** roles[i] describes the segment points[i] -> points[i+1]. */
  roles: SegmentRole[];
  /** Middle point of the arc at each rounded vertex. */
  arcMid: Map<number, Point2D>;
  /** Radius actually achieved at each vertex (0 when sharp). */
  radii: number[];
  /** +1 when the outline runs counter-clockwise, -1 clockwise. */
  winding: 1 | -1;
}

/** Fillet geometry at `curr`, or null when the corner stays sharp. */
function filletCorner(prev: Point2D, curr: Point2D, next: Point2D, radius: number) {
  if (radius <= 0.5) return null;
  const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
  const v2 = { x: next.x - curr.x, y: next.y - curr.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < 0.001 || len2 < 0.001) return null;

  const u1 = { x: v1.x / len1, y: v1.y / len1 };
  const u2 = { x: v2.x / len2, y: v2.y / len2 };
  const angle = Math.acos(Math.max(-0.999, Math.min(0.999, u1.x * u2.x + u1.y * u2.y)));
  if (angle < 0.1 || angle > Math.PI - 0.1) return null; // effectively straight

  const half = angle / 2;
  const tangent = Math.min(radius / Math.tan(half), Math.min(len1, len2) * 0.48);
  const actual = tangent * Math.tan(half);
  if (actual < 0.5) return null;

  const t1 = { x: curr.x + u1.x * tangent, y: curr.y + u1.y * tangent };
  const t2 = { x: curr.x + u2.x * tangent, y: curr.y + u2.y * tangent };
  const bis = { x: u1.x + u2.x, y: u1.y + u2.y };
  const bLen = Math.hypot(bis.x, bis.y);
  if (bLen < 0.001) return null;
  const toCenter = actual / Math.sin(half);
  const center = { x: curr.x + (bis.x / bLen) * toCenter, y: curr.y + (bis.y / bLen) * toCenter };

  const a1 = Math.atan2(t1.y - center.y, t1.x - center.x);
  const a2 = Math.atan2(t2.y - center.y, t2.x - center.x);
  // A fillet always sweeps the short way between its tangent points.
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  const points: Point2D[] = [];
  for (let s = 0; s <= ARC_SEGMENTS; s++) {
    const a = a1 + (diff * s) / ARC_SEGMENTS;
    points.push({
      x: Math.round((center.x + Math.cos(a) * actual) * 100) / 100,
      y: Math.round((center.y + Math.sin(a) * actual) * 100) / 100,
    });
  }
  return { points, radius: actual };
}

/** Applies per-vertex corner radii to a sharp outline. */
export function buildOutline(base: Point2D[], radii?: number[]): Outline {
  const n = base.length;
  const points: Point2D[] = [];
  const owner: { v: number; arc: boolean }[] = [];
  const arcMid = new Map<number, Point2D>();
  const achieved: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const arc = n >= 3 ? filletCorner(base[(i - 1 + n) % n], base[i], base[(i + 1) % n], radii?.[i] ?? 0) : null;
    if (!arc) {
      points.push({ ...base[i] });
      owner.push({ v: i, arc: false });
    } else {
      arc.points.forEach((p) => {
        points.push(p);
        owner.push({ v: i, arc: true });
      });
      arcMid.set(i, arc.points[Math.floor(arc.points.length / 2)]);
      achieved[i] = arc.radius;
    }
  }

  const roles: SegmentRole[] = points.map((_, k) => {
    const a = owner[k];
    const b = owner[(k + 1) % points.length];
    return a.arc && b.arc && a.v === b.v ? { kind: 'corner', index: a.v } : { kind: 'side', index: a.v };
  });

  return {
    points,
    roles,
    arcMid,
    radii: achieved,
    winding: getPolygonSignedArea(points) >= 0 ? 1 : -1,
  };
}

export const getBase = (body: Pick<Body3D, 'points' | 'basePoints'>): Point2D[] => body.basePoints ?? body.points;

export const getOutline = (body: Pick<Body3D, 'points' | 'basePoints' | 'cornerRadii'>): Outline =>
  buildOutline(getBase(body), body.cornerRadii);

/** Recomputes `points` after the base outline and/or corner radii change. Spread the result into an update. */
export function withOutline(
  body: Pick<Body3D, 'points' | 'basePoints' | 'cornerRadii'>,
  patch: { basePoints?: Point2D[]; cornerRadii?: number[] }
): Pick<Body3D, 'points' | 'basePoints' | 'cornerRadii'> {
  const basePoints = patch.basePoints ?? getBase(body);
  const source = patch.cornerRadii ?? body.cornerRadii ?? [];
  const cornerRadii = basePoints.map((_, i) => source[i] ?? 0);
  return { basePoints, cornerRadii, points: buildOutline(basePoints, cornerRadii).points };
}

/** Sides that form one smooth run: neighbours joined through a rounded corner. */
export function sideRun(outline: Outline, sideCount: number, side: number): number[] {
  const run = new Set<number>([side]);
  let cur = side;
  while (outline.arcMid.has(cur)) {
    cur = (cur - 1 + sideCount) % sideCount;
    if (run.has(cur)) break;
    run.add(cur);
  }
  cur = side;
  while (outline.arcMid.has((cur + 1) % sideCount)) {
    cur = (cur + 1) % sideCount;
    if (run.has(cur)) break;
    run.add(cur);
  }
  return [...run].sort((a, b) => a - b);
}

export const runId = (run: number[]) => run[0];

/** The outline points that make up a run, in order. */
export function runPath(outline: Outline, run: number[], sideCount: number): { pts: Point2D[]; closed: boolean } {
  const inRun = new Set(run);
  const m = outline.points.length;
  const segIn = outline.roles.map((role) =>
    role.kind === 'side'
      ? inRun.has(role.index)
      : inRun.has(role.index) && inRun.has((role.index - 1 + sideCount) % sideCount)
  );
  if (segIn.every(Boolean)) {
    return { pts: [...outline.points, outline.points[0]], closed: true };
  }
  let start = segIn.findIndex((on, k) => on && !segIn[(k - 1 + m) % m]);
  if (start < 0) start = segIn.findIndex(Boolean);
  const pts: Point2D[] = [outline.points[start]];
  for (let k = start, guard = 0; segIn[k % m] && guard < m; k++, guard++) {
    pts.push(outline.points[(k + 1) % m]);
  }
  return { pts, closed: false };
}

export function outwardNormal(a: Point2D, b: Point2D, winding: 1 | -1): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return winding > 0 ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
}

/** The flat part of one base side of the outline: its endpoints and the outline winding. */
export function wallEnds(
  body: Pick<Body3D, 'points' | 'basePoints' | 'cornerRadii'>,
  side: number
): { a: Point2D; b: Point2D; winding: 1 | -1 } | null {
  const outline = getOutline(body);
  const idx = outline.roles.map((r, k) => (r.kind === 'side' && r.index === side ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return null;
  return {
    a: outline.points[idx[0]],
    b: outline.points[(idx[idx.length - 1] + 1) % outline.points.length],
    winding: outline.winding,
  };
}
