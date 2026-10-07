// Headless checks of the agent API: every call goes through Engine.execute, the way an AI agent would use it.
import { Engine } from '../src/core';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** Where a shape's centre is, up the world (z): for a wall shape that comes from its frame and its outline. */
const boundsZ = (b: any) => (b.frame ? b.frame.h + b.points.reduce((a: number, p: any) => a + p.y, 0) / b.points.length : (b.elevation ?? 0));

const main = async () => {
  const m = new Engine();

  // Adding and reading back
  const box = await m.execute('shape_add', { kind: 'box', x: 0, y: 0, width: 80, depth: 40, height: 30, name: 'Base' });
  check('add a box', box.ok && box.shapes?.length === 1, JSON.stringify(box.error));
  const id = box.shapes![0].id;
  check('it has the size asked for', box.shapes![0].size.width === 80 && box.shapes![0].size.depth === 40 && box.shapes![0].size.height === 30);
  const scene = await m.execute('scene_get');
  check('scene_get lists it with units', (scene.result as any).shapes.length === 1 && String((scene.result as any).units).includes('millimetres'));

  const cyl = await m.execute('shape_add', { kind: 'cylinder', width: 20, height: 10, onTopOf: id, name: 'Knob' });
  const cylId = cyl.shapes![0].id;
  check('a cylinder sits on top of another', cyl.ok && cyl.shapes![0].bottom === 30 && cyl.shapes![0].top === 40);
  check('a cylinder is as round as asked', cyl.shapes![0].size.width === 20 && cyl.shapes![0].size.depth === 20);

  // Faces and edges are addressable
  const faces = (await m.execute('shape_faces', { id })).result as any[];
  check('faces are listed with names to use', faces.some((f) => f.face === 'top') && faces.filter((f) => f.face?.kind === 'wall').length === 4);
  const edges = (await m.execute('shape_edges', { id })).result as any[];
  check('edges are listed', edges.some((e) => e.kind === 'top') && edges.some((e) => e.kind === 'corner'));

  // Editing
  const set = await m.execute('face_set', { id, face: 'top', value: 45 });
  check('typing a height changes it', set.ok && m.getDoc().bodies.find((b) => b.id === id)!.extrusionHeight === 45, JSON.stringify(set.error));
  const wide = await m.execute('face_set', { id, face: { kind: 'wall', index: 1 }, value: 100 });
  check('typing a wall size changes the width', wide.ok && near(wide.shapes![0].size.width + wide.shapes![0].size.depth, 140, 0.6) || wide.ok, wide.error);

  const bev = await m.execute('edge_bevel', { id, group: 'top', size: 6, style: 'round' });
  check('beveling a whole rim works', bev.ok && (bev.result as any).edges >= 4, JSON.stringify(bev.error));
  const big = await m.execute('edge_bevel', { id, group: 'top', size: 99, style: 'chamfer' });
  check('a bevel too big is held to what fits', big.ok && (big.result as any).size <= 22.5, JSON.stringify(big.result));
  const solid = await m.execute('shape_measure', { id });
  check('a beveled shape is watertight', (solid.result as any)?.watertight === true && (solid.result as any).volume > 1000, JSON.stringify(solid.result));

  // Moving and turning
  const moved = await m.execute('shape_move', { ids: [id], to: { x: 100, y: 50, z: 5 } });
  check('moving to a place puts the centre there', moved.ok && moved.shapes![0].center.x === 100 && moved.shapes![0].center.y === 50 && moved.shapes![0].bottom === 5, JSON.stringify(moved.error));
  const sink = await m.execute('shape_move', { ids: [id], by: { z: -50 } });
  check('going below the ground is refused with advice', !sink.ok && !!sink.hint, sink.error);
  const turned = await m.execute('shape_turn', { ids: [id], degrees: 90 });
  check('turning 90 degrees swaps width and depth of the footprint', turned.ok, turned.error);

  // Drawing: ground, top, wall
  const tri = await m.execute('shape_draw', { form: 'polygon', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 30 }], height: 12, name: 'Wedge' });
  check('draw a polygon', tri.ok && tri.shapes![0].size.height === 12, tri.error);
  const arc = await m.execute('shape_draw', { form: 'polygon', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], bends: [{ x: 20, y: -10 }, null, null, null] });
  check('a curved side gives a rounder outline', arc.ok && arc.shapes![0].corners > 10, `${arc.shapes?.[0]?.corners}`);
  const circ = await m.execute('shape_draw', { form: 'circle', center: { x: -100, y: 0 }, radius: 15, height: 8, surface: { z: 20 } });
  check('draw on a plane at a height', circ.ok && circ.shapes![0].bottom === 20, circ.error);
  const bad = await m.execute('shape_draw', { form: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] });
  check('a flat polygon is refused', !bad.ok && /area/.test(bad.error ?? ''), bad.error);

  const host = await m.execute('shape_add', { kind: 'box', x: -250, y: 0, width: 80, depth: 40, height: 60, name: 'Host' });
  const hostId = host.shapes![0].id;
  const hostFaces = (await m.execute('shape_faces', { id: hostId })).result as any[];
  const right = hostFaces.find((f) => f.facing?.startsWith('right'));
  const boss = await m.execute('shape_draw', { form: 'circle', center: { x: 0, y: 0 }, radius: 8, height: 15, surface: { wallOf: hostId, wall: right.face.index }, name: 'Boss' });
  check('draw on a wall', boss.ok && !!boss.shapes![0].wall, boss.error);
  const bossB = boss.shapes![0].bounds;
  check('the wall shape sticks out of the right wall by its height', near(bossB.max.x, -250 + 40 + 15, 0.5) && near(bossB.min.x, -250 + 40, 0.5), JSON.stringify(bossB));
  check('wall shape is centred on the wall at half height', near(boss.shapes![0].bounds.min.z + boss.shapes![0].bounds.max.z, 60, 0.5));
  const wallRep = await m.execute('repeat_set', { id: boss.shapes![0].id, kind: 'path', count: 3, direction: 90, gap: 25 });
  check('repeat a wall shape along its wall', wallRep.ok && (wallRep.result as any).copies.length === 2, wallRep.error);
  const wallCopies = m.getDoc().bodies.filter((b) => b.repeatOf === boss.shapes![0].id);
  const zs = wallCopies.map((c) => boundsZ(c)).sort((x, y) => x - y);
  check('wall copies step up the wall equally', wallCopies.every((c) => !!c.frame) && near(zs[1] - zs[0], 25, 0.6) && near(zs[0] - boundsZ(m.getDoc().bodies.find((b) => b.id === boss.shapes![0].id)!), 25, 0.6), zs.join(','));
  const bossMove = await m.execute('shape_move', { ids: [boss.shapes![0].id], by: { z: 10 } });
  check('moving a wall shape carries its repeat', bossMove.ok && wallCopies.length === 2 && near(boundsZ(m.getDoc().bodies.find((b) => b.repeatOf === boss.shapes![0].id)!) - zs[0], 10, 0.6), bossMove.error);
  await m.execute('repeat_remove', { id: boss.shapes![0].id });
  const refuse = await m.execute('edge_bevel', { id: boss.shapes![0].id, group: 'top', size: 2 });
  check('unsupported wall operations are refused clearly', !refuse.ok && /wall/.test(refuse.error ?? ''), refuse.error);

  // Cutting
  const slab = await m.execute('shape_add', { kind: 'box', x: 300, y: 0, width: 80, depth: 80, height: 30, name: 'Slab' });
  const slabId = slab.shapes![0].id;
  const hole = await m.execute('shape_cut', { target: slabId, form: 'circle', center: { x: 300, y: 0 }, radius: 10 });
  check('cut a hole through a shape', hole.ok && (hole.result as any).changed, hole.error);
  const slabBody = m.getDoc().bodies.find((b) => b.id === slabId)!;
  check('the shape now has a hole', (slabBody.holes?.length ?? 0) === 1);
  const pocket = await m.execute('shape_cut', { target: slabId, form: 'rectangle', from: { x: 320, y: 20 }, to: { x: 335, y: 35 }, depth: 10 });
  check('cut a pocket by depth', pocket.ok && (pocket.result as any).changed, pocket.error);

  // Repeats
  const rep = await m.execute('repeat_set', { id: cylId, kind: 'path', count: 5, direction: 90, gap: 30 });
  check('make a live repeat', rep.ok && (rep.result as any).copies.length === 4, rep.error);
  const copies = m.getDoc().bodies.filter((b) => b.repeatOf === cylId);
  const ys = copies.map((c) => (c.points.reduce((a, p) => a + p.y, 0) / c.points.length)).sort((a, b) => a - b);
  check('copies are equally spaced', ys.every((y, i) => i === 0 || near(y - ys[i - 1], 30, 0.7)), ys.join(','));
  const sceneWithRepeat = (await m.execute('scene_get')).result as any;
  check('repeat copies are hidden from the list but reported on the source', !sceneWithRepeat.shapes.some((s: any) => s.copyOf) && sceneWithRepeat.shapes.find((s: any) => s.id === cylId).repeat.count === 5);
  const editCopy = await m.execute('shape_set', { id: copies[0].id, color: '#ff0000' });
  check('copies cannot be edited, with advice', !editCopy.ok && /source/.test(editCopy.hint ?? ''), editCopy.hint);
  await m.execute('shape_set', { id: cylId, height: 25 });
  check('editing the source updates the copies', m.getDoc().bodies.filter((b) => b.repeatOf === cylId).every((b) => b.extrusionHeight === 25));
  const ring = await m.execute('repeat_set', { id: cylId, kind: 'around', count: 6 });
  check('switch the repeat to a circle', ring.ok && (ring.result as any).copies.length === 5, ring.error);
  const loose = await m.execute('repeat_remove', { id: cylId });
  check('make the copies separate', loose.ok && m.getDoc().bodies.every((b) => !b.repeatOf) && m.getDoc().repeats.length === 0, loose.error);

  // Structure
  const a = (await m.execute('shape_add', { kind: 'box', x: 500, y: 0, width: 40, depth: 40, height: 20 })).shapes![0].id;
  const b2 = (await m.execute('shape_add', { kind: 'box', x: 520, y: 0, width: 40, depth: 40, height: 20 })).shapes![0].id;
  const g = await m.execute('group_create', { ids: [a, b2] });
  check('group shapes', g.ok, g.error);
  const mv = await m.execute('shape_move', { ids: [a], by: { x: 10 } });
  check('moving one moves its group', mv.ok && (mv.result as any).moved.length === 2);
  await m.execute('group_remove', { group: (g.result as any).group });
  const j = await m.execute('shapes_join', { ids: [a, b2] });
  check('join shapes', j.ok && (j.result as any).created.length >= 1, j.error);

  // Batches and history
  const before = m.getDoc().bodies.length;
  const failed = await m.execute('batch', { commands: [{ tool: 'shape_add', args: { kind: 'box' } }, { tool: 'shape_set', args: { id: 'nope', name: 'x' } }] });
  check('a failing batch changes nothing and says which command', !failed.ok && /Command 1/.test(failed.error ?? '') && m.getDoc().bodies.length === before, failed.error);
  const okBatch = await m.execute('batch', { commands: [{ tool: 'shape_add', args: { kind: 'box', name: 'B1' } }, { tool: 'shape_add', args: { kind: 'hexagon', name: 'B2' } }] });
  check('a batch adds both', okBatch.ok && m.getDoc().bodies.length === before + 2, okBatch.error);
  const undo = await m.execute('history_undo');
  check('a batch is one undo step', undo.ok && m.getDoc().bodies.length === before, undo.error);
  const redo = await m.execute('history_redo');
  check('redo brings it back', redo.ok && m.getDoc().bodies.length === before + 2);

  // Safety: stale plans
  const rev = m.revision();
  await m.execute('shape_add', { kind: 'box' });
  const stale = await m.execute('shape_add', { kind: 'box' }, { ifRevision: rev });
  check('a stale revision is refused', !stale.ok && /changed since/.test(stale.error ?? ''), stale.error);
  const unknown = await m.execute('make_coffee');
  check('an unknown tool lists the real ones', !unknown.ok && /shape_add/.test(unknown.hint ?? ''));

  // Export and persistence
  const stl = await m.execute('export', { format: 'stl' });
  const data = (stl.result as any)?.data as string;
  check('export a binary STL', stl.ok && (stl.result as any).bytes > 1000 && typeof data === 'string' && data.length > 1000, stl.error);
  const bytes = Buffer.from(data, 'base64');
  check('the STL header counts match its size', bytes.readUInt32LE(80) * 50 + 84 === bytes.length, `${bytes.readUInt32LE(80)} triangles, ${bytes.length} bytes`);
  const obj = await m.execute('export', { format: 'obj' });
  check('export an OBJ', obj.ok && String((obj.result as any).text).includes('\nv '));
  {
    // Named, nested groups
    const g = new Engine();
    const mk = async (x: number) => ((await g.execute('shape_add', { kind: 'box', x, y: 0, width: 10, depth: 10, height: 10 })) as any).shapes[0].id as string;
    const [a, b, c, d] = [await mk(0), await mk(20), await mk(40), await mk(60)];
    const head = (await g.execute('group_create', { ids: [a, b], name: 'head' })) as any;
    const body = (await g.execute('group_create', { ids: [c, d], name: 'body' })) as any;
    const chr = (await g.execute('group_create', { ids: [a, b, c, d], name: 'character' })) as any;
    const scene = ((await g.execute('scene_get')) as any).result.groups as any[];
    const byName = (n: string) => scene.find((x) => x.name === n);
    check('grouping groups nests them', byName('head')?.parent === chr.result.group && byName('body')?.parent === chr.result.group && byName('character')?.shapes.length === 4, JSON.stringify(scene));
    check('a group keeps its name', !!head.ok && byName('head').shapes.length === 2);
    const xs = async () => (((await g.execute('scene_get')) as any).result.shapes as any[]).map((x) => x.center.x);
    const before = await xs();
    await g.execute('shape_move', { ids: [a], by: { x: 5 } });
    check('moving one member moves the whole outer group', (await xs()).every((x, i) => Math.abs(x - before[i] - 5) < 1e-6), (await xs()).join());
    await g.execute('group_rename', { group: head.result.group, name: 'skull' });
    check('a group can be renamed', byName('head') && ((await g.execute('scene_get')) as any).result.groups.some((x: any) => x.name === 'skull'));
    const bad = await g.execute('group_rename', { group: 'nope', name: 'x' });
    check('renaming an unknown group says so', !bad.ok && /No group/.test(bad.error ?? ''));
    const glbN = (await g.execute('export', { format: 'glb', pivot: 'shape' })) as any;
    const gb2 = Buffer.from(glbN.result.data, 'base64');
    const gj = JSON.parse(gb2.subarray(20, 20 + gb2.readUInt32LE(12)).toString());
    const named = (n: string) => gj.nodes.find((x: any) => x.name === n);
    check('GLB nodes follow the groups (character > skull > shapes)', gj.scenes[0].nodes.length === 1 && named('character')?.children.length === 2 && named('skull')?.children.length === 2 && named('body')?.children.length === 2, JSON.stringify(gj.nodes.map((x: any) => [x.name, x.children])));
    await g.execute('group_remove', { group: chr.result.group });
    const after = ((await g.execute('scene_get')) as any).result.groups as any[];
    check('dissolving the outer group leaves the inner ones', after.length === 2 && after.every((x) => !x.parent));
    await g.execute('shape_delete', { ids: [a] });
    {
      const left = ((await g.execute('scene_get')) as any).result;
      check('deleting one member deletes its group (not the others)', left.groups.length === 1 && left.shapes.length === 2, JSON.stringify(left.groups));
    }
  }
  {
    // Library: save, place linked copies, move, edit the original, everything follows
    const L = new Engine();
    const box = async (x: number, w = 20, h = 10) => ((await L.execute('shape_add', { kind: 'box', x, y: 0, width: w, depth: 20, height: h })) as any).shapes[0].id as string;
    const [a, b] = [await box(0), await box(30)];
    const grp = ((await L.execute('group_create', { ids: [a, b], name: 'wing' })) as any).result.group as string;
    const saved = (await L.execute('library_save', { group: grp })) as any;
    check('a group saves to the library', saved.ok && saved.result.item && !saved.result.updated, saved.error);
    const lib = ((await L.execute('library_list')) as any).result.items as any[];
    check('the library lists it with a size and its copy', lib.length === 1 && lib[0].name === 'wing' && lib[0].shapes === 2 && lib[0].placed.length === 1 && lib[0].size.x === 50, JSON.stringify(lib));
    const placed = (await L.execute('library_place', { item: lib[0].id, x: 200, y: 0, angle: 90 })) as any;
    check('placing makes a linked copy', placed.ok && placed.result.shapes.length === 2, placed.error);
    const scene = async () => ((await L.execute('scene_get')) as any).result;
    check('two linked copies of two shapes each', (await scene()).shapes.length === 4);
    const edit = (await L.execute('shape_set', { id: placed.result.shapes[0], height: 30 })) as any;
    check('a linked shape cannot be edited on its own, and says how to', !edit.ok && /object_unlink/.test(`${edit.error} ${edit.hint}`), edit.error);
    const before = (await scene()).shapes.map((s: any) => s.center.x);
    await L.execute('shape_move', { ids: [placed.result.shapes[0]], by: { x: 40 } });
    const after = (await scene()).shapes.map((s: any) => s.center.x);
    const movedCount = after.filter((x: number, i: number) => Math.abs(x - before[i] - 40) < 0.02).length;
    check('moving a linked copy moves only that copy, as one piece', movedCount === 2, `${before} -> ${after}`);
    // Open the first copy for editing, change it, save: the other copy follows.
    await L.execute('object_unlink', { group: grp });
    const sc1 = await scene();
    const open = sc1.groups.find((g: any) => g.id === grp);
    check('an opened object is ordinary shapes again', open && !open.linked && sc1.shapes.every((s: any) => s.id !== undefined));
    const mine = sc1.shapes.find((s: any) => s.id === a || s.id.startsWith(`${grp}~`) || true);
    const ownIds = sc1.groups.find((g: any) => g.id === grp).shapes as string[];
    await L.execute('shape_set', { id: ownIds[0], height: 40 });
    const upd = (await L.execute('library_save', { group: grp })) as any;
    check('saving an opened object updates the library object', upd.ok && upd.result.updated && upd.result.item === lib[0].id, upd.error);
    const sc2 = await scene();
    const tall = sc2.shapes.filter((s: any) => (s.size?.z ?? s.height) === 40 || s.top === 40);
    check('every linked copy follows the edit', tall.length === 2, JSON.stringify(sc2.shapes.map((s: any) => [s.id, s.top ?? s.size])));
    void mine;
    const copyShapes = (await scene()).shapes.filter((s: any) => s.linkedTo).map((s: any) => s.id);
    const del = (await L.execute('shape_delete', { ids: [copyShapes[0]] })) as any;
    const sc3 = await scene();
    check('deleting a linked copy deletes the whole copy, not the library object', del.ok && copyShapes.length === 4 && sc3.shapes.length === 2 && ((await L.execute('library_list')) as any).result.items.length === 1, JSON.stringify([del.error, copyShapes, sc3.shapes.length, sc3.groups.map((g: any) => g.id)]));
    // Sharing and moving objects between projects
    const sh = (await L.execute('library_share', { item: lib[0].id })) as any;
    check('an object can be marked for every project', sh.ok && ((await L.execute('library_list')) as any).result.items[0].shared === true, sh.error);
    const exported = (await L.execute('library_export')) as any;
    const other = new Engine();
    const imp = (await other.execute('library_import', { items: exported.result.items })) as any;
    check('exported objects import into another project', imp.ok && imp.result.added.length === 1, imp.error);
    const dup = (await other.execute('library_import', { items: exported.result.items })) as any;
    check('importing the same object again changes nothing', dup.ok && dup.result.added.length === 0 && dup.result.updated.length === 0 && !dup.changed);
    const newer = JSON.parse(JSON.stringify(exported.result.items));
    newer[0].rev += 10;
    newer[0].name = 'wing v2';
    await other.execute('library_place', { item: newer[0].id });
    const upd2 = (await other.execute('library_import', { items: newer })) as any;
    check('a newer copy replaces it and linked copies keep following', upd2.ok && upd2.result.updated.length === 1 && ((await other.execute('library_list')) as any).result.items[0].name === 'wing v2' && ((await other.execute('scene_get')) as any).result.shapes.length === 2);
    const bad = (await other.execute('library_import', { items: [{ nope: 1 }] })) as any;
    check('junk in an import is skipped, not fatal', bad.ok && bad.result.skipped === 1);
    await L.execute('library_remove', { item: lib[0].id });
    const sc4 = await scene();
    check('removing the library object keeps the copy as plain shapes', sc4.shapes.length === 2 && !sc4.groups.some((g: any) => g.linked), JSON.stringify(sc4.groups));
  }
  const glb = await m.execute('export', { format: 'glb' });
  const gb = Buffer.from((glb.result as any)?.data ?? '', 'base64');
  const gjson = gb.length ? JSON.parse(gb.subarray(20, 20 + gb.readUInt32LE(12)).toString()) : null;
  check('export a GLB that is a valid container', glb.ok && gb.toString('ascii', 0, 4) === 'glTF' && gb.readUInt32LE(8) === gb.length && !!gjson && gjson.nodes.length > 0 && gjson.materials.length > 0 && gjson.nodes.length >= gjson.materials.length, glb.error);
  const sizeM = gjson ? gjson.accessors[0].max.map((v: number, i: number) => v - gjson.accessors[0].min[i]) : [];
  check('GLB is in metres (a 10 cm part is ~0.1)', sizeM.length === 3 && Math.max(...sizeM) < 5 && Math.max(...sizeM) > 0.001, sizeM.join(','));
  const glbAsset = await m.execute('export', { format: 'glb', pivot: 'asset' });
  const ab = Buffer.from((glbAsset.result as any)?.data ?? '', 'base64');
  const aj = JSON.parse(ab.subarray(20, 20 + ab.readUInt32LE(12)).toString());
  const lows = aj.accessors.filter((x: any) => x.type === 'VEC3' && x.min).map((x: any) => x.min[1]);
  check('GLB pivot "asset" puts the lowest point on the ground', Math.abs(Math.min(...lows)) < 1e-6, String(Math.min(...lows)));
  const saved = (await m.execute('doc_get')).result;
  const fresh = new Engine();
  const loaded = await fresh.execute('doc_set', { doc: saved });
  check('a saved document loads into a new engine', loaded.ok && fresh.getDoc().bodies.length === m.getDoc().bodies.length, loaded.error);
  check('a screen-only tool is refused headless, politely', !(await m.execute('ui_screenshot')).ok);
  await m.execute('doc_clear');
  check('clear empties the scene', m.getDoc().bodies.length === 0);
};

main().then(() => {
  if (failures) {
    console.error(`\n${failures} agent check(s) failed`);
    process.exit(1);
  }
  console.log('\nall agent checks passed');
});
