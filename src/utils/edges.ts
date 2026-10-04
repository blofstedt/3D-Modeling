/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BevelStyle, Body3D, EdgeBevel, EdgeSel, FaceSel } from '../types';
import { getBase, getOutline, outwardNormal, runId, runPath, sideRun, withOutline } from './outline';

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
    const { pts, closed } = runPath(outline, run, n);
    // Once an edge is beveled, the pickable/highlighted line lies on the bevel itself, not in the air at the old sharp edge.
    const lineFor = (kind: 'top' | 'bottom') => {
      const bevel = findBevel(body, kind, id);
      const inset = bevel && bevel.size > 0 ? Math.min(bevel.size, body.extrusionHeight / 2 - 0.05) * (bevel.style === 'round' ? 0.3 : 0.5) : 0;
      const y0 = kind === 'top' ? top : bottom;
      return pts.map((p, i) => {
        if (inset <= 0) return { x: p.x, y: y0, z: -p.y };
        const prev = i > 0 ? pts[i - 1] : closed ? pts[pts.length - 1] : null;
        const next = i < pts.length - 1 ? pts[i + 1] : closed ? pts[0] : null;
        const a = prev ? outwardNormal(prev, p, outline.winding) : null;
        const b = next ? outwardNormal(p, next, outline.winding) : null;
        const nx = ((a?.x ?? b!.x) + (b?.x ?? a!.x)) / 2;
        const ny = ((a?.y ?? b!.y) + (b?.y ?? a!.y)) / 2;
        const len = Math.hypot(nx, ny) || 1;
        return { x: p.x - (nx / len) * inset, y: y0 + (kind === 'top' ? -inset : inset), z: -(p.y - (ny / len) * inset) };
      });
    };
    edges.push({ kind: 'top', index: id, points: lineFor('top') });
    edges.push({ kind: 'bottom', index: id, points: lineFor('bottom') });
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

// ---------------------------------------------------------------------------
// Selecting edges in bulk
// ---------------------------------------------------------------------------

export type EdgeGroup = 'top' | 'bottom' | 'corner' | 'all';

/** Every edge of one kind on a body: the whole top rim, the whole bottom rim, the vertical corner lines, or all of them. */
export function edgesOfKind(body: Body3D, group: EdgeGroup): EdgeSel[] {
  return listEdges(body)
    .filter((e) => group === 'all' || e.kind === group)
    .map((e) => ({ bodyId: body.id, kind: e.kind, index: e.index }));
}

/** The edges that border a face: its whole rim for the top or bottom; for a wall, its top, bottom and both vertical corner lines. */
export function edgesAroundFace(body: Body3D, face: FaceSel): EdgeSel[] {
  if (face.kind === 'top') return edgesOfKind(body, 'top');
  if (face.kind === 'bottom') return edgesOfKind(body, 'bottom');
  if (face.index === undefined) return [];
  const n = getBase(body).length;
  const id = runId(sideRun(getOutline(body), n, face.index));
  // The wall's top and bottom edge, plus the vertical corner line at each end (a rounded corner counts too).
  return [
    { bodyId: body.id, kind: 'top', index: id },
    { bodyId: body.id, kind: 'bottom', index: id },
    { bodyId: body.id, kind: 'corner', index: face.index },
    { bodyId: body.id, kind: 'corner', index: (face.index + 1) % n },
  ];
}

const keyset = (sels: EdgeSel[]) => new Set(sels.map(edgeKey));

/** True when `sels` is exactly every edge in `group` of the body. */
export function isWholeGroup(body: Body3D, sels: EdgeSel[], group: EdgeGroup): boolean {
  const all = edgesOfKind(body, group);
  if (!all.length || all.length !== sels.length) return false;
  const have = keyset(sels);
  return all.every((e) => have.has(edgeKey(e)));
}

/** Short words for what is selected: "Edge", "5 edges", with "Top loop" etc. when it is a whole rim. */
export function describeEdges(body: Body3D, sels: EdgeSel[]): { title: string; sub: string } {
  const onlyCorners = sels.every((e) => e.kind === 'corner');
  const noun = onlyCorners ? 'corner' : 'edge';
  const title = sels.length === 1 ? (onlyCorners ? 'Corner' : 'Edge') : `${sels.length} ${noun}s`;
  if (sels.length > 1 && isWholeGroup(body, sels, 'top')) return { title, sub: 'Top loop' };
  if (sels.length > 1 && isWholeGroup(body, sels, 'bottom')) return { title, sub: 'Bottom loop' };
  if (sels.length > 1 && isWholeGroup(body, sels, 'corner')) return { title, sub: 'All corners' };
  if (sels.length > 1 && isWholeGroup(body, sels, 'all')) return { title, sub: 'Every edge' };
  return { title, sub: body.name };
}

/** Adds the edge to the selection, or removes it when it is already in. */
export function toggleEdge(current: EdgeSel[], sel: EdgeSel): EdgeSel[] {
  const k = edgeKey(sel);
  return current.some((c) => edgeKey(c) === k) ? current.filter((c) => edgeKey(c) !== k) : [...current, sel];
}
