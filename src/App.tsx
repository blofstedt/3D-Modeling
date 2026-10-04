/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BevelStyle,
  Body3D,
  EdgeSel,
  FaceSel,
  Point2D,
  RepeatConfig,
  ShapeGroup,
  SWATCHES,
} from './types';
import ModelViewer3D from './components/ModelViewer3D';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import TopBar from './components/TopBar';
import CutModal from './components/CutModal';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import RepeatPatternModal from './components/RepeatPatternModal';
import { useHistory } from './hooks/useHistory';
import { cutShape, mergeShapes, calculateLinearPattern, calculateCurvedPattern } from './utils/geometry';
import { withOutline } from './utils/outline';
import { extrudeFace, setFaceMeasure } from './utils/faces';
import { SHAPE_LABELS, ShapeKind, primitiveOutline } from './utils/primitives';
import { applyEdgeChange, edgeKey } from './utils/edges';
import { BodyTransform, resizeBody, selectionBounds, transformBody } from './utils/transform';
import {
  Box,
  Focus,
  Info,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Redo2,
  Rotate3d,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';

interface Doc {
  bodies: Body3D[];
  groups: ShapeGroup[];
}

const STORAGE_KEY = 'craft3d:document:v3';

// The starter scene is one plain block.
const createStarterBodies = (): Body3D[] => {
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

const loadInitialDoc = (): Doc => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Doc;
      if (Array.isArray(parsed.bodies) && Array.isArray(parsed.groups)) return parsed;
    }
  } catch {
    // storage unavailable or corrupt: fall through to the starter scene
  }
  return { bodies: createStarterBodies(), groups: [] };
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
};

export default function App() {
  const [doc, setDoc] = useState<Doc>(loadInitialDoc);
  const { bodies, groups } = doc;

  const setBodies = useCallback(
    (update: Body3D[] | ((prev: Body3D[]) => Body3D[])) =>
      setDoc((d) => ({ ...d, bodies: typeof update === 'function' ? update(d.bodies) : update })),
    []
  );
  const setGroups = useCallback(
    (update: ShapeGroup[] | ((prev: ShapeGroup[]) => ShapeGroup[])) =>
      setDoc((d) => ({ ...d, groups: typeof update === 'function' ? update(d.groups) : update })),
    []
  );

  const history = useHistory(doc, setDoc);

  // Autosave
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        // storage full or blocked: not fatal
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [doc]);

  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [selectedBodyIds, setSelectedBodyIds] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<EdgeSel[]>([]);
  const [selectedFace, setSelectedFace] = useState<FaceSel | null>(null);
  /** When set, only these bodies are shown, in both 2D and 3D. */
  const [isolatedIds, setIsolatedIds] = useState<string[] | null>(null);
  const [hint, setHint] = useState('');
  /** Which bar menu is open (one at a time). */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  /** The X / Y / Z move arrows, toggled with a two-finger tap. */
  const [moveOn, setMoveOn] = useState(false);

  const [isCutModalOpen, setIsCutModalOpen] = useState(false);
  /** Shapes waiting on the "Delete?" confirmation. */
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);

  const [repeatConfig, setRepeatConfig] = useState<RepeatConfig>({
    type: 'linear',
    count: 4,
    startPoint: null,
    controlPoint: null,
    endPoint: null,
    followCurve: true,
    isDrawingLine: false,
    drawingStep: 'start',
  });

  // Toasts
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const bodyCounter = useRef(bodies.length);

  // Isolation hides the rest of the scene from the viewport.
  const displayBodies = useMemo(
    () => (isolatedIds ? bodies.filter((b) => isolatedIds.includes(b.id)) : bodies),
    [bodies, isolatedIds]
  );

  // Once the pattern path has been drawn in the viewport, bring the dialog back to finish the job.
  useEffect(() => {
    if (repeatConfig.drawingStep === 'done' && !repeatConfig.isDrawingLine) setIsRepeatModalOpen(true);
  }, [repeatConfig.drawingStep, repeatConfig.isDrawingLine]);

  // Drop selections and isolation that no longer exist (after delete / undo).
  useEffect(() => {
    const ids = new Set(bodies.map((b) => b.id));
    setSelectedBodyIds((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))));
    setSelectedBodyId((prev) => (prev && !ids.has(prev) ? null : prev));
    setSelectedEdges((prev) => (prev.every((e) => ids.has(e.bodyId)) ? prev : prev.filter((e) => ids.has(e.bodyId))));
    setSelectedFace((prev) => (prev && !ids.has(prev.bodyId) ? null : prev));
    setIsolatedIds((prev) => {
      if (!prev) return prev;
      const alive = prev.filter((id) => ids.has(id));
      return alive.length === prev.length ? prev : alive.length ? alive : null;
    });
  }, [bodies]);

  const selectedBody = displayBodies.find((b) => b.id === selectedBodyId) || null;
  const selectedBodies = selectedBodyIds.map((id) => displayBodies.find((b) => b.id === id)).filter((b): b is Body3D => !!b);

  const selectOnly = (id: string | null) => {
    setSelectedBodyId(id);
    setSelectedBodyIds(id ? [id] : []);
    setSelectedEdges([]);
    setSelectedFace(null);
  };

  // ---- Selection ----------------------------------------------------------
  const handleSelectBody = (id: string | null, isMultiSelect?: boolean) => {
    if (id === null) {
      selectOnly(null);
      return;
    }
    // Clicking a member of a group picks the whole group.
    const group = bodies.find((b) => b.id === id)?.groupId;
    const members = group ? bodies.filter((b) => b.groupId === group).map((b) => b.id) : [id];

    if (!isMultiSelect) {
      setSelectedBodyId(id);
      setSelectedBodyIds(members);
      setSelectedEdges((prev) => (prev.length && prev[0].bodyId !== id ? [] : prev));
      setSelectedFace((prev) => (prev && prev.bodyId !== id ? null : prev));
      return;
    }
    setSelectedEdges([]);
    setSelectedFace(null);
    if (selectedBodyIds.includes(id)) {
      const next = selectedBodyIds.filter((item) => !members.includes(item));
      setSelectedBodyIds(next);
      setSelectedBodyId(next.length > 0 ? next[next.length - 1] : null);
    } else {
      setSelectedBodyIds([...new Set([...selectedBodyIds, ...members])]);
      setSelectedBodyId(id);
    }
  };

  // ---- Body operations ----------------------------------------------------
  const handleUpdateBody = useCallback(
    (id: string, updates: Partial<Body3D>) => {
      setBodies((prev) => prev.map((body) => (body.id === id ? { ...body, ...updates } : body)));
    },
    [setBodies]
  );

  /** Rigid move/rotate of several bodies in one update. */
  const transformBodies = useCallback(
    (ids: string[], t: BodyTransform) => {
      const set = new Set(ids);
      setBodies((prev) => prev.map((b) => (set.has(b.id) ? { ...b, ...transformBody(b, t) } : b)));
    },
    [setBodies]
  );

  const requestDelete = (targets: string[] = selectedBodyIds) => {
    if (targets.length) setConfirmDeleteIds(targets);
  };

  const moveSelection = (dx: number, dy: number, dz: number, angle = 0) => {
    const b = selectionBounds(selectedBodies);
    if (b) transformBodies(selectedBodyIds, { dx, dy, dz, angle, cx: b.centerX, cy: b.centerY });
  };

  const handleResize = (width: number, depth: number) => {
    if (selectedBody) handleUpdateBody(selectedBody.id, resizeBody(selectedBody, width, depth));
  };

  const handleExtrudeFace = (face: FaceSel, delta: number) => {
    const body = bodies.find((b) => b.id === face.bodyId);
    const updates = body && extrudeFace(body, face, delta);
    if (updates) setBodies((prev) => prev.map((b) => (b.id === face.bodyId ? { ...b, ...updates } : b)));
  };

  const handleFaceValue = (face: FaceSel, mm: number) => {
    const body = bodies.find((b) => b.id === face.bodyId);
    const updates = body && setFaceMeasure(body, face, mm);
    if (updates) setBodies((prev) => prev.map((b) => (b.id === face.bodyId ? { ...b, ...updates } : b)));
  };

  const handleDeleteSelected = (targets: string[] = selectedBodyIds) => {
    if (!targets.length) return;
    const ids = new Set(targets);
    const label = targets.length === 1 ? bodies.find((b) => b.id === targets[0])?.name ?? 'shape' : `${ids.size} shapes`;
    setBodies((prev) => prev.filter((body) => !ids.has(body.id)));
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, bodyIds: g.bodyIds.filter((bid) => !ids.has(bid)) }))
        .filter((g) => g.bodyIds.length > 1)
    );
    notify(`Deleted ${label}. Press ⌘Z to undo.`);
    setConfirmDeleteIds(null);
  };

  const handleCloneBody = (id: string) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;
    const clonedId = `body_${Date.now()}`;
    const clone: Body3D = {
      ...target,
      ...transformBody(target, { dx: 35, dy: -35, dz: 0, angle: 0, cx: 0, cy: 0 }),
      id: clonedId,
      name: `${target.name} copy`,
      groupId: undefined,
      createdAt: new Date().toISOString(),
    };
    setBodies((prev) => [...prev, clone]);
    selectOnly(clonedId);
    notify('Duplicated.');
  };

  /** Drops a stock shape into the scene: on the selected top face if there is one, otherwise beside what is already there. */
  const addShape = (kind: ShapeKind) => {
    bodyCounter.current += 1;
    const id = `body_${Date.now()}`;
    const color = SWATCHES[(bodyCounter.current - 1) % SWATCHES.length].value;
    const onTop = selectedBody && selectedFace?.kind === 'top' && selectedFace.bodyId === selectedBody.id ? selectedBody : null;
    let cx = 0;
    let cy = 0;
    let elevation = 0;
    if (onTop) {
      const b = selectionBounds([onTop])!;
      cx = b.centerX;
      cy = b.centerY;
      elevation = Math.round(((onTop.elevation ?? 0) + onTop.extrusionHeight) * 100) / 100;
    } else {
      const b = selectionBounds(bodies.filter((x) => x.visible));
      if (b) {
        cx = Math.round(b.maxX + 50);
        cy = Math.round(b.centerY);
      }
    }
    const outline = primitiveOutline(kind, cx, cy);
    const body: Body3D = {
      id,
      name: `${SHAPE_LABELS[kind]} ${bodyCounter.current}`,
      ...outline,
      extrusionHeight: 40,
      elevation,
      color,
      materialType: 'matte',
      visible: true,
      createdAt: new Date().toISOString(),
    };
    if (outline.cornerRadii) body.points = withOutline(body, { basePoints: outline.basePoints, cornerRadii: outline.cornerRadii }).points;
    setBodies((prev) => [...prev, body]);
    setIsolatedIds((prev) => (prev ? [...prev, id] : prev));
    selectOnly(id);
  };

  const handleApplyCut = (targetId: string, cutterId: string, keepCutter: boolean) => {
    const target = bodies.find((b) => b.id === targetId);
    const cutter = bodies.find((b) => b.id === cutterId);
    if (!target || !cutter) return;

    const cutResults = cutShape(target.points, target.holes, cutter.points, cutter.holes);
    if (cutResults.length === 0) {
      notify('Subtracting removed the entire shape.');
      return;
    }

    // The outline is new, so earlier edge bevels and corner radii no longer apply.
    const reshaped = (r: { points: Point2D[]; holes: Point2D[][] }) => ({
      points: r.points,
      basePoints: r.points,
      cornerRadii: undefined,
      edgeBevels: undefined,
      holes: r.holes,
    });
    const [primary, ...extras] = cutResults;
    let next = bodies.map((b) => (b.id === targetId ? { ...target, ...reshaped(primary) } : b));
    extras.forEach((result, i) => {
      next.push({
        ...target,
        ...reshaped(result),
        id: `body_split_${Date.now()}_${i}`,
        name: `${target.name} (part ${i + 2})`,
      });
    });
    if (!keepCutter) next = next.filter((b) => b.id !== cutterId);

    setBodies(next);
    selectOnly(targetId);
    notify(`Subtracted “${cutter.name}” from “${target.name}”.`);
  };

  /** Rounds every vertical corner of a body to the same radius. */
  const handleApplyCornerRadius = (id: string, radius: number) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;
    const n = (target.basePoints ?? target.points).length;
    handleUpdateBody(id, withOutline(target, { cornerRadii: new Array(n).fill(radius) }));
  };

  /** Size / style changes from the bevel bar, the viewport handle and the inspector. */
  const handleEdgeChange = useCallback(
    (sels: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => {
      if (!sels.length) return;
      setBodies((prev) => prev.map((b) => (sels.some((s) => s.bodyId === b.id) ? { ...b, ...applyEdgeChange(b, sels, patch) } : b)));
      if (patch.size !== undefined && patch.size <= 0) {
        setSelectedEdges((prev) => prev.filter((e) => !sels.some((s) => edgeKey(s) === edgeKey(e))));
      }
    },
    [setBodies]
  );

  // ---- Commands -------------------------------------------------------------
  const handleOpenCut = () => {
    if (displayBodies.filter((b) => b.visible).length < 2) {
      notify('You need at least two shapes to subtract one from another.');
      return;
    }
    setIsCutModalOpen(true);
  };

  const handleOpenRepeat = () => {
    if (!selectedBodyId) {
      notify('Select the shape you want to repeat first.');
      return;
    }
    setIsRepeatModalOpen(true);
  };

  const handleGroupSelected = () => {
    if (selectedBodyIds.length < 2) {
      notify('Select at least two shapes to group (Shift-click to add).');
      return;
    }
    const newGroupId = `group_${Date.now()}`;
    const newGroup: ShapeGroup = {
      id: newGroupId,
      name: `Group ${groups.length + 1}`,
      bodyIds: [...selectedBodyIds],
    };
    setDoc((d) => ({
      groups: [...d.groups, newGroup],
      bodies: d.bodies.map((b) => (selectedBodyIds.includes(b.id) ? { ...b, groupId: newGroupId } : b)),
    }));
    notify(`Grouped ${selectedBodyIds.length} shapes. They now select and move together.`);
  };

  const handleUngroup = (groupId: string) => {
    setDoc((d) => ({
      groups: d.groups.filter((g) => g.id !== groupId),
      bodies: d.bodies.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined } : b)),
    }));
    notify('Group dissolved.');
  };

  const handleMergeSelected = () => {
    if (selectedBodyIds.length < 2) {
      notify('Select at least two overlapping shapes to unite.');
      return;
    }
    const targets = bodies.filter((b) => selectedBodyIds.includes(b.id));
    if (targets.length < 2) return;

    const results = mergeShapes(targets.map((t) => ({ points: t.points, holes: t.holes })));
    if (results.length === 0) return;

    const primary = targets[0];
    const stamp = Date.now();
    const merged: Body3D[] = results.map((r, i) => ({
      ...primary,
      id: `body_merged_${stamp}_${i}`,
      name: i === 0 ? `${primary.name} (united)` : `${primary.name} (united part ${i + 1})`,
      points: r.points,
      basePoints: r.points,
      cornerRadii: undefined,
      edgeBevels: undefined,
      holes: r.holes,
      groupId: undefined,
    }));

    setBodies([...bodies.filter((b) => !selectedBodyIds.includes(b.id)), ...merged]);
    setIsolatedIds((prev) => (prev ? [...prev.filter((id) => !selectedBodyIds.includes(id)), ...merged.map((m) => m.id)] : prev));
    selectOnly(merged[0].id);
    notify(`United ${targets.length} shapes.`);
  };

  const handleApplyPattern = (config: RepeatConfig) => {
    if (!selectedBody) return;

    const n = selectedBody.points.length;
    const cx = selectedBody.points.reduce((acc, p) => acc + p.x, 0) / n;
    const cy = selectedBody.points.reduce((acc, p) => acc + p.y, 0) / n;

    const hasPath = config.startPoint && config.endPoint;
    const sp = hasPath ? config.startPoint! : { x: Math.round(cx), y: Math.round(cy) };
    const ep = hasPath ? config.endPoint! : { x: Math.round(cx + 180), y: Math.round(cy) };

    const count = Math.max(2, config.count);
    const transforms =
      config.type === 'curved' && config.controlPoint
        ? calculateCurvedPattern(sp, config.controlPoint, ep, count)
        : calculateLinearPattern(sp, ep, count);

    const stamp = Date.now();
    const copies: Body3D[] = [];
    for (let i = 1; i < transforms.length; i++) {
      // Optionally turn each copy to follow the path tangent, pivoting around the shape's centre.
      const angle = config.followCurve && config.type === 'curved' ? transforms[i].angle - transforms[0].angle : 0;
      copies.push({
        ...selectedBody,
        ...transformBody(selectedBody, { dx: transforms[i].x - cx, dy: transforms[i].y - cy, dz: 0, angle, cx, cy }),
        id: `body_repeat_${stamp}_${i}`,
        name: `${selectedBody.name} copy ${i}`,
        groupId: undefined,
        createdAt: new Date().toISOString(),
      });
    }

    setBodies((prev) => [...prev, ...copies]);
    setIsolatedIds((prev) => (prev ? [...prev, ...copies.map((c) => c.id)] : prev));
    notify(`Created ${copies.length} copies along a ${config.type} path.`);
  };

  const handleStartDrawingRepeatLine = () => {
    setRepeatConfig((prev) => ({
      ...prev,
      isDrawingLine: true,
      drawingStep: 'start',
      startPoint: null,
      controlPoint: null,
      endPoint: null,
    }));
  };

  const handleClearWorkspace = () => {
    if (window.confirm('Remove every shape and start from an empty workspace?')) {
      setDoc({ bodies: [], groups: [] });
      selectOnly(null);
      setIsolatedIds(null);
      notify('Workspace cleared. Press ⌘Z to bring it back.');
    }
  };

  const handleLoadDemo = () => {
    const starter = createStarterBodies();
    setDoc({ bodies: starter, groups: [] });
    selectOnly(starter[0].id);
    setIsolatedIds(null);
    notify('Loaded the starter block.');
  };

  /** Shows only the given shapes (or everything again), in 2D and 3D. */
  const isolate = (ids: string[] | null) => {
    if (!ids) {
      setIsolatedIds(null);
      return;
    }
    const withGroups = new Set(ids);
    bodies.forEach((b) => {
      if (b.groupId && bodies.some((o) => o.groupId === b.groupId && withGroups.has(o.id))) withGroups.add(b.id);
    });
    setIsolatedIds([...withGroups]);
  };

  const toggleIsolate = () => {
    if (isolatedIds) {
      isolate(null);
      notify('Showing everything.');
    } else if (selectedBodyIds.length) {
      isolate(selectedBodyIds);
      notify('Isolated. Press I again to show everything.');
    } else {
      notify('Select a shape to isolate it.');
    }
  };

  const doUndo = () => {
    if (!history.undo()) notify('Nothing to undo.');
  };
  const doRedo = () => {
    if (!history.redo()) notify('Nothing to redo.');
  };

  // ---- Keyboard shortcuts -------------------------------------------------
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (mod) {
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (key === 'y') {
        e.preventDefault();
        doRedo();
      } else if (key === 'd' && selectedBodyId) {
        e.preventDefault();
        handleCloneBody(selectedBodyId);
      }
      return;
    }
    if (e.altKey) return;

    if (key === 'escape') {
      // One step back each time: close dialogs, drop edge picks, deselect, show everything.
      if (openMenu) setOpenMenu(null);
      else if (confirmDeleteIds || isCutModalOpen || isRepeatModalOpen) {
        setConfirmDeleteIds(null);
        setIsCutModalOpen(false);
        setIsRepeatModalOpen(false);
          } else if (repeatConfig.isDrawingLine) {
        setRepeatConfig((p) => ({ ...p, isDrawingLine: false, drawingStep: 'start' }));
      } else if (selectedEdges.length) setSelectedEdges([]);
      else if (selectedFace) setSelectedFace(null);
      else if (selectedBodyIds.length) selectOnly(null);
      else if (isolatedIds) isolate(null);
      return;
    }
    if (confirmDeleteIds || isCutModalOpen || isRepeatModalOpen) return;

    switch (key) {
      case 'm':
        if (selectedBodyIds.length) setMoveOn((v) => !v);
        break;
      case 'i':
        toggleIsolate();
        break;
      case 's':
        handleOpenCut();
        break;
      case 'r':
        handleOpenRepeat();
        break;
      case 'g':
        handleGroupSelected();
        break;
      case 'j':
        handleMergeSelected();
        break;
      case 'delete':
      case 'backspace':
        e.preventDefault();
        if (selectedEdges.length) handleEdgeChange(selectedEdges, { size: 0 });
        else requestDelete();
        break;
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ---- Render -------------------------------------------------------------
  const sidebarProps = {
    bodies,
    isolatedIds,
    selectedBodyId,
    selectedBodyIds,
    onSelectBody: handleSelectBody,
    onUpdateBody: handleUpdateBody,
    onDeleteBody: (id: string) => requestDelete([id]),
    onCloneBody: handleCloneBody,
    onClearWorkspace: handleClearWorkspace,
    onLoadDemo: handleLoadDemo,
    groups,
    onGroupSelected: handleGroupSelected,
    onUngroup: handleUngroup,
    onMergeSelected: handleMergeSelected,
    onApplyCornerRadius: handleApplyCornerRadius,
    onIsolate: (id: string) => {
      isolate([id]);
      selectOnly(id);
    },
    onShowAll: () => isolate(null),
    onEditEdge: (sel: EdgeSel) => {
      selectOnly(sel.bodyId);
      setSelectedEdges([sel]);
      },
    onRemoveEdge: (sel: EdgeSel) => handleEdgeChange([sel], { size: 0 }),
  };

  const isolatedNames = isolatedIds
    ? bodies
        .filter((b) => isolatedIds.includes(b.id))
        .map((b) => b.name)
        .slice(0, 2)
        .join(', ') + (isolatedIds.length > 2 ? ` +${isolatedIds.length - 2}` : '')
    : '';

  return (
    <div className="h-dvh flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      <TopBar
        openId={openMenu}
        setOpenId={setOpenMenu}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={doUndo}
        onRedo={doRedo}
        selected={selectedBodies}
        edges={selectedEdges}
        face={selectedFace}
        onEdgeChange={handleEdgeChange}
        onClearEdges={() => setSelectedEdges([])}
        onExtrudeFace={handleExtrudeFace}
        onClearFace={() => setSelectedFace(null)}
        onMove={(dx, dy, dz) => moveSelection(dx, dy, dz)}
        onResize={handleResize}
        onUpdateBody={handleUpdateBody}
        sidebar={sidebarProps}
      />

      <div className="flex-1 min-h-0 flex">
        {/* Viewport */}
        <main className="relative flex-1 min-w-0 min-h-0 bg-slate-950">
          <div className="absolute inset-0">
                <ModelViewer3D
                  bodies={displayBodies}
                  selectedBodyId={selectedBodyId}
                  selectedBodyIds={selectedBodyIds}
                  onSelectBody={handleSelectBody}
                  onUpdateBody={handleUpdateBody}
                  onTransformBodies={transformBodies}
                  selectedEdges={selectedEdges}
                  onSelectEdges={setSelectedEdges}
                  selectedFace={selectedFace}
                  onSelectFace={setSelectedFace}
                  onEdgeChange={handleEdgeChange}
                  repeatConfig={repeatConfig}
                  onUpdateRepeatConfig={setRepeatConfig}
                  onDragStateChange={history.hold}
                  onHint={setHint}
                  moveOn={moveOn}
                  onFaceValue={handleFaceValue}
                  onToggleMove={() => setMoveOn((v) => !v)}
                />

                {displayBodies.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto max-w-xs text-center flex flex-col items-center gap-4 p-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/6 border border-white/10 flex items-center justify-center text-slate-300">
                        <Box size={22} strokeWidth={1.5} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white">Start your first part</h2>
                        <p className="mt-1 text-sm text-slate-400">Add a shape, then group, join or subtract.</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => addShape('box')}
                          className="px-4 h-9 rounded-full bg-accent-500 hover:bg-accent-400 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                          <Box size={15} /> Add a box
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadDemo}
                          className="px-4 h-9 rounded-full bg-white/8 hover:bg-white/12 text-slate-200 text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                          <Sparkles size={15} /> Starter block
                        </button>
                      </div>
                    </div>
                  </div>
                )}
          </div>

          {/* Bottom-center stack: isolation state and toasts */}
          <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-3 w-[calc(100%-1.5rem)] max-w-xl flex flex-col items-center gap-2 pointer-events-none [&>*]:pointer-events-auto">
            <AnimatePresence>
              {isolatedIds && (
                <motion.div
                  key="isolated"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-accent-500/20 border border-accent-400/40 backdrop-blur text-[13px] text-accent-100 shadow-xl max-w-full"
                >
                  <Focus size={14} className="shrink-0" />
                  <span className="truncate">
                    Isolated: <strong className="font-semibold text-white">{isolatedNames}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => isolate(null)}
                    className="h-7 px-2.5 rounded-full bg-white/12 hover:bg-white/20 text-xs font-medium text-white shrink-0"
                  >
                    Show all
                  </button>
                </motion.div>
              )}
              {toast && (
                <motion.div
                  key={toast}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  role="status"
                  className="px-3.5 py-2 rounded-xl bg-slate-950/95 backdrop-blur border border-white/10 shadow-xl text-[13px] text-slate-100 flex items-center gap-2 max-w-full"
                >
                  <Info size={14} className="text-accent-400 shrink-0" />
                  <span className="truncate">{toast}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {hint && (
              <p className="text-xs text-slate-500 text-center leading-snug px-3">{hint}</p>
            )}
          </div>
        </main>

      </div>

      <BottomBar
        openId={openMenu}
        setOpenId={setOpenMenu}
        selectedCount={selectedBodyIds.length}
        bodyCount={displayBodies.length}
        isolated={!!isolatedIds}
        moveOn={moveOn && selectedBodyIds.length > 0}
        addOnTop={selectedFace?.kind === 'top' && selectedBodyIds.length === 1}
        onAddShape={addShape}
        onToggleMove={() => setMoveOn((v) => !v)}
        onIsolate={toggleIsolate}
        onGroup={handleGroupSelected}
        onJoin={handleMergeSelected}
        onSubtract={handleOpenCut}
        onPattern={handleOpenRepeat}
        onDelete={() => requestDelete()}
      />

      <AnimatePresence>
        {confirmDeleteIds && (
          <ConfirmDeleteModal
            key="delete"
            names={confirmDeleteIds.map((id) => bodies.find((b) => b.id === id)?.name ?? 'shape')}
            onConfirm={() => handleDeleteSelected(confirmDeleteIds)}
            onCancel={() => setConfirmDeleteIds(null)}
          />
        )}
        {isCutModalOpen && (
          <CutModal
            key="cut"
            onClose={() => setIsCutModalOpen(false)}
            bodies={displayBodies}
            initialTargetId={selectedBodyId}
            onApplyCut={handleApplyCut}
          />
        )}
        {isRepeatModalOpen && selectedBody && (
          <RepeatPatternModal
            key="repeat"
            onClose={() => setIsRepeatModalOpen(false)}
            selectedBody={selectedBody}
            repeatConfig={repeatConfig}
            setRepeatConfig={setRepeatConfig}
            onStartDrawingLine={() => {
              setIsRepeatModalOpen(false);
              handleStartDrawingRepeatLine();
            }}
            onApplyPattern={handleApplyPattern}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
