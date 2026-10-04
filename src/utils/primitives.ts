/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D, Point2D } from '../types';

export type ShapeKind = 'box' | 'cylinder' | 'triangle' | 'hexagon';

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
};

const SIZE = 60;

/** Outline of a stock shape centred on (cx, cy). A cylinder is a square whose corners are rounded all the way. */
export function primitiveOutline(kind: ShapeKind, cx: number, cy: number): Pick<Body3D, 'points'> & { basePoints: Point2D[]; cornerRadii?: number[] } {
  const h = SIZE / 2;
  const at = (pts: Point2D[]) => pts.map((p) => ({ x: Math.round(cx + p.x), y: Math.round(cy + p.y) }));
  switch (kind) {
    case 'triangle': {
      const pts = at([
        { x: -h, y: -h * 0.87 },
        { x: h, y: -h * 0.87 },
        { x: 0, y: h * 0.87 },
      ]);
      return { points: pts, basePoints: pts };
    }
    case 'hexagon': {
      const pts = at(Array.from({ length: 6 }, (_, i) => ({ x: h * Math.cos((i * Math.PI) / 3), y: h * Math.sin((i * Math.PI) / 3) })));
      return { points: pts, basePoints: pts };
    }
    case 'cylinder': {
      const pts = at([
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ]);
      return { points: pts, basePoints: pts, cornerRadii: pts.map(() => h) };
    }
    default: {
      const pts = at([
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ]);
      return { points: pts, basePoints: pts };
    }
  }
}
