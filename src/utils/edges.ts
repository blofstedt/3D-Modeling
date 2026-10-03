/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BevelStyle, Body3D, EdgeBevel, EdgeSel } from '../types';
import { getBase, getOutline, runId, runPath, sideRun, withOutline } from './outline';

export const DEFAULT_BEVEL_SIZE = 2;
export const MAX_BEVEL_SIZE = 30;

export interface EdgePath {
  kind: EdgeSel['kind'];
  index: number;
  /** World-space polyline (Y up). */
  points: { x: number; y: number; z: number }[];
}

const edgeCache = new WeakMap<Body3D, EdgePath[]>();

/** Every pickable edge of a body, in world space. Cached per body object (bodies are immutable). */
export function listEdges(body: Body3D): EdgePath[] {
  let edges = edgeCache.get(body);
  if (!edges) {
    edges = computeEdges(body);
    edgeCache.set(body, edges);
  }
  return edges;
}

function computeEdges(body: Body3D): EdgePath[] {
  const base = getBase(body);
  const n = base.length;
  if (n < 3) return [];
  const outline = getOutline(body);
  const bottom = body.elevation ?? 0;
  const top = bottom + body.extrusionHeight;
  const edges: EdgePath[] = [];

  const seen = new Set<number>();
  for (let j = 0; j < n; j++) {
    const run = sideRun(outline, n, j);
    const id = runId(run);
    if (seen.has(id)) continue;
    seen.add(id);
    const { pts } = runPath(outline, run, n);
    edges.push({ kind: 'top', index: id, points: pts.map((p) => ({ x: p.x, y: top, z: -p.y })) });
    edges.push({ kind: 'bottom', index: id, points: pts.map((p) => ({ x: p.x, y: bottom, z: -p.y })) });
  }
  for (let v = 0; v < n; v++) {
    const a = outline.arcMid.get(v) ?? base[v];
    edges.push({
      kind: 'corner',
      index: v,
      points: [
        { x: a.x, y: bottom, z: -a.y },
        { x: a.x, y: top, z: -a.y },
      ],
    });
  }
  return edges;
}

const sameRun = (body: Body3D, a: number, b: number) => {
  const outline = getOutline(body);
  const n = getBase(body).length;
  return runId(sideRun(outline, n, a)) === runId(sideRun(outline, n, b));
};

export function findBevel(body: Body3D, side: 'top' | 'bottom', id: number): EdgeBevel | undefined {
  return (body.edgeBevels ?? []).find((b) => b.side === side && sameRun(body, b.edge, id));
}

/** Current size (bevel) or radius (corner) of an edge; 0 when untouched. */
export function edgeSize(body: Body3D, sel: EdgeSel): number {
  if (sel.kind === 'corner') return body.cornerRadii?.[sel.index] ?? 0;
  return findBevel(body, sel.kind, sel.index)?.size ?? 0;
}

export function edgeStyle(body: Body3D, sel: EdgeSel): BevelStyle | undefined {
  return sel.kind === 'corner' ? undefined : findBevel(body, sel.kind, sel.index)?.style;
}

/** Applies a size/style change to the given edges of `body` and returns the update. */
export function applyEdgeChange(
  body: Body3D,
  sels: EdgeSel[],
  patch: { size?: number; style?: BevelStyle }
): Partial<Body3D> {
  let bevels = [...(body.edgeBevels ?? [])];
  const radii = getBase(body).map((_, i) => body.cornerRadii?.[i] ?? 0);
  let radiiChanged = false;

  for (const sel of sels) {
    if (sel.bodyId !== body.id) continue;
    if (sel.kind === 'corner') {
      if (patch.size !== undefined) {
        radii[sel.index] = Math.max(0, Math.min(MAX_BEVEL_SIZE * 2, patch.size));
        radiiChanged = true;
      }
      continue;
    }
    const existing = findBevel(body, sel.kind, sel.index);
    if (patch.size !== undefined && patch.size <= 0) {
      bevels = bevels.filter((b) => b !== existing);
      continue;
    }
    if (!existing && patch.size === undefined && patch.style === undefined) continue;
    const next: EdgeBevel = {
      side: sel.kind,
      edge: sel.index,
      size: Math.min(MAX_BEVEL_SIZE, patch.size ?? existing?.size ?? DEFAULT_BEVEL_SIZE),
      style: patch.style ?? existing?.style ?? 'round',
    };
    bevels = existing ? bevels.map((b) => (b === existing ? next : b)) : [...bevels, next];
  }

  return { edgeBevels: bevels, ...(radiiChanged ? withOutline(body, { cornerRadii: radii }) : {}) };
}

export interface FeatureRow {
  sel: EdgeSel;
  label: string;
  detail: string;
}

/** Bevels and rounded corners on a body, for the inspector. */
export function listFeatures(body: Body3D): FeatureRow[] {
  const rows: FeatureRow[] = [];
  const outline = getOutline(body);
  const n = getBase(body).length;
  const seen = new Set<string>();
  let top = 0;
  let bottom = 0;
  for (const b of body.edgeBevels ?? []) {
    const id = runId(sideRun(outline, n, b.edge));
    const key = `${b.side}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = b.side === 'top' ? ++top : ++bottom;
    rows.push({
      sel: { bodyId: body.id, kind: b.side, index: id },
      label: `${b.side === 'top' ? 'Top' : 'Bottom'} edge ${count}`,
      detail: `${b.style === 'round' ? 'Round' : 'Chamfer'} ${b.size} mm`,
    });
  }
  (body.cornerRadii ?? []).forEach((r, v) => {
    if (r > 0.5 && outline.radii[v] > 0) {
      rows.push({
        sel: { bodyId: body.id, kind: 'corner', index: v },
        label: `Corner ${v + 1}`,
        detail: `Radius ${Math.round(outline.radii[v] * 10) / 10} mm`,
      });
    }
  });
  return rows;
}

export const edgeKey = (s: EdgeSel) => `${s.bodyId}:${s.kind}:${s.index}`;

/** Line segments (x, y, z triples) tracing a body's silhouette edges, for the selection outline. */
export function outlineSegments(body: Body3D): number[] {
  const outline = getOutline(body);
  const base = getBase(body);
  const bottom = body.elevation ?? 0;
  const top = bottom + body.extrusionHeight;
  const out: number[] = [];

  const loop = (pts: { x: number; y: number }[], y: number) => {
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      out.push(p.x, y, -p.y, q.x, y, -q.y);
    });
  };
  const post = (p: { x: number; y: number }) => out.push(p.x, bottom, -p.y, p.x, top, -p.y);

  loop(outline.points, top);
  loop(outline.points, bottom);
  base.forEach((p, v) => {
    if (!outline.arcMid.has(v)) post(p);
  });
  for (const hole of body.holes ?? []) {
    if (hole.length < 3) continue;
    loop(hole, top);
    loop(hole, bottom);
    hole.forEach(post);
  }
  return out;
}
