/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D, Point2D, RepeatLink, ShapeGroup } from '../types';
import { syncRepeats } from '../utils/repeat';

/** Everything that is saved: the shapes, how they are grouped, and the live repeats that make some of them. */
export interface Doc {
  bodies: Body3D[];
  groups: ShapeGroup[];
  /** Kept repeats: their copies are derived from the source shape and rebuilt on every change. */
  repeats: RepeatLink[];
}

/** Makes ids. Each caller supplies its own so ids stay unique (the app uses time, an agent session a counter). */
export type IdGen = (kind: string) => string;

export const emptyDoc = (): Doc => ({ bodies: [], groups: [], repeats: [] });

/** Settles a document: live-repeat copies are always rebuilt to match their source and path. */
export const settle = (d: Doc): Doc => {
  const synced = syncRepeats(d.bodies, d.repeats);
  return synced.bodies === d.bodies && synced.repeats === d.repeats ? d : { ...d, ...synced };
};

/** The scene a new document starts with: one plain block. */
export const starterBodies = (): Body3D[] => {
  const outline: Point2D[] = [
    { x: -60, y: -40 },
    { x: 60, y: -40 },
    { x: 60, y: 40 },
    { x: -60, y: 40 },
  ];
  return [
    {
      id: 'body_block',
      name: 'Block',
      points: outline,
      extrusionHeight: 50,
      color: '#6f7a93',
      materialType: 'matte',
      visible: true,
      createdAt: new Date().toISOString(),
    },
  ];
};

export const starterDoc = (): Doc => ({ bodies: starterBodies(), groups: [], repeats: [] });

/** Reads a saved document, tolerating older ones (no repeats) and refusing anything that is not one. */
export function parseDoc(raw: unknown): Doc | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<Doc>;
  if (!Array.isArray(d.bodies) || !Array.isArray(d.groups)) return null;
  return settle({ bodies: d.bodies, groups: d.groups, repeats: Array.isArray(d.repeats) ? d.repeats : [] });
}

/** A counter-based id generator that never reuses an id already in `doc`. */
export function counterIds(doc: Doc, start = 1): IdGen {
  const used = new Set([...doc.bodies.map((b) => b.id), ...doc.groups.map((g) => g.id), ...doc.repeats.map((r) => r.linkId)]);
  let n = start;
  return (kind) => {
    let id = `${kind}_${n++}`;
    while (used.has(id)) id = `${kind}_${n++}`;
    used.add(id);
    return id;
  };
}
