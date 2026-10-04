/**
 * Headless checks for the geometry the app builds. Run with `npm test`.
 */
import * as THREE from 'three';
import { Body3D, Point2D } from '../src/types';
import { buildBodyGeometry } from '../src/utils/bodyGeometry';
import { getPolygonSignedArea } from '../src/utils/geometry';
import { buildOutline, sideRun, withOutline } from '../src/utils/outline';
import { applyEdgeChange, edgesAroundFace, edgesOfKind, findBevel, isWholeGroup, listEdges } from '../src/utils/edges';
import { resizeBody, transformBody } from '../src/utils/transform';
import { joinBodies } from '../src/utils/join';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const rect = (x1: number, y1: number, x2: number, y2: number): Point2D[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];
const body = (over: Partial<Body3D>): Body3D => ({
  id: 't',
  name: 't',
  points: rect(-50, -30, 50, 30),
  extrusionHeight: 40,
  color: '#fff',
  materialType: 'matte',
  visible: true,
  createdAt: '',
  ...over,
});

const volume = (g: THREE.BufferGeometry) => {
  const pos = g.attributes.position;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  let vol = 0;
  for (let i = 0; i < n; i += 3) vol += v(i).dot(v(i + 1).cross(v(i + 2))) / 6;
  return vol;
};

// A plain prism is exactly width x depth x height, sitting on its elevation.
const plain = buildBodyGeometry(body({ elevation: 20 }))!;
plain.computeBoundingBox();
check('plain box volume', near(volume(plain), 100 * 60 * 40, 1));
check('elevation lifts the body', near(plain.boundingBox!.min.y, 20, 1e-6) && near(plain.boundingBox!.max.y, 60, 1e-6));

// Rounding a corner takes the short way round (regression: arcs once bit inward).
const rounded = buildOutline(rect(-50, -30, 50, 30), [10, 10, 10, 10]);
const expectedArea = 6000 - 4 * (100 - (Math.PI * 100) / 4);
check('rounded corners are convex fillets', near(getPolygonSignedArea(rounded.points), expectedArea, 10));

// A chamfer on one edge removes exactly that wedge, and nothing else.
const chamfer = buildBodyGeometry(body({ edgeBevels: [{ side: 'top', edge: 0, size: 5, style: 'chamfer' }] }))!;
check('chamfer removes a 5 mm wedge from one edge', near(volume(chamfer), 240000 - 0.5 * 25 * 100, 5));

const round = buildBodyGeometry(body({ edgeBevels: [{ side: 'top', edge: 1, size: 5, style: 'round' }] }))!;
check('round removes less than a chamfer of the same size', volume(round) > volume(chamfer) && volume(round) < 240000);

// Only the chosen edge changes: beveling two edges removes more than one.
const two = buildBodyGeometry(
  body({ edgeBevels: [{ side: 'top', edge: 0, size: 5, style: 'chamfer' }, { side: 'bottom', edge: 2, size: 5, style: 'chamfer' }] })
)!;
check('each bevel is independent', near(volume(two), 240000 - 2 * 0.5 * 25 * 100, 10));

// A bevel follows a tangent run through rounded corners.
const pill = body({ ...withOutline({ points: rect(-50, -30, 50, 30) }, { cornerRadii: [10, 10, 10, 10] }) });
check('rounded corners join all four sides into one run', sideRun(buildOutline(pill.points, pill.cornerRadii), 4, 0).length === 4);
const loop = buildBodyGeometry({ ...pill, edgeBevels: [{ side: 'top', edge: 0, size: 4, style: 'round' }] })!;
check('bevel wraps the whole rounded loop', near(volume(loop), 5912 * 40 - 0.2146 * 16 * 303, 80));

// Edge edits go through one place and canonicalise to the run.
const edited = { ...pill, ...applyEdgeChange(pill, [{ bodyId: 't', kind: 'top', index: 2 }], { size: 3 }) } as Body3D;
check('editing any side of a run bevels the run', !!findBevel(edited, 'top', 0) && edited.edgeBevels!.length === 1);
check('size 0 removes the bevel', !(applyEdgeChange(edited, [{ bodyId: 't', kind: 'top', index: 0 }], { size: 0 }).edgeBevels?.length));

// Live previews skip the bevel cut but keep the body's exact size.
const withBevel = body({ edgeBevels: [{ side: 'top', edge: 0, size: 5, style: 'chamfer' }] });
check('fast preview skips bevels', near(volume(buildBodyGeometry(withBevel, { fast: true })!), 240000, 1));

// Resizing a footprint scales it about its centre and keeps corner radii.
const resized = { ...pill, ...resizeBody(pill, 200, 120) } as Body3D;
const rb = buildOutline(resized.basePoints!, resized.cornerRadii);
check('resize scales the footprint', near(Math.max(...resized.points.map((p) => p.x)) - Math.min(...resized.points.map((p) => p.x)), 200, 0.5));
check('resize keeps corner radii', rb.radii.every((r) => near(r, 10, 0.5)));

// Every body exposes its pickable edges: top + bottom loops per run, plus a line per corner.
check('edge list for a box', listEdges(body({})).length === 4 * 2 + 4);

// Rigid moves keep bevel/radius indices valid and rotate about the given centre.
const moved = transformBody(body({}), { dx: 10, dy: 0, dz: 5, angle: Math.PI / 2, cx: 0, cy: 0 });
check('rotate 90° then move', near(moved.points![0].x, 30 + 10, 0.01) && near(moved.points![0].y, -50, 0.01) && moved.elevation === 5);

// Bulk edge selection on a box: 4 top, 4 bottom, 4 vertical.
const box = body({});
check('rim selection counts', edgesOfKind(box, 'top').length === 4 && edgesOfKind(box, 'bottom').length === 4 && edgesOfKind(box, 'corner').length === 4 && edgesOfKind(box, 'all').length === 12);
check('top face selects the whole top rim', isWholeGroup(box, edgesAroundFace(box, { bodyId: box.id, kind: 'top' }), 'top'));
check('a wall borders four edges: top, bottom and both corners', edgesAroundFace(box, { bodyId: box.id, kind: 'wall', index: 0 }).length === 4);

// A bevel picked together with a rounded corner keeps that curve (it used to be overwritten with the bevel size).
const curved = { ...box, ...withOutline(box, { cornerRadii: [0, 25, 0, 0] }) } as Body3D;
const wallEdges = edgesAroundFace(curved, { bodyId: curved.id, kind: 'wall', index: 0 });
const bevelled = { ...curved, ...applyEdgeChange(curved, wallEdges, { size: 8 }) } as Body3D;
check('bevel keeps an existing curved corner', near(bevelled.cornerRadii![1], 25, 0.01), JSON.stringify(bevelled.cornerRadii));
check('bevel rounds a sharp corner to match', near(bevelled.cornerRadii![0], 8, 0.01));
const removed = { ...bevelled, ...applyEdgeChange(bevelled, wallEdges, { size: 0 }) } as Body3D;
check('removing the bevel keeps the curve', near(removed.cornerRadii![1], 25, 0.01) && !(removed.edgeBevels ?? []).length);

// Join keeps each shape's own height: a tall block beside a short one stays tall where it is tall.
const tall = body({ id: 'a', points: rect(0, 0, 40, 40), extrusionHeight: 80 });
const short = body({ id: 'b', points: rect(40, 0, 100, 40), extrusionHeight: 20 });
const joined = joinBodies([tall, short], 1);
const area = (b: Body3D) => Math.abs(getPolygonSignedArea(b.points));
const base = joined.find((b) => b.elevation === 0);
const upper = joined.find((b) => b.elevation === 20);
check(
  'join keeps each shape height',
  joined.length === 2 && !!base && !!upper && base.extrusionHeight === 20 && near(area(base), 100 * 40, 1) && upper.extrusionHeight === 60 && near(area(upper), 40 * 40, 1),
  joined.map((b) => `${b.elevation}+${b.extrusionHeight}`).join(' ')
);
const stackA = body({ id: 'c', points: rect(0, 0, 40, 40), extrusionHeight: 30 });
const stackB = body({ id: 'd', points: rect(0, 0, 40, 40), extrusionHeight: 20, elevation: 30 });
const stacked = joinBodies([stackA, stackB], 2);
check('join of a stack is one taller shape', stacked.length === 1 && stacked[0].extrusionHeight === 50);
const overlap = joinBodies([body({ id: 'e', points: rect(0, 0, 60, 40) }), body({ id: 'f', points: rect(40, 0, 100, 40) })], 3);
check('join of overlapping boxes is one polygon', overlap.length === 1 && near(Math.abs(getPolygonSignedArea(overlap[0].points)), 100 * 40, 1));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall geometry checks passed');
