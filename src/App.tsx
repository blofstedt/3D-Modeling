/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Body3D,
  CadTool,
  EditorMode,
  Point2D,
  RepeatConfig,
  ShapeGroup,
  SWATCHES,
} from './types';
import SketchCanvas from './components/SketchCanvas';
import ModelViewer3D, { EditPart } from './components/ModelViewer3D';
import Sidebar from './components/Sidebar';
import ToolRail from './components/ToolRail';
import CutModal from './components/CutModal';
import RoundBevelModal from './components/RoundBevelModal';
import MoveFaceControls from './components/MoveFaceControls';
import RepeatPatternModal from './components/RepeatPatternModal';
import GuidanceBanner from './components/GuidanceBanner';
import { useHistory } from './hooks/useHistory';
import {
  cutShape,
  mergeShapes,
  roundPolygonCorners,
  calculateLinearPattern,
  calculateCurvedPattern,
} from './utils/geometry';
import {
  Box,
  Info,
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

const STORAGE_KEY = 'craft3d:document:v1';

const rect = (x1: number, y1: number, x2: number, y2: number): Point2D[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

// Starter solids so the workspace is never an empty void on first load.
const createStarterBodies = (): Body3D[] => {
  const bracket: Point2D[] = [
    { x: -140, y: -90 },
    { x: 140, y: -90 },
    { x: 140, y: 90 },
    { x: 50, y: 90 },
    { x: 50, y: 40 },
    { x: -50, y: 40 },
    { x: -50, y: 90 },
    { x: -140, y: 90 },
  ];
  const now = new Date().toISOString();
  return [
    {
      id: 'body_bracket_main',
      name: 'Mounting bracket',
      points: bracket,
      basePoints: bracket,
      holes: [rect(-95, -60, -65, -30), rect(65, -60, 95, -30)],
      extrusionHeight: 45,
      color: '#94a3b8',
      materialType: 'metal',
      visible: true,
      bevelEnabled: true,
      bevelSize: 2,
      bevelSegments: 3,
      cornerRadius: 0,
      createdAt: now,
    },
    {
      id: 'body_cutter_pin',
      name: 'Boss pin',
      points: rect(-25, -25, 25, 25),
      basePoints: rect(-25, -25, 25, 25),
      extrusionHeight: 65,
      color: '#ef4444',
      materialType: 'glossy',
      visible: true,
      bevelEnabled: true,
      bevelSize: 1,
      bevelSegments: 2,
      cornerRadius: 0,
      createdAt: now,
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

const offsetPoints = (pts: Point2D[], dx: number, dy: number) =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

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

  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(() => doc.bodies[0]?.id ?? null);
  const [selectedBodyIds, setSelectedBodyIds] = useState<string[]>(() =>
    doc.bodies[0] ? [doc.bodies[0].id] : []
  );
  const [editorMode, setEditorMode] = useState<EditorMode>('view3d');
  const [activeCadTool, setActiveCadTool] = useState<CadTool>('select');
  const [existingPoints, setExistingPoints] = useState<Point2D[]>([]);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeEditPart, setActiveEditPart] = useState<EditPart | null>(null);

  const [isCutModalOpen, setIsCutModalOpen] = useState(false);
  const [isBevelModalOpen, setIsBevelModalOpen] = useState(false);
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

  // Once the pattern path has been drawn in the viewport, bring the dialog back to finish the job.
  useEffect(() => {
    if (repeatConfig.drawingStep === 'done' && !repeatConfig.isDrawingLine && activeCadTool === 'repeat') {
      setIsRepeatModalOpen(true);
    }
  }, [repeatConfig.drawingStep, repeatConfig.isDrawingLine, activeCadTool]);

  // Drop selections that no longer exist (after delete / undo).
  useEffect(() => {
    const ids = new Set(bodies.map((b) => b.id));
    setSelectedBodyIds((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))));
    setSelectedBodyId((prev) => (prev && !ids.has(prev) ? null : prev));
  }, [bodies]);

  const selectedBody = bodies.find((b) => b.id === selectedBodyId) || null;

  const selectOnly = (id: string | null) => {
    setSelectedBodyId(id);
    setSelectedBodyIds(id ? [id] : []);
  };

  // ---- Selection ----------------------------------------------------------
  const handleSelectBody = (id: string | null, isMultiSelect?: boolean) => {
    if (id === null) {
      selectOnly(null);
      setActiveEditPart(null);
      return;
    }
    if (!isMultiSelect) {
      selectOnly(id);
      return;
    }
    if (selectedBodyIds.includes(id)) {
      const next = selectedBodyIds.filter((item) => item !== id);
      setSelectedBodyIds(next);
      setSelectedBodyId(next.length > 0 ? next[next.length - 1] : null);
    } else {
      setSelectedBodyIds([...selectedBodyIds, id]);
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

  const handleDeleteBody = (id: string) => {
    const target = bodies.find((b) => b.id === id);
    setBodies((prev) => prev.filter((body) => body.id !== id));
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, bodyIds: g.bodyIds.filter((bid) => bid !== id) }))
        .filter((g) => g.bodyIds.length > 1)
    );
    notify(`Deleted ${target?.name ?? 'body'}. Press ⌘Z to undo.`);
  };

  const handleCloneBody = (id: string) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;
    const clonedId = `body_${Date.now()}`;
    const dx = 35;
    const dy = -35;
    const clone: Body3D = {
      ...target,
      id: clonedId,
      name: `${target.name} copy`,
      points: offsetPoints(target.points, dx, dy),
      basePoints: target.basePoints ? offsetPoints(target.basePoints, dx, dy) : undefined,
      holes: target.holes?.map((h) => offsetPoints(h, dx, dy)),
      groupId: undefined,
      createdAt: new Date().toISOString(),
    };
    setBodies((prev) => [...prev, clone]);
    selectOnly(clonedId);
    notify('Duplicated body.');
  };

  const handleShapeComplete = (points: Point2D[]) => {
    bodyCounter.current += 1;
    const newBodyId = `body_${Date.now()}`;
    const color = SWATCHES[(bodyCounter.current - 1) % SWATCHES.length].value;
    const newBody: Body3D = {
      id: newBodyId,
      name: `Body ${bodyCounter.current}`,
      points: [...points],
      basePoints: [...points],
      extrusionHeight: 50,
      color,
      materialType: 'matte',
      visible: true,
      bevelEnabled: true,
      bevelSize: 1,
      bevelSegments: 2,
      cornerRadius: 0,
      createdAt: new Date().toISOString(),
    };
    setBodies((prev) => [...prev, newBody]);
    selectOnly(newBodyId);
    setExistingPoints([]);
    setEditorMode('view3d');
    notify('Profile extruded to 50 mm. Drag the arrow to adjust.');
  };

  const handleApplyCut = (targetId: string, cutterId: string, keepCutter: boolean) => {
    const target = bodies.find((b) => b.id === targetId);
    const cutter = bodies.find((b) => b.id === cutterId);
    if (!target || !cutter) return;

    const cutResults = cutShape(target.points, target.holes, cutter.points, cutter.holes);
    if (cutResults.length === 0) {
      notify('The cut removed the entire body.');
      return;
    }

    const [primary, ...extras] = cutResults;
    let next = bodies.map((b) =>
      b.id === targetId ? { ...target, points: primary.points, basePoints: primary.points, holes: primary.holes } : b
    );
    extras.forEach((result, i) => {
      next.push({
        ...target,
        id: `body_split_${Date.now()}_${i}`,
        name: `${target.name} (part ${i + 2})`,
        points: result.points,
        basePoints: result.points,
        holes: result.holes,
      });
    });
    if (!keepCutter) next = next.filter((b) => b.id !== cutterId);

    setBodies(next);
    selectOnly(targetId);
    setActiveCadTool('select');
    notify(`Cut “${cutter.name}” out of “${target.name}”.`);
  };

  const handleApplyCornerRadius = (id: string, radius: number) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;
    const basePts = target.basePoints || target.points;
    handleUpdateBody(id, {
      basePoints: basePts,
      points: roundPolygonCorners(basePts, radius),
      cornerRadius: radius,
    });
  };

  const requireBody = (): string | null => {
    if (selectedBodyId) return selectedBodyId;
    const first = bodies[0];
    if (!first) {
      notify('Create or load a body first.');
      return null;
    }
    selectOnly(first.id);
    return first.id;
  };

  const handleSelectTool = () => {
    setActiveCadTool('select');
    setActiveEditPart(null);
    setRepeatConfig((prev) => (prev.isDrawingLine ? { ...prev, isDrawingLine: false, drawingStep: 'start' } : prev));
  };

  const handleOpenExtrude = () => {
    const id = requireBody();
    if (!id) return;
    setActiveEditPart({ bodyId: id, type: 'face', faceType: 'top' });
    setActiveCadTool('extrude');
    setEditorMode('view3d');
  };

  const handleOpenMoveFace = () => {
    const id = requireBody();
    if (!id) return;
    if (!activeEditPart) setActiveEditPart({ bodyId: id, type: 'face', faceType: 'top' });
    setActiveCadTool('moveFace');
    setEditorMode('view3d');
  };

  const handleOpenCut = () => {
    if (bodies.filter((b) => b.visible).length < 2) {
      notify('You need at least two bodies to cut one from another.');
      return;
    }
    setIsMobileSidebarOpen(false);
    setIsCutModalOpen(true);
    setActiveCadTool('cut');
  };

  const handleOpenBevel = () => {
    if (!requireBody()) return;
    setIsMobileSidebarOpen(false);
    setIsBevelModalOpen(true);
    setActiveCadTool('bevel');
  };

  const handleOpenRepeat = () => {
    if (!requireBody()) return;
    setIsMobileSidebarOpen(false);
    setIsRepeatModalOpen(true);
    setActiveCadTool('repeat');
  };

  const handleGroupSelected = () => {
    if (selectedBodyIds.length < 2) {
      notify('Select at least two bodies to group (Shift-click to add).');
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
    setActiveCadTool('select');
    notify(`Grouped ${selectedBodyIds.length} bodies.`);
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
      notify('Select at least two overlapping bodies to unite.');
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
      holes: r.holes,
      groupId: undefined,
    }));

    setBodies([...bodies.filter((b) => !selectedBodyIds.includes(b.id)), ...merged]);
    selectOnly(merged[0].id);
    setActiveCadTool('select');
    notify(`United ${targets.length} bodies.`);
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
      const dx = transforms[i].x - cx;
      const dy = transforms[i].y - cy;
      // Optionally turn each copy to follow the path tangent, pivoting around the body's centre.
      const turn = config.followCurve && config.type === 'curved' ? transforms[i].angle - transforms[0].angle : 0;
      const rotate = (p: Point2D): Point2D => {
        if (!turn) return p;
        const rx = p.x - cx;
        const ry = p.y - cy;
        return {
          x: cx + rx * Math.cos(turn) - ry * Math.sin(turn),
          y: cy + rx * Math.sin(turn) + ry * Math.cos(turn),
        };
      };
      const place = (pts: Point2D[]) => offsetPoints(pts.map(rotate), dx, dy).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
      const pts = place(selectedBody.points);
      copies.push({
        ...selectedBody,
        id: `body_repeat_${stamp}_${i}`,
        name: `${selectedBody.name} copy ${i}`,
        points: pts,
        basePoints: pts,
        holes: selectedBody.holes?.map(place),
        groupId: undefined,
        createdAt: new Date().toISOString(),
      });
    }

    setBodies((prev) => [...prev, ...copies]);
    setActiveCadTool('select');
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
    setActiveCadTool('repeat');
    setEditorMode('view3d');
  };

  const handleClearWorkspace = () => {
    if (window.confirm('Remove every body and start from an empty workspace?')) {
      setDoc({ bodies: [], groups: [] });
      selectOnly(null);
      setExistingPoints([]);
      notify('Workspace cleared. Press ⌘Z to bring it back.');
    }
  };

  const handleLoadDemo = () => {
    const starter = createStarterBodies();
    setDoc({ bodies: starter, groups: [] });
    selectOnly(starter[0].id);
    setEditorMode('view3d');
    notify('Loaded the sample scene.');
  };

  const handleNewSketch = () => {
    setExistingPoints([]);
    selectOnly(null);
    setActiveCadTool('select');
    setEditorMode('sketch');
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
      if (editorMode === 'sketch') return; // sketch canvas owns undo while drawing
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
      setIsCutModalOpen(false);
      setIsBevelModalOpen(false);
      setIsRepeatModalOpen(false);
      setIsMobileSidebarOpen(false);
      handleSelectTool();
      return;
    }
    if (isCutModalOpen || isBevelModalOpen || isRepeatModalOpen) return;
    if (editorMode === 'sketch' && !['1', '2'].includes(key)) return;

    switch (key) {
      case '1':
        setEditorMode('sketch');
        break;
      case '2':
        setEditorMode('view3d');
        break;
      case 'v':
        handleSelectTool();
        break;
      case 'n':
      case 's':
        handleNewSketch();
        break;
      case 'e':
        handleOpenExtrude();
        break;
      case 'c':
        handleOpenCut();
        break;
      case 'b':
        handleOpenBevel();
        break;
      case 'm':
        handleOpenMoveFace();
        break;
      case 'r':
        handleOpenRepeat();
        break;
      case 'g':
        handleGroupSelected();
        break;
      case 'u':
        handleMergeSelected();
        break;
      case 'delete':
      case 'backspace':
        if (selectedBodyId) {
          e.preventDefault();
          handleDeleteBody(selectedBodyId);
        }
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
    selectedBodyId,
    selectedBodyIds,
    onSelectBody: handleSelectBody,
    onUpdateBody: handleUpdateBody,
    onDeleteBody: handleDeleteBody,
    onCloneBody: handleCloneBody,
    onClearWorkspace: handleClearWorkspace,
    onLoadDemo: handleLoadDemo,
    groups,
    onGroupSelected: handleGroupSelected,
    onUngroup: handleUngroup,
    onMergeSelected: handleMergeSelected,
    onApplyCornerRadius: handleApplyCornerRadius,
  };

  const modeButton = (mode: EditorMode, label: string, Icon: typeof PenLine, hotkey: string) => (
    <button
      type="button"
      onClick={() => setEditorMode(mode)}
      aria-pressed={editorMode === mode}
      title={`${label} (${hotkey})`}
      className={`px-3 h-8 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
        editorMode === mode ? 'bg-white/12 text-white shadow-sm' : 'text-slate-400 hover:text-white'
      }`}
    >
      <Icon size={15} strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  );

  const iconButton = (
    label: string,
    onClick: () => void,
    Icon: typeof Undo2,
    disabled = false,
    extra = ''
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:text-slate-600 disabled:hover:bg-transparent transition-colors ${extra}`}
    >
      <Icon size={17} strokeWidth={1.75} />
    </button>
  );

  return (
    <div className="h-dvh flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* Top bar */}
      <header className="h-12 shrink-0 px-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-slate-900 border-b border-white/8 z-40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-accent-500 flex items-center justify-center text-white shrink-0">
            <Box size={16} strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold tracking-tight hidden sm:inline">Craft3D</span>
          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />
          {iconButton('Undo (⌘Z)', doUndo, Undo2, !history.canUndo)}
          {iconButton('Redo (⇧⌘Z)', doRedo, Redo2, !history.canRedo)}
        </div>

        <div className="flex items-center p-0.5 rounded-xl bg-white/6 border border-white/8">
          {modeButton('sketch', 'Sketch', PenLine, '1')}
          {modeButton('view3d', 'Model', Rotate3d, '2')}
        </div>

        <div className="flex items-center justify-end gap-1">
          {iconButton(
            isInspectorOpen ? 'Hide inspector' : 'Show inspector',
            () => setIsInspectorOpen((v) => !v),
            isInspectorOpen ? PanelRightClose : PanelRightOpen,
            false,
            'hidden md:flex'
          )}
          {iconButton('Open inspector', () => setIsMobileSidebarOpen(true), PanelRightOpen, false, 'md:hidden')}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Viewport */}
        <main className="relative flex-1 min-w-0 min-h-0 bg-slate-900">
          <AnimatePresence mode="wait" initial={false}>
            {editorMode === 'sketch' ? (
              <motion.div
                key="sketch"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0"
              >
                <SketchCanvas
                  onShapeComplete={handleShapeComplete}
                  existingPoints={existingPoints}
                  setExistingPoints={setExistingPoints}
                />
              </motion.div>
            ) : (
              <motion.div
                key="model"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0"
              >
                <ModelViewer3D
                  bodies={bodies}
                  selectedBodyId={selectedBodyId}
                  selectedBodyIds={selectedBodyIds}
                  onSelectBody={handleSelectBody}
                  onUpdateBody={handleUpdateBody}
                  repeatConfig={repeatConfig}
                  onUpdateRepeatConfig={setRepeatConfig}
                  activeCadTool={activeCadTool}
                  activeEditPart={activeEditPart}
                  setActiveEditPart={setActiveEditPart}
                  onOpenCut={handleOpenCut}
                  onOpenBevel={handleOpenBevel}
                  onDeleteBody={handleDeleteBody}
                  onSwitchToSketchOnFace={handleNewSketch}
                  onDragStateChange={history.hold}
                />

                {bodies.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto max-w-xs text-center flex flex-col items-center gap-4 p-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/6 border border-white/10 flex items-center justify-center text-slate-300">
                        <Box size={22} strokeWidth={1.5} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-white">Start your first part</h2>
                        <p className="mt-1 text-sm text-slate-400">
                          Draw a 2D profile, then pull it into a solid.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleNewSketch}
                          className="px-4 h-9 rounded-xl bg-accent-500 hover:bg-accent-400 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                          <PenLine size={15} /> New sketch
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadDemo}
                          className="px-4 h-9 rounded-xl bg-white/8 hover:bg-white/12 text-slate-200 text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                          <Sparkles size={15} /> Sample
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {editorMode === 'view3d' && (
            <ToolRail
              activeTool={activeCadTool}
              selectedBodyCount={selectedBodyIds.length}
              onSelect={handleSelectTool}
              onNewSketch={handleNewSketch}
              onExtrude={handleOpenExtrude}
              onCut={handleOpenCut}
              onBevel={handleOpenBevel}
              onMoveFace={handleOpenMoveFace}
              onRepeat={handleOpenRepeat}
              onGroup={handleGroupSelected}
              onMerge={handleMergeSelected}
            />
          )}

          {/* Bottom-center stack: contextual controls, tool guidance, toasts */}
          <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-20 md:bottom-4 w-[calc(100%-1.5rem)] max-w-xl flex flex-col items-center gap-2 pointer-events-none [&>*]:pointer-events-auto">
            {editorMode === 'view3d' && (activeCadTool === 'moveFace' || activeCadTool === 'extrude') && selectedBody && (
              <MoveFaceControls
                activeEditPart={activeEditPart}
                body={selectedBody}
                onUpdateBody={handleUpdateBody}
                onClose={handleSelectTool}
              />
            )}
            {editorMode === 'view3d' && (
              <GuidanceBanner
                activeTool={activeCadTool}
                isDrawingLine={repeatConfig.isDrawingLine}
                drawingStep={repeatConfig.drawingStep}
                onCancel={handleSelectTool}
              />
            )}
            <AnimatePresence>
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
          </div>
        </main>

        {/* Docked inspector (desktop) */}
        {isInspectorOpen && (
          <aside className="hidden md:flex w-80 lg:w-[22rem] shrink-0 flex-col min-h-0 bg-slate-900 border-l border-white/8">
            <Sidebar {...sidebarProps} />
          </aside>
        )}
      </div>

      {/* Inspector drawer (mobile) */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="absolute inset-0 bg-black/60"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-sm h-full bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col"
            >
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                aria-label="Close inspector"
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X size={17} />
              </button>
              <Sidebar {...sidebarProps} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCutModalOpen && (
          <CutModal
            key="cut"
            onClose={() => {
              setIsCutModalOpen(false);
              setActiveCadTool('select');
            }}
            bodies={bodies}
            initialTargetId={selectedBodyId}
            onApplyCut={handleApplyCut}
          />
        )}
        {isBevelModalOpen && selectedBody && (
          <RoundBevelModal
            key="bevel"
            onClose={() => {
              setIsBevelModalOpen(false);
              setActiveCadTool('select');
            }}
            selectedBody={selectedBody}
            onUpdateBody={handleUpdateBody}
            onApplyCornerRadius={handleApplyCornerRadius}
          />
        )}
        {isRepeatModalOpen && selectedBody && (
          <RepeatPatternModal
            key="repeat"
            onClose={() => {
              setIsRepeatModalOpen(false);
              setActiveCadTool('select');
            }}
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
