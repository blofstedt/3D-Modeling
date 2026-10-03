/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Body3D, 
  CadTool, 
  EditorMode, 
  Point2D, 
  RepeatConfig, 
  ShapeGroup, 
  SWATCHES 
} from './types';
import SketchCanvas from './components/SketchCanvas';
import ModelViewer3D, { EditPart } from './components/ModelViewer3D';
import Sidebar from './components/Sidebar';
import CadActionBar from './components/CadActionBar';
import CutModal from './components/CutModal';
import RoundBevelModal from './components/RoundBevelModal';
import MoveFaceControls from './components/MoveFaceControls';
import RepeatPatternModal from './components/RepeatPatternModal';
import GuidanceBanner from './components/GuidanceBanner';
import { 
  cutShape, 
  mergeShapes, 
  roundPolygonCorners, 
  calculateLinearPattern, 
  calculateCurvedPattern 
} from './utils/geometry';
import { 
  Compass, 
  Sparkles, 
  Layers, 
  Box, 
  Rotate3d, 
  Info, 
  CheckCircle2, 
  MousePointer, 
  PlusCircle,
  Sliders,
  X,
  RotateCcw,
  Check,
  PanelRightOpen,
  PanelRightClose
} from 'lucide-react';

// Starter CAD Solid Objects so the 3D plane is immediately populated and tangible
const STARTER_BODIES: Body3D[] = [
  {
    id: 'body_bracket_main',
    name: 'Precision Mounting Base',
    points: [
      { x: -140, y: -90 },
      { x: 140, y: -90 },
      { x: 140, y: 90 },
      { x: 50, y: 90 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
      { x: -50, y: 90 },
      { x: -140, y: 90 },
    ],
    basePoints: [
      { x: -140, y: -90 },
      { x: 140, y: -90 },
      { x: 140, y: 90 },
      { x: 50, y: 90 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
      { x: -50, y: 90 },
      { x: -140, y: 90 },
    ],
    holes: [
      [
        { x: -95, y: -30 },
        { x: -65, y: -30 },
        { x: -65, y: -60 },
        { x: -95, y: -60 },
      ],
      [
        { x: 65, y: -30 },
        { x: 95, y: -30 },
        { x: 95, y: -60 },
        { x: 65, y: -60 },
      ],
    ],
    extrusionHeight: 45,
    color: '#3b82f6',
    materialType: 'metal',
    visible: true,
    bevelEnabled: true,
    bevelSize: 2,
    bevelSegments: 3,
    cornerRadius: 8,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'body_cutter_pin',
    name: 'Cutter / Boss Pin',
    points: [
      { x: -25, y: -25 },
      { x: 25, y: -25 },
      { x: 25, y: 25 },
      { x: -25, y: 25 },
    ],
    basePoints: [
      { x: -25, y: -25 },
      { x: 25, y: -25 },
      { x: 25, y: 25 },
      { x: -25, y: 25 },
    ],
    extrusionHeight: 65,
    color: '#ef4444',
    materialType: 'matte',
    visible: true,
    bevelEnabled: true,
    bevelSize: 1,
    bevelSegments: 2,
    cornerRadius: 4,
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const [bodies, setBodies] = useState<Body3D[]>(STARTER_BODIES);
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>('body_bracket_main');
  const [selectedBodyIds, setSelectedBodyIds] = useState<string[]>(['body_bracket_main']);
  const [groups, setGroups] = useState<ShapeGroup[]>([]);
  // Default to 3D View so the 3D plane is immediately visible on both mobile and desktop!
  const [editorMode, setEditorMode] = useState<EditorMode>('view3d');
  const [activeCadTool, setActiveCadTool] = useState<CadTool>('select');
  const [existingPoints, setExistingPoints] = useState<Point2D[]>([]);
  const [triggerIntroAnimation, setTriggerIntroAnimation] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Active 3D direct-edit part (e.g. top face, corner point, edge)
  const [activeEditPart, setActiveEditPart] = useState<EditPart | null>(null);

  // CAD Modal Dialog states
  const [isCutModalOpen, setIsCutModalOpen] = useState(false);
  const [isBevelModalOpen, setIsBevelModalOpen] = useState(false);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);

  // Repeat Pattern Configuration
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

  const [bannerNotice, setBannerNotice] = useState<string | null>(
    "3D Workplane Active. Tap or click shapes to select. Use tools below to cut, bevel, move faces, or repeat."
  );

  const triggerNotification = (message: string) => {
    setBannerNotice(message);
    setTimeout(() => {
      setBannerNotice(null);
    }, 5000);
  };

  // Selection handlers
  const handleSelectBody = (id: string | null, isMultiSelect?: boolean) => {
    if (id === null) {
      setSelectedBodyId(null);
      setSelectedBodyIds([]);
      setActiveEditPart(null);
      return;
    }

    if (isMultiSelect) {
      setSelectedBodyIds((prev) => {
        if (prev.includes(id)) {
          const next = prev.filter((item) => item !== id);
          setSelectedBodyId(next.length > 0 ? next[next.length - 1] : null);
          return next;
        } else {
          setSelectedBodyId(id);
          return [...prev, id];
        }
      });
    } else {
      setSelectedBodyId(id);
      setSelectedBodyIds([id]);
    }
  };

  const handleToggleSelectBody = (id: string) => {
    handleSelectBody(id, true);
  };

  // Update Body
  const handleUpdateBody = (id: string, updates: Partial<Body3D>) => {
    setBodies((prev) =>
      prev.map((body) => (body.id === id ? { ...body, ...updates } : body))
    );
  };

  // Delete Body
  const handleDeleteBody = (id: string) => {
    setBodies((prev) => prev.filter((body) => body.id !== id));
    if (selectedBodyId === id) {
      setSelectedBodyId(null);
      setSelectedBodyIds((prev) => prev.filter((item) => item !== id));
    }
    triggerNotification('Solid body removed from registry.');
  };

  // Clone Body
  const handleCloneBody = (id: string) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;

    const clonedId = `body_${Date.now()}`;
    const offsetPoints = target.points.map((p) => ({
      x: p.x + 35,
      y: p.y - 35,
    }));

    const clonedBody: Body3D = {
      ...target,
      id: clonedId,
      name: `${target.name} (Copy)`,
      points: offsetPoints,
      basePoints: target.basePoints ? target.basePoints.map((p) => ({ x: p.x + 35, y: p.y - 35 })) : undefined,
      createdAt: new Date().toISOString(),
    };

    setBodies((prev) => [...prev, clonedBody]);
    setSelectedBodyId(clonedId);
    setSelectedBodyIds([clonedId]);
    triggerNotification('Duplicated solid with coordinate offset!');
  };

  // Callback when a 2D sketch loop is closed successfully
  const handleShapeComplete = (points: Point2D[]) => {
    const nextIndex = bodies.length + 1;
    const newBodyId = `body_${Date.now()}`;
    const swatchColors = [
      '#3b82f6',
      '#ef4444',
      '#10b981',
      '#0d9488',
      '#f59e0b',
      '#db2777',
      '#6d28d9',
    ];
    const chosenColor = swatchColors[(nextIndex - 1) % swatchColors.length];

    const newBody: Body3D = {
      id: newBodyId,
      name: `Solid Body ${nextIndex}`,
      points: [...points],
      basePoints: [...points],
      extrusionHeight: 50,
      color: chosenColor,
      materialType: 'matte',
      visible: true,
      bevelEnabled: true,
      bevelSize: 1,
      bevelSegments: 2,
      cornerRadius: 0,
      createdAt: new Date().toISOString(),
    };

    setBodies((prev) => [...prev, newBody]);
    setSelectedBodyId(newBodyId);
    setSelectedBodyIds([newBodyId]);
    setExistingPoints([]);
    setEditorMode('view3d');
    setTriggerIntroAnimation(true);
    triggerNotification('Loop closed! Shape extruded to 50mm on the 3D plane.');
  };

  // 1. CUT OUT (Boolean Subtraction)
  const handleApplyCut = (targetId: string, cutterId: string, keepCutter: boolean) => {
    const target = bodies.find((b) => b.id === targetId);
    const cutter = bodies.find((b) => b.id === cutterId);
    if (!target || !cutter) return;

    const cutResults = cutShape(
      target.points,
      target.holes,
      cutter.points,
      cutter.holes
    );

    if (cutResults.length === 0) {
      triggerNotification('Cut operation resulted in complete subtraction.');
      return;
    }

    const primaryResult = cutResults[0];
    const updatedTarget: Body3D = {
      ...target,
      points: primaryResult.points,
      basePoints: primaryResult.points,
      holes: primaryResult.holes,
    };

    let nextBodies = bodies.map((b) => (b.id === targetId ? updatedTarget : b));

    // If multiple disjoined solids produced
    if (cutResults.length > 1) {
      for (let i = 1; i < cutResults.length; i++) {
        const extraBody: Body3D = {
          ...target,
          id: `body_split_${Date.now()}_${i}`,
          name: `${target.name} (Part ${i + 1})`,
          points: cutResults[i].points,
          basePoints: cutResults[i].points,
          holes: cutResults[i].holes,
        };
        nextBodies.push(extraBody);
      }
    }

    if (!keepCutter) {
      nextBodies = nextBodies.filter((b) => b.id !== cutterId);
    }

    setBodies(nextBodies);
    setSelectedBodyId(targetId);
    setSelectedBodyIds([targetId]);
    setActiveCadTool('select');
    triggerNotification(`Cut complete! Cut "${cutter.name}" out of "${target.name}".`);
  };

  // 2. ROUND CORNERS & BEVEL EDGES
  const handleApplyCornerRadius = (id: string, radius: number) => {
    const target = bodies.find((b) => b.id === id);
    if (!target) return;

    const basePts = target.basePoints || target.points;
    const roundedPts = roundPolygonCorners(basePts, radius);

    handleUpdateBody(id, {
      basePoints: basePts,
      points: roundedPts,
      cornerRadius: radius,
    });
    triggerNotification(`Applied corner radius: ${radius}mm to ${target.name}.`);
  };

  // 2b. EXTRUDE / PUSH-PULL
  const handleOpenExtrude = () => {
    let targetId = selectedBodyId;
    if (!targetId && bodies.length > 0) {
      targetId = bodies[0].id;
      setSelectedBodyId(targetId);
      setSelectedBodyIds([targetId]);
    }
    if (targetId) {
      setActiveEditPart({ bodyId: targetId, type: 'face', faceType: 'top' });
    }
    setActiveCadTool('extrude');
    setEditorMode('view3d');
    triggerNotification('Extrude mode active. Slide height or drag top face.');
  };

  // 3. MOVE FACE / PUSH-PULL
  const handleOpenMoveFace = () => {
    if (!selectedBodyId) {
      if (bodies.length > 0) {
        setSelectedBodyId(bodies[0].id);
        setSelectedBodyIds([bodies[0].id]);
        setActiveEditPart({ bodyId: bodies[0].id, type: 'face', faceType: 'top' });
      }
    } else if (!activeEditPart) {
      setActiveEditPart({ bodyId: selectedBodyId, type: 'face', faceType: 'top' });
    }
    setActiveCadTool('moveFace');
    setEditorMode('view3d');
    triggerNotification('Move Face active: Click any top face or side wall to push/pull.');
  };

  // 4. GROUP OBJECTS
  const handleGroupSelected = () => {
    if (selectedBodyIds.length < 2) {
      triggerNotification('Select at least 2 shapes to group them into an assembly.');
      return;
    }

    const newGroupId = `group_${Date.now()}`;
    const newGroup: ShapeGroup = {
      id: newGroupId,
      name: `Assembly Group ${groups.length + 1}`,
      bodyIds: [...selectedBodyIds],
    };

    setGroups((prev) => [...prev, newGroup]);
    setBodies((prev) =>
      prev.map((b) =>
        selectedBodyIds.includes(b.id) ? { ...b, groupId: newGroupId } : b
      )
    );
    setActiveCadTool('select');
    triggerNotification(`Grouped ${selectedBodyIds.length} shapes into "${newGroup.name}".`);
  };

  const handleUngroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setBodies((prev) =>
      prev.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined } : b))
    );
    triggerNotification('Ungrouped assembly into individual solids.');
  };

  // 5. MERGE / UNION
  const handleMergeSelected = () => {
    if (selectedBodyIds.length < 2) {
      triggerNotification('Select at least 2 overlapping shapes to merge.');
      return;
    }

    const targets = bodies.filter((b) => selectedBodyIds.includes(b.id));
    if (targets.length < 2) return;

    const shapesToMerge = targets.map((t) => ({
      points: t.points,
      holes: t.holes,
    }));

    const mergedResults = mergeShapes(shapesToMerge);
    if (mergedResults.length === 0) return;

    const primaryTarget = targets[0];
    const mergedBody: Body3D = {
      ...primaryTarget,
      id: `body_merged_${Date.now()}`,
      name: `${primaryTarget.name} (Merged)`,
      points: mergedResults[0].points,
      basePoints: mergedResults[0].points,
      holes: mergedResults[0].holes,
    };

    const remainingBodies = bodies.filter((b) => !selectedBodyIds.includes(b.id));
    const newBodies = [...remainingBodies, mergedBody];

    if (mergedResults.length > 1) {
      for (let i = 1; i < mergedResults.length; i++) {
        newBodies.push({
          ...primaryTarget,
          id: `body_merged_${Date.now()}_${i}`,
          name: `${primaryTarget.name} (Merged Part ${i + 1})`,
          points: mergedResults[i].points,
          basePoints: mergedResults[i].points,
          holes: mergedResults[i].holes,
        });
      }
    }

    setBodies(newBodies);
    setSelectedBodyId(mergedBody.id);
    setSelectedBodyIds([mergedBody.id]);
    setActiveCadTool('select');
    triggerNotification(`Merged ${targets.length} shapes into single unified solid!`);
  };

  // 6. REPEAT PATTERN
  const handleApplyPattern = (config: RepeatConfig) => {
    const selectedBody = bodies.find((b) => b.id === selectedBodyId);
    if (!selectedBody) return;

    let sp = config.startPoint;
    let ep = config.endPoint;

    // Auto-calculate endpoints if none drawn
    if (!sp || !ep) {
      const n = selectedBody.points.length;
      const cx = selectedBody.points.reduce((acc, p) => acc + p.x, 0) / n;
      const cy = selectedBody.points.reduce((acc, p) => acc + p.y, 0) / n;
      sp = { x: Math.round(cx), y: Math.round(cy) };
      ep = { x: Math.round(cx + 180), y: Math.round(cy) };
    }

    const count = Math.max(2, config.count);
    const transforms = config.type === 'curved' && config.controlPoint
      ? calculateCurvedPattern(sp, config.controlPoint, ep, count)
      : calculateLinearPattern(sp, ep, count);

    const nPts = selectedBody.points.length;
    const cx = selectedBody.points.reduce((acc, p) => acc + p.x, 0) / nPts;
    const cy = selectedBody.points.reduce((acc, p) => acc + p.y, 0) / nPts;

    const newRepeatedBodies: Body3D[] = [];
    for (let i = 1; i < transforms.length; i++) {
      const t = transforms[i];
      const offX = t.x - cx;
      const offY = t.y - cy;

      const repeatedPts = selectedBody.points.map((p) => ({
        x: p.x + offX,
        y: p.y + offY,
      }));

      const repeatedHoles = selectedBody.holes
        ? selectedBody.holes.map((hole) =>
            hole.map((hp) => ({ x: hp.x + offX, y: hp.y + offY }))
          )
        : undefined;

      const repBody: Body3D = {
        ...selectedBody,
        id: `body_repeat_${Date.now()}_${i}`,
        name: `${selectedBody.name} (Copy ${i})`,
        points: repeatedPts,
        basePoints: repeatedPts,
        holes: repeatedHoles,
        createdAt: new Date().toISOString(),
      };
      newRepeatedBodies.push(repBody);
    }

    setBodies((prev) => [...prev, ...newRepeatedBodies]);
    setActiveCadTool('select');
    triggerNotification(`Repeated solid ${count} times along ${config.type} path!`);
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
    triggerNotification('Click Point 1 on the object to anchor start of repeat line.');
  };

  const handleClearWorkspace = () => {
    if (window.confirm('Clear all CAD models and reset workspace?')) {
      setBodies([]);
      setSelectedBodyId(null);
      setSelectedBodyIds([]);
      setGroups([]);
      setExistingPoints([]);
      triggerNotification('CAD Workspace cleared.');
    }
  };

  const handleLoadDemo = () => {
    setBodies(STARTER_BODIES);
    setSelectedBodyId('body_bracket_main');
    setSelectedBodyIds(['body_bracket_main']);
    setEditorMode('view3d');
    triggerNotification('Loaded sample CAD models onto the 3D plane.');
  };

  const handleTriggerNewSketch = () => {
    setExistingPoints([]);
    setSelectedBodyId(null);
    setSelectedBodyIds([]);
    setEditorMode('sketch');
    triggerNotification('2D Sketch active. Click grid nodes to draw a shape loop.');
  };

  // Keyboard Shortcuts for Rapid CAD Workflow
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '1') {
        setEditorMode('sketch');
      } else if (e.key === '2') {
        setEditorMode('view3d');
      } else if (e.key === 'e' || e.key === 'E') {
        handleOpenExtrude();
      } else if (e.key === 's' || e.key === 'S') {
        setEditorMode('sketch');
        triggerNotification('2D Sketch mode active.');
      } else if (e.key === 'c' || e.key === 'C') {
        if (bodies.length >= 2) {
          setIsCutModalOpen(true);
          setActiveCadTool('cut');
        }
      } else if (e.key === 'b' || e.key === 'B') {
        setIsBevelModalOpen(true);
        setActiveCadTool('bevel');
      } else if (e.key === 'm' || e.key === 'M') {
        handleOpenMoveFace();
      } else if (e.key === 'n' || e.key === 'N') {
        handleTriggerNewSketch();
      } else if (e.key === 'Escape') {
        setIsCutModalOpen(false);
        setIsBevelModalOpen(false);
        setIsRepeatModalOpen(false);
        setActiveCadTool('select');
        setActiveEditPart(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bodies, selectedBodyId]);

  const selectedBody = bodies.find((b) => b.id === selectedBodyId) || null;

  return (
    <div className="h-screen max-h-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden relative">
      
      {/* Mesh Gradient Ambient Lights */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-cyan-600 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-600 rounded-full blur-[130px]" />
      </div>

      {/* Top Header: Always Accessible Mode Switch & Mobile-Friendly Navigation */}
      <header className="bg-slate-900/90 border-b border-white/10 backdrop-blur-md px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 shrink-0 shadow-lg relative z-20">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1.5 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-xl text-white shadow-md shadow-cyan-500/20">
            <Box size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Craft3D
              <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-300 px-1 py-0.2 rounded border border-cyan-400/20 uppercase tracking-wider font-medium hidden sm:inline">CAD</span>
            </h1>
          </div>
        </div>

        {/* PROMINENT 2D / 3D MODE SWITCHER (Always front & center on all screen sizes!) */}
        <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/15 shadow-inner">
          <button
            onClick={() => setEditorMode('sketch')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
              editorMode === 'sketch'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Switch to 2D Sketch Workplane"
          >
            <MousePointer size={13} />
            <span>2D Sketch</span>
          </button>
          
          <button
            onClick={() => setEditorMode('view3d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
              editorMode === 'view3d'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Switch to 3D Perspective Plane"
          >
            <Rotate3d size={13} />
            <span>3D Plane</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Demo Reset */}
          <button
            onClick={handleLoadDemo}
            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white rounded-xl text-xs font-mono cursor-pointer transition-all hidden sm:flex items-center gap-1"
            title="Load sample CAD objects"
          >
            <Sparkles size={13} className="text-amber-400" />
            <span>Sample Objects</span>
          </button>

          {/* New Sketch button */}
          <button
            onClick={handleTriggerNewSketch}
            className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1"
            title="Create a new shape loop"
          >
            <PlusCircle size={13} />
            <span className="hidden sm:inline">New Sketch</span>
          </button>

          {/* Mobile Sidebar Drawer Toggle */}
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="md:hidden p-2 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl text-white cursor-pointer relative"
            title="Open Properties and Model Registry"
          >
            <Sliders size={16} />
            {selectedBody && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse border-2 border-slate-900" />
            )}
          </button>
        </div>
      </header>

      {/* Main Container Layout: Canvas area + Sidebar */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0 bg-transparent overflow-hidden relative z-10">
        
        {/* Floating Notification Banner */}
        <AnimatePresence>
          {bannerNotice && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-3 left-4 right-4 z-40 pointer-events-none flex justify-center"
            >
              <div className="bg-slate-900/95 backdrop-blur-md border border-cyan-400/40 py-1.5 px-4 rounded-xl shadow-2xl text-[11px] font-mono text-cyan-200 flex items-center gap-2 max-w-xl">
                <Info size={13} className="text-cyan-400 shrink-0" />
                <span className="truncate">{bannerNotice}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guidance Banner for Repeat Line Drawing */}
        <div className="absolute top-12 left-4 right-4 z-30 pointer-events-none flex justify-center">
          <GuidanceBanner
            activeTool={activeCadTool}
            isDrawingLine={repeatConfig.isDrawingLine}
            drawingStep={repeatConfig.drawingStep}
            onCancel={() => {
              setRepeatConfig((prev) => ({ ...prev, isDrawingLine: false, drawingStep: 'start' }));
              setActiveCadTool('select');
            }}
          />
        </div>

        {/* Left Section: Dynamic 3D / 2D Canvas stage */}
        <div className="flex-1 flex flex-col p-2 sm:p-3 min-w-0 font-mono relative min-h-0 h-full overflow-hidden">
          
          {/* Active View: 2D Sketch or 3D Solid Modeler */}
          <div className="w-full flex-1 flex flex-col min-h-0 relative">
            <AnimatePresence mode="wait">
              {editorMode === 'sketch' ? (
                <motion.div
                  key="sketch-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex-1 flex flex-col min-h-0"
                >
                  <SketchCanvas
                    onShapeComplete={handleShapeComplete}
                    existingPoints={existingPoints}
                    setExistingPoints={setExistingPoints}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="view3d-stage"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex-1 flex flex-col min-h-0 relative"
                >
                  <ModelViewer3D
                    bodies={bodies}
                    selectedBodyId={selectedBodyId}
                    selectedBodyIds={selectedBodyIds}
                    onSelectBody={handleSelectBody}
                    onUpdateBody={handleUpdateBody}
                    triggerIntroAnimation={triggerIntroAnimation}
                    onIntroAnimationComplete={() => setTriggerIntroAnimation(false)}
                    repeatConfig={repeatConfig}
                    onUpdateRepeatConfig={setRepeatConfig}
                    activeCadTool={activeCadTool}
                    activeEditPart={activeEditPart}
                    setActiveEditPart={setActiveEditPart}
                    onOpenCut={() => {
                      if (bodies.length < 2) {
                        triggerNotification('Create or load at least 2 bodies to cut one out of another.');
                        return;
                      }
                      setIsCutModalOpen(true);
                      setActiveCadTool('cut');
                    }}
                    onOpenBevel={() => {
                      setIsBevelModalOpen(true);
                      setActiveCadTool('bevel');
                    }}
                    onOpenMoveFace={handleOpenMoveFace}
                    onDeleteBody={handleDeleteBody}
                    onSwitchToSketchOnFace={() => {
                      setEditorMode('sketch');
                      triggerNotification('2D Sketch mode active. Draw profiles on the grid.');
                    }}
                  />

                  {/* Move Face / Extrude On-Screen Push-Pull Step Gizmo */}
                  {(activeCadTool === 'moveFace' || activeCadTool === 'extrude') && selectedBody && (
                    <MoveFaceControls
                      activeEditPart={activeEditPart}
                      body={selectedBody}
                      onUpdateBody={handleUpdateBody}
                      onClose={() => {
                        setActiveCadTool('select');
                        setActiveEditPart(null);
                      }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating CAD Action Bar: Immediate intuitive access to Cut, Round/Bevel, Move Face, Group, Repeat */}
          <div className="mt-2 flex justify-center shrink-0 z-30 overflow-x-auto py-1">
            <CadActionBar
              editorMode={editorMode}
              setEditorMode={setEditorMode}
              activeTool={activeCadTool}
              setActiveTool={setActiveCadTool}
              selectedBodyCount={selectedBodyIds.length}
              onTriggerNewSketch={handleTriggerNewSketch}
              onOpenExtrude={handleOpenExtrude}
              onOpenCut={() => {
                if (bodies.length < 2) {
                  triggerNotification('Create or load at least 2 bodies to cut one out of another.');
                  return;
                }
                setIsCutModalOpen(true);
                setActiveCadTool('cut');
              }}
              onOpenBevel={() => {
                if (!selectedBodyId && bodies.length > 0) {
                  setSelectedBodyId(bodies[0].id);
                  setSelectedBodyIds([bodies[0].id]);
                }
                setIsBevelModalOpen(true);
                setActiveCadTool('bevel');
              }}
              onOpenMoveFace={handleOpenMoveFace}
              onOpenGroup={handleGroupSelected}
              onOpenRepeat={() => {
                if (!selectedBodyId && bodies.length > 0) {
                  setSelectedBodyId(bodies[0].id);
                  setSelectedBodyIds([bodies[0].id]);
                }
                setIsRepeatModalOpen(true);
                setActiveCadTool('repeat');
              }}
              onMergeSolids={handleMergeSelected}
            />
          </div>
        </div>

        {/* Right Section: Desktop Sidebar Inspector */}
        <div className="hidden md:flex md:w-80 lg:w-96 border-l border-white/10 flex-col shrink-0 min-h-0 bg-slate-900/60 backdrop-blur-xl shadow-2xl overflow-y-auto">
          <Sidebar
            bodies={bodies}
            selectedBodyId={selectedBodyId}
            selectedBodyIds={selectedBodyIds}
            onSelectBody={handleSelectBody}
            onToggleSelectBody={handleToggleSelectBody}
            onUpdateBody={handleUpdateBody}
            onDeleteBody={handleDeleteBody}
            onCloneBody={handleCloneBody}
            onClearWorkspace={handleClearWorkspace}
            editorMode={editorMode}
            setEditorMode={setEditorMode}
            onTriggerNewSketch={handleTriggerNewSketch}
            groups={groups}
            onGroupSelected={handleGroupSelected}
            onUngroup={handleUngroup}
            onMergeSelected={handleMergeSelected}
            onOpenCut={() => setIsCutModalOpen(true)}
            onOpenBevel={() => setIsBevelModalOpen(true)}
            onOpenMoveFace={handleOpenMoveFace}
            onOpenRepeat={() => setIsRepeatModalOpen(true)}
            onApplyCornerRadius={handleApplyCornerRadius}
          />
        </div>

        {/* Mobile Slide-Over Drawer for Sidebar */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex justify-end">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileSidebarOpen(false)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />

              {/* Drawer Content */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-sm h-full bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col z-10 overflow-y-auto"
              >
                <div className="p-3 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
                  <span className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders size={13} className="text-cyan-400" />
                    Inspector &amp; Registry
                  </span>
                  <button
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <Sidebar
                    bodies={bodies}
                    selectedBodyId={selectedBodyId}
                    selectedBodyIds={selectedBodyIds}
                    onSelectBody={handleSelectBody}
                    onToggleSelectBody={handleToggleSelectBody}
                    onUpdateBody={handleUpdateBody}
                    onDeleteBody={handleDeleteBody}
                    onCloneBody={handleCloneBody}
                    onClearWorkspace={handleClearWorkspace}
                    editorMode={editorMode}
                    setEditorMode={setEditorMode}
                    onTriggerNewSketch={handleTriggerNewSketch}
                    groups={groups}
                    onGroupSelected={handleGroupSelected}
                    onUngroup={handleUngroup}
                    onMergeSelected={handleMergeSelected}
                    onOpenCut={() => {
                      setIsMobileSidebarOpen(false);
                      setIsCutModalOpen(true);
                    }}
                    onOpenBevel={() => {
                      setIsMobileSidebarOpen(false);
                      setIsBevelModalOpen(true);
                    }}
                    onOpenMoveFace={() => {
                      setIsMobileSidebarOpen(false);
                      handleOpenMoveFace();
                    }}
                    onOpenRepeat={() => {
                      setIsMobileSidebarOpen(false);
                      setIsRepeatModalOpen(true);
                    }}
                    onApplyCornerRadius={handleApplyCornerRadius}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

      {/* CUT SHAPE OUT MODAL */}
      <CutModal
        isOpen={isCutModalOpen}
        onClose={() => {
          setIsCutModalOpen(false);
          setActiveCadTool('select');
        }}
        bodies={bodies}
        initialTargetId={selectedBodyId}
        onApplyCut={handleApplyCut}
      />

      {/* ROUND & BEVEL MODAL */}
      <RoundBevelModal
        isOpen={isBevelModalOpen}
        onClose={() => {
          setIsBevelModalOpen(false);
          setActiveCadTool('select');
        }}
        selectedBody={selectedBody}
        onUpdateBody={handleUpdateBody}
        onApplyCornerRadius={handleApplyCornerRadius}
      />

      {/* REPEAT PATTERN MODAL */}
      <RepeatPatternModal
        isOpen={isRepeatModalOpen}
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

    </div>
  );
}
