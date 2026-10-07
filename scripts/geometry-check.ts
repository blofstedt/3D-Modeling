/**
 * Headless checks for the geometry the app builds. Run with `npm test`.
 */
import * as THREE from 'three';
import { Body3D, Point2D } from '../src/types';
import { buildBodyGeometry } from '../src/utils/bodyGeometry';
import { getPolygonSignedArea } from '../src/utils/geometry';
import { buildOutline, sideRun, wallEnds, withOutline } from '../src/utils/outline';
import { applyEdgeChange, edgeSize, edgesAroundFace, edgesOfKind, findBevel, isWholeGroup, listEdges } from '../src/utils/edges';
import { faceMeasure, setFaceMeasure } from '../src/utils/faces';
import { resizeBody, transformBody } from '../src/utils/transform';
import { joinBodies } from '../src/utils/join';
import { bendThrough, copyTransforms, defaultSession, makeCopies, spacing, stops, withSpacing } from '../src/utils/repeat';
import { RepeatSession } from '../src/types';

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
check('a sharp corner gets a corner bevel that follows the edges', (bevelled.cornerBevels ?? []).some((c) => c.vertex === 0 && c.size === 8) && bevelled.cornerRadii![0] === 0);
const removed = { ...bevelled, ...applyEdgeChange(bevelled, wallEdges, { size: 0 }) } as Body3D;
check('removing the bevel keeps the curve', near(removed.cornerRadii![1], 25, 0.01) && !(removed.edgeBevels ?? []).length && !(removed.cornerBevels ?? []).length);

// A corner bevel on a plain box removes exactly the rounded strip (1 - pi/4) r^2 per unit height.
const cornerRound = buildBodyGeometry({ ...box, cornerBevels: [{ vertex: 1, size: 8, style: 'round' }] } as Body3D)!;
check('corner bevel (round) volume', near(100 * 60 * 40 - volume(cornerRound), (1 - Math.PI / 4) * 64 * 40, 15), `${Math.round(100 * 60 * 40 - volume(cornerRound))}`);
const cornerFlat = buildBodyGeometry({ ...box, cornerBevels: [{ vertex: 1, size: 8, style: 'chamfer' }] } as Body3D)!;
check('corner bevel (flat) volume', near(100 * 60 * 40 - volume(cornerFlat), 0.5 * 64 * 40, 10), `${Math.round(100 * 60 * 40 - volume(cornerFlat))}`);
// Under a rounded top edge the corner bevel carries on along that curve, so it removes a bit more than the straight run.
const withTop = { ...box, edgeBevels: [{ side: 'top' as const, edge: 1, size: 15, style: 'round' as const }] } as Body3D;
const topOnly = 100 * 60 * 40 - volume(buildBodyGeometry(withTop)!);
const both = 100 * 60 * 40 - volume(buildBodyGeometry({ ...withTop, cornerBevels: [{ vertex: 1, size: 6, style: 'round' }] } as Body3D)!);
check('corner bevel follows a curved top edge', both > topOnly + (1 - Math.PI / 4) * 36 * (40 - 15) * 0.9, `${Math.round(topOnly)} -> ${Math.round(both)}`);

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

// A rotated box: the round must not leave slivers of the end walls standing outside the curve.
{
  const ang = 0.3;
  const R = 15;
  const turn = (q: Point2D) => ({ x: q.x * Math.cos(ang) - q.y * Math.sin(ang), y: q.x * Math.sin(ang) + q.y * Math.cos(ang) });
  const tilted = buildBodyGeometry(body({ elevation: 0, points: rect(-50, -30, 50, 30).map(turn), edgeBevels: [{ side: 'top', edge: 0, size: R, style: 'round' }] }))!;
  const pos = tilted.getAttribute('position');
  let fins = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const loc = [0, 1, 2].map((k) => {
      const x = pos.getX(i + k);
      const y = -pos.getZ(i + k);
      return { u: x * Math.cos(ang) + y * Math.sin(ang), d: -x * Math.sin(ang) + y * Math.cos(ang) + 30, h: pos.getY(i + k) };
    });
    if (!loc.every((l) => Math.abs(Math.abs(l.u) - 50) < 0.05)) continue;
    const d = (loc[0].d + loc[1].d + loc[2].d) / 3;
    const h = (loc[0].h + loc[1].h + loc[2].h) / 3;
    if (d < R && h > 40 - R && Math.hypot(R - d, h - (40 - R)) > R + 0.05) fins++;
  }
  check('round on a rotated box leaves no end-wall slivers', fins === 0, `${fins} sliver triangles`);
}

// A shape with a square cutout: its edges can be picked, beveled and rounded, and its walls pushed.
{
  const hole = rect(-20, -20, 20, 20);
  const plate = body({ id: 'p', points: rect(-60, -60, 60, 60), holes: [hole], extrusionHeight: 20 });
  const holeEdges = listEdges(plate).filter((e) => e.index >= 1000);
  check('hole has an edge per side at the top and bottom, and four corners', holeEdges.filter((e) => e.kind === 'top').length === 4 && holeEdges.filter((e) => e.kind === 'bottom').length === 4 && holeEdges.filter((e) => e.kind === 'corner').length === 4, holeEdges.map((e) => e.kind + e.index).join(' '));
  const flat = volume(buildBodyGeometry(plate)!);
  check('plate with a hole volume', near(flat, (120 * 120 - 40 * 40) * 20, 1), String(flat));

  const sideSel = { bodyId: 'p', kind: 'top' as const, index: 1000 };
  const oneSide = { ...plate, ...applyEdgeChange(plate, [sideSel], { size: 5, style: 'round' }) };
  const oneCut = flat - volume(buildBodyGeometry(oneSide)!);
  check('one hole edge rounds on its own', oneCut > 20 && oneCut < 400 && !!findBevel(oneSide, 'top', 1000) && !findBevel(oneSide, 'top', 1001), String(oneCut));
  const rimSel = edgesOfKind(plate, 'top').filter((e) => e.index >= 1000);
  const rounded = { ...plate, ...applyEdgeChange(plate, rimSel, { size: 5, style: 'round' }) };
  const cutRim = flat - volume(buildBodyGeometry(rounded)!);
  // Rounding a 160 mm loop with r = 5 removes (1 - pi/4) * r^2 per mm of length, a bit more at the mitred corners.
  check('rounding a hole rim removes material from the rim', cutRim > 200 && cutRim < 1200, String(cutRim));
  const g = buildBodyGeometry(rounded)!;
  check('bevelled hole is a closed solid', g.attributes.position.count > 0);

  const corner = { bodyId: 'p', kind: 'corner' as const, index: 1000 };
  const roundedCorner = { ...plate, ...applyEdgeChange(plate, [corner], { size: 8 }) };
  check('hole corner rounds in plan', (roundedCorner.holes?.[0].length ?? 0) > 4 && volume(buildBodyGeometry(roundedCorner)!) > flat);
  check('rounded hole corner reads back its radius', near(edgeSize(roundedCorner, corner), 8, 0.01));
  const both = { ...roundedCorner, ...applyEdgeChange(roundedCorner, [{ bodyId: 'p', kind: 'bottom' as const, index: 1000 }], { size: 3, style: 'chamfer' }) };
  check('rim bevel on a rounded hole builds', volume(buildBodyGeometry(both)!) < volume(buildBodyGeometry(roundedCorner)!));
  check('a rounded hole corner joins its two sides into one edge', edgesOfKind(roundedCorner, 'top').filter((e) => e.index >= 1000).length === 3);

  const wall = { bodyId: 'p', kind: 'wall' as const, index: 1000 };
  const around = edgesAroundFace(plate, wall);
  check('hole wall edges are its rims and two corners', around.length === 4 && around.every((e) => e.index >= 1000));
  const m = faceMeasure(plate, wall)!;
  check('hole wall measures the hole', near(m.value, 40, 0.01), String(m.value));
  const widened = { ...plate, ...setFaceMeasure(plate, wall, 60)! };
  const xs = widened.holes!.flat().map((p) => p.y);
  check('typing a bigger size grows the hole', near(Math.max(...xs) - Math.min(...xs), 60, 1.01), xs.join(','));
  const moved = { ...plate, ...transformBody(plate, { dx: 10, dy: 5, dz: 0, angle: 0.4, cx: 0, cy: 0 }) };
  const roundedMoved = { ...roundedCorner, ...transformBody(roundedCorner, { dx: 10, dy: 5, dz: 0, angle: 0.4, cx: 0, cy: 0 }) };
  check('moving keeps hole rounding editable', near(edgeSize(roundedMoved, corner), 8, 0.01) && !!moved.holes);
}

// A cylinder is a square rounded all the way: its walls still have to be grabbable to resize it.
{
  const cyl = body({ ...withOutline({ points: rect(-20, -20, 20, 20) }, { cornerRadii: [20, 20, 20, 20] }) });
  const ends = wallEnds(cyl, 0);
  check('a cylinder wall still has handle ends', !!ends && Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y) > 30);
}


// Repeat: copies are equally spaced along the path, on curves too.
{
  const base = defaultSession(body({ id: 'r' }));
  check('default repeat has the original plus copies in a row', stops(base).length === 4 && stops(base).every((p) => near(p.y, 0, 0.01)));
  const gaps = (s: RepeatSession) => stops(s).slice(1).map((p, i) => Math.hypot(p.x - stops(s)[i].x, p.y - stops(s)[i].y));
  const line = gaps(base);
  check('straight repeat gaps are equal', line.every((g) => near(g, line[0], 0.01)), line.join(','));
  const bent: RepeatSession = { ...base, count: 9, bend: bendThrough(base, { x: base.start.x + (base.end.x - base.start.x) / 2, y: 90 }) };
  const arc = stops(bent).slice(1).map((p, i) => Math.hypot(p.x - stops(bent)[i].x, p.y - stops(bent)[i].y));
  // Chords of an even-arc split are near-equal; a split by curve parameter is visibly lumpy.
  check('curved repeat gaps are equal along the curve', Math.max(...arc) - Math.min(...arc) < 0.02 * Math.max(...arc), arc.join(','));
  const last = stops(bent)[8];
  check('the last copy lands on the path end', near(last.x, bent.end.x, 0.2) && near(last.y, bent.end.y, 0.2));
  const wider = withSpacing(bent, spacing(bent) * 2);
  check('typing a gap stretches the path', near(spacing(wider), spacing(bent) * 2, 0.5), `${spacing(wider)} vs ${spacing(bent) * 2}`);
  const ring: RepeatSession = { ...base, kind: 'around', end: { x: 0, y: 100 }, count: 6, start: { x: 0, y: 0 } };
  const rs = stops(ring);
  check('around puts every copy on one circle', rs.every((p) => near(Math.hypot(p.x, p.y - 100), 100, 0.01)));
  check('around spreads the copies evenly', near(Math.hypot(rs[1].x - rs[0].x, rs[1].y - rs[0].y), 100, 0.01));
  const src = body({ id: 'r' });
  const copies = makeCopies(src, { ...base, follow: false }, 1);
  check('copies keep the shape and move only', copies.length === 3 && near(copies[0].points[0].x - src.points[0].x, spacing(base), 0.01) && copies[0].extrusionHeight === src.extrusionHeight);
  check('copy transforms match the copy count', copyTransforms(ring).length === 5);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall geometry checks passed');
