// Prints real parts through a real slicer (PrusaSlicer's CLI) and a mesh checker (ADMesh), so "watertight" is judged by
// software we did not write. Skips cleanly when they are not installed.
//   sudo apt install prusa-slicer admesh      npm run test:slicer
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Engine } from '../src/core';

const has = (cmd: string) => spawnSync('which', [cmd]).status === 0;
if (!has('prusa-slicer') || !has('admesh')) {
  console.log('skip  prusa-slicer or admesh is not installed (apt install prusa-slicer admesh)');
  process.exit(0);
}

const dir = join('.scratch', 'slicer-parts');
mkdirSync(dir, { recursive: true });
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

type Step = [string, Record<string, unknown>];
interface Part {
  name: string;
  /** Commands, run in order. `$1` in a later command's id is the first shape made. */
  steps: Step[];
  /** The size the slicer should measure: [x, y, z] mm. */
  size: [number, number, number];
  /** How many separate solids the slicer should find (touching meshes count separately). */
  parts?: number;
  /** A shape where our own check already knows there is a gap: reported, not failed. */
  knownGap?: string;
}

const L = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 50 }, { x: 0, y: 50 }];
const parts: Part[] = [
  { name: 'plate', size: [80, 40, 6], steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 80, depth: 40, height: 6 }]] },
  { name: 'rounded-rim', size: [60, 60, 30], steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 60, depth: 60, height: 30 }], ['edge_bevel', { id: '$1', group: 'top', size: 6, style: 'round' }]] },
  {
    name: 'chamfer-top-and-bottom',
    size: [50, 50, 20],
    steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 50, depth: 50, height: 20 }], ['edge_bevel', { id: '$1', group: 'top', size: 4, style: 'chamfer' }], ['edge_bevel', { id: '$1', group: 'bottom', size: 3, style: 'round' }]],
  },
  {
    name: 'washer',
    size: [40, 40, 10],
    steps: [['shape_add', { kind: 'cylinder', x: 0, y: 0, width: 40, height: 10 }], ['shape_cut', { target: '$1', form: 'circle', center: { x: 0, y: 0 }, radius: 8 }], ['edge_bevel', { id: '$1', group: 'top', size: 1.5, style: 'chamfer' }]],
  },
  {
    name: 'l-bracket-with-holes',
    size: [60, 50, 12],
    steps: [
      ['shape_draw', { form: 'polygon', points: L, height: 12 }],
      ['shape_cut', { target: '$1', form: 'circle', center: { x: 45, y: 7.5 }, radius: 3 }],
      ['shape_cut', { target: '$1', form: 'circle', center: { x: 7.5, y: 40 }, radius: 3 }],
      ['edge_bevel', { id: '$1', group: 'top', size: 1, style: 'chamfer' }],
    ],
  },
  { name: 'pocketed-block', size: [60, 40, 25], parts: 2, steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 60, depth: 40, height: 25 }], ['shape_cut', { target: '$1', form: 'rectangle', from: { x: -15, y: -10 }, to: { x: 15, y: 10 }, depth: 10 }]] },
  {
    name: 'joined-overlapping-boxes',
    size: [100, 40, 20],
    steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 60, depth: 40, height: 20 }], ['shape_add', { kind: 'box', x: 40, y: 0, width: 60, depth: 40, height: 20 }], ['shapes_join', { ids: ['$1', '$2'] }]],
  },
  { name: 'repeat-row-of-pegs', size: [90, 10, 10], parts: 5, steps: [['shape_add', { kind: 'cylinder', x: 0, y: 0, width: 10, height: 10 }], ['repeat_set', { id: '$1', count: 5, direction: 0, gap: 20 }]] },
  {
    name: 'boss-on-a-wall',
    size: [90, 40, 60],
    parts: 2,
    steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 80, depth: 40, height: 60 }], ['shape_draw', { form: 'circle', center: { x: 0, y: 0 }, radius: 8, height: 10, surface: { wallOf: '$1', wall: 1 } }]],
  },
  {
    name: 'curved-side',
    size: [40, 50, 10],
    steps: [['shape_draw', { form: 'polygon', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], bends: [{ x: 20, y: -10 }, null, null, null], height: 10 }]],
  },
  { name: 'hexagon-nut', size: [34.64, 40, 12], steps: [['shape_add', { kind: 'hexagon', x: 0, y: 0, width: 40, height: 12 }], ['shape_cut', { target: '$1', form: 'circle', center: { x: 0, y: 0 }, radius: 6 }]] },
  { name: 'tall-pillar', size: [10, 10, 120], steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 10, depth: 10, height: 120 }], ['edge_bevel', { id: '$1', group: 'top', size: 2, style: 'round' }]] },
  { name: 'rounded-corners', size: [60, 40, 10], steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 60, depth: 40, height: 10 }], ['shape_set', { id: '$1', cornerRadius: 8 }], ['edge_bevel', { id: '$1', group: 'top', size: 1.5, style: 'round' }]] },
  {
    name: 'unequal-neighbouring-bevels',
    size: [60, 40, 30],
    steps: [['shape_add', { kind: 'box', x: 0, y: 0, width: 60, depth: 40, height: 30 }], ['edge_bevel', { id: '$1', edges: [{ kind: 'top', index: 0 }], size: 3, style: 'round' }], ['edge_bevel', { id: '$1', edges: [{ kind: 'top', index: 1 }], size: 8, style: 'round' }]],
  },
];

const parseInfo = (text: string) => {
  const get = (k: string) => Number(new RegExp(`^${k}\\s*=\\s*(-?[\\d.e+-]+)`, 'm').exec(text)?.[1] ?? NaN);
  return {
    size: [get('size_x'), get('size_y'), get('size_z')] as [number, number, number],
    minZ: get('min_z'),
    facets: get('number_of_facets'),
    manifold: /manifold = yes/.test(text),
    parts: get('number_of_parts'),
    volume: get('volume'),
    openEdges: Number(/open_edges = (\d+)/.exec(text)?.[1] ?? 0),
  };
};

const main = async () => {
  console.log(`using ${spawnSync('prusa-slicer', ['--help'], { encoding: 'utf8' }).stdout.split('\n')[0]}\n`);
  const rows: string[] = [];
  for (const part of parts) {
    const m = new Engine();
    let first = '';
    let second = '';
    let ok = true;
    for (const [tool, raw] of part.steps) {
      const args = JSON.parse(JSON.stringify(raw).replaceAll('"$1"', JSON.stringify(first)).replaceAll('"$2"', JSON.stringify(second)));
      const r = await m.execute(tool, args);
      if (!r.ok) {
        ok = false;
        check(`${part.name}: ${tool}`, false, r.error);
        break;
      }
      if (!first && r.shapes?.length) first = r.shapes[0].id;
      else if (!second && tool === 'shape_add' && r.shapes?.length) second = r.shapes[0].id;
    }
    if (!ok) continue;
    const stl = await m.execute('export', { format: 'stl' });
    if (!stl.ok) {
      check(`${part.name}: export`, false, stl.error);
      continue;
    }
    const file = join(dir, `${part.name}.stl`);
    writeFileSync(file, Buffer.from((stl.result as any).data, 'base64'));

    // What our own measure says, for comparison with the slicer's.
    const doc = m.getDoc();
    let ours = 0;
    for (const b of doc.bodies.filter((x) => x.visible)) ours += ((await m.execute('shape_measure', { id: b.id })).result as any)?.volume ?? 0;

    const info = parseInfo(spawnSync('prusa-slicer', ['--info', file], { encoding: 'utf8' }).stdout);
    const adm = spawnSync('admesh', [file], { encoding: 'utf8' }).stdout;
    const admN = (label: string) => Number(new RegExp(`${label}\\s*:\\s*(\\d+)`).exec(adm)?.[1] ?? NaN);
    const gcode = join(dir, `${part.name}.gcode`);
    const sliced = spawnSync('prusa-slicer', ['--export-gcode', '--output', gcode, file], { encoding: 'utf8' });
    const g = existsSync(gcode) ? readFileSync(gcode, 'utf8') : '';
    const layers = (g.match(/;LAYER_CHANGE/g) ?? []).length;
    const warn = `${sliced.stdout}${sliced.stderr}`.split('\n').filter((l) => /warn|error|repair|fail/i.test(l) && !/^\d+ =>/.test(l)).join('; ');

    const clean = admN('Degenerate facets') === 0 && admN('Edges fixed') === 0 && admN('Facets removed') === 0 && admN('Facets reversed') === 0 && admN('Backwards edges') === 0 && admN('Total disconnected facets') === 0;
    const sizeOk = info.size.every((v, i) => near(v, part.size[i], 0.6));
    const hard = (n: string, v: boolean, d = '') => (part.knownGap ? console.log(`note  ${n}${v ? '' : ' — known gap'}${d ? `  (${d})` : ''}`) : check(n, v, d));
    console.log(`\n${part.name}: ${info.facets} facets, volume ${info.volume.toFixed(0)} mm³ (our measure ${ours.toFixed(0)}), ${layers} layers`);
    hard(`${part.name}: slicer says manifold`, info.manifold, `open edges ${info.openEdges}`);
    hard(`${part.name}: ADMesh finds nothing to repair`, clean, adm.split('\n').filter((l) => /Degenerate|Edges fixed|Facets removed|Backwards|disconnected/.test(l)).map((l) => l.replace(/\s+/g, ' ').trim()).join(' | '));
    if (part.knownGap) console.log(`      (${part.knownGap})`);
    else {
      check(`${part.name}: size is ${part.size.join(' × ')} mm`, sizeOk, info.size.map((v) => v.toFixed(2)).join(' × '));
      check(`${part.name}: sits on the bed (z min 0)`, near(info.minZ, 0, 0.01), String(info.minZ));
      check(`${part.name}: ${part.parts ?? 1} solid(s)`, info.parts === (part.parts ?? 1), `${info.parts}`);
      check(`${part.name}: volume agrees with ours`, ours > 0 && Math.abs(info.volume - ours) / ours < 0.01, `${info.volume.toFixed(0)} vs ${ours.toFixed(0)}`);
      check(`${part.name}: slices to G-code`, layers > 5 && g.includes('G1') && !/error/i.test(warn), `${layers} layers${warn ? `, ${warn}` : ''}`);
      const lastZ = Number([...g.matchAll(/^;Z:([\d.]+)/gm)].pop()?.[1] ?? NaN);
      check(`${part.name}: top layer reaches the part's height`, near(lastZ, part.size[2], 0.35), `${lastZ} vs ${part.size[2]}`);
    }
    rows.push(`${part.name}`);
  }
  if (failures) {
    console.error(`\n${failures} slicer check(s) failed`);
    process.exit(1);
  }
  console.log('\nall slicer checks passed');
};
void main();
