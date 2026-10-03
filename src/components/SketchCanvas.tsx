/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Circle,
  Focus,
  Minus,
  PenTool,
  Plus,
  Square,
  Trash2,
  Triangle,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Body3D, GRID_SPACING, Point2D } from '../types';
import { createClosedCurveRibbon } from '../utils/geometry';

interface SketchCanvasProps {
  onShapeComplete: (points: Point2D[]) => void;
  existingPoints: Point2D[];
  setExistingPoints: React.Dispatch<React.SetStateAction<Point2D[]>>;
  /** Existing bodies are drawn as reference outlines you can snap to. */
  bodies: Body3D[];
  selectedBodyIds: string[];
  /** Height of the plane being sketched on (0 = ground). */
  planeElevation: number;
  onPlaneChange: (elevation: number) => void;
}

type SketchTool = 'polygon' | 'box' | 'circle' | 'triangle' | 'curve';
type CurveNode = 'start' | 'end' | 'center' | 'width1' | 'width2';

const TOOLS: { id: SketchTool; label: string; icon: LucideIcon; title: string }[] = [
  { id: 'polygon', label: 'Polygon', icon: PenTool, title: 'Polygon: click points, click the first point to close' },
  { id: 'box', label: 'Rectangle', icon: Square, title: 'Rectangle: drag between opposite corners' },
  { id: 'circle', label: 'Circle', icon: Circle, title: 'Circle: drag from the center outwards' },
  { id: 'triangle', label: 'Triangle', icon: Triangle, title: 'Triangle: drag its bounding box' },
  { id: 'curve', label: 'Curve', icon: Activity, title: 'Curve: set start and end, then bend with the handles' },
];

const COLORS = {
  background: '#08090d',
  gridMinor: '#12151e',
  gridMajor: '#1d2130',
  axisX: 'rgba(251, 113, 133, 0.65)',
  axisY: 'rgba(52, 211, 153, 0.65)',
  accent: '#8b7cf6',
  accentFill: 'rgba(110, 91, 255, 0.16)',
  close: '#34d399',
  handle: '#fbbf24',
  label: '#7a8297',
  pillBg: '#151824',
};

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const CLICK_SLOP_PX = 6;
const FONT = '11px "Inter Variable", system-ui, sans-serif';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const generateCirclePoints = (cx: number, cy: number, radius: number): Point2D[] => {
  const points: Point2D[] = [];
  const segments = 32;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.round(cx + radius * Math.cos(angle));
    const y = Math.round(cy + radius * Math.sin(angle));
    const last = points[points.length - 1];
    if (!last || last.x !== x || last.y !== y) points.push({ x, y });
  }
  if (points.length > 2 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
    points.pop();
  }
  return points;
};

const curveHandles = (start: Point2D, end: Point2D, center: Point2D, width: number) => ({
  c1: { x: center.x + (start.x - center.x) * width, y: center.y + (start.y - center.y) * width },
  c2: { x: center.x + (end.x - center.x) * width, y: center.y + (end.y - center.y) * width },
});

export default function SketchCanvas({
  onShapeComplete,
  existingPoints,
  setExistingPoints,
  bodies,
  selectedBodyIds,
  planeElevation,
  onPlaneChange,
}: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  const [snappedGridPos, setSnappedGridPos] = useState<Point2D>({ x: 0, y: 0 });
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const [activeTool, setActiveTool] = useState<SketchTool>('polygon');
  const [shapeStart, setShapeStart] = useState<Point2D | null>(null);

  const [curveStart, setCurveStart] = useState<Point2D | null>(null);
  const [curveEnd, setCurveEnd] = useState<Point2D | null>(null);
  const [curveCenter, setCurveCenter] = useState<Point2D | null>(null);
  const [curveWidth, setCurveWidth] = useState(0.35);
  const [curveDragging, setCurveDragging] = useState<CurveNode | null>(null);

  // Pointer bookkeeping (kept out of React state: it changes every move)
  const pointers = useRef(new Map<number, Point2D>());
  const press = useRef<{ x: number; y: number; button: number; pan: boolean; moved: boolean } | null>(null);
  const gesture = useRef<{ distance: number; zoom: number } | null>(null);
  const lastPan = useRef<Point2D | null>(null);

  // ---- Coordinate transforms ----------------------------------------------
  const origin = useCallback(
    () => ({ x: dimensions.width / 2 + pan.x, y: dimensions.height / 2 + pan.y }),
    [dimensions, pan]
  );

  const screenToGrid = useCallback(
    (sx: number, sy: number): Point2D => {
      const o = origin();
      const rawX = (sx - o.x) / zoom;
      const rawY = (o.y - sy) / zoom;
      // Corners of existing bodies win over the grid when the pointer is close.
      let nearest: Point2D | null = null;
      let nearestDist = 10 / zoom;
      for (const body of bodies) {
        if (!body.visible) continue;
        for (const p of body.points) {
          const d = Math.hypot(rawX - p.x, rawY - p.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
          }
        }
      }
      if (nearest) return { x: nearest.x, y: nearest.y };
      return {
        x: Math.round(rawX / GRID_SPACING) * GRID_SPACING,
        y: Math.round(rawY / GRID_SPACING) * GRID_SPACING,
      };
    },
    [origin, zoom, bodies]
  );

  const gridToScreen = useCallback(
    (gx: number, gy: number): Point2D => {
      const o = origin();
      return { x: o.x + gx * zoom, y: o.y - gy * zoom };
    },
    [origin, zoom]
  );

  const localPoint = (e: { clientX: number; clientY: number }): Point2D => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const zoomAround = useCallback(
    (nextZoom: number, sx: number, sy: number) => {
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const o = { x: dimensions.width / 2 + pan.x, y: dimensions.height / 2 + pan.y };
      // Keep the world point under (sx, sy) fixed while scaling.
      const wx = (sx - o.x) / zoom;
      const wy = (sy - o.y) / zoom;
      setPan({ x: sx - wx * z - dimensions.width / 2, y: sy - wy * z - dimensions.height / 2 });
      setZoom(z);
    },
    [dimensions, pan, zoom]
  );

  // ---- Resize --------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- Draft editing -------------------------------------------------------
  const resetCurve = () => {
    setCurveStart(null);
    setCurveEnd(null);
    setCurveCenter(null);
    setCurveWidth(0.35);
    setCurveDragging(null);
  };

  const handleUndo = () => {
    if (activeTool === 'curve') {
      if (curveEnd) {
        setCurveEnd(null);
        setCurveCenter(null);
      } else if (curveStart) {
        setCurveStart(null);
      }
    } else {
      setExistingPoints((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setExistingPoints([]);
    setShapeStart(null);
    resetCurve();
  };

  const selectTool = (tool: SketchTool) => {
    setActiveTool(tool);
    handleClear();
  };

  const completeCurve = () => {
    if (!curveStart || !curveEnd || !curveCenter) return;
    const { c1, c2 } = curveHandles(curveStart, curveEnd, curveCenter, curveWidth);
    const pts: Point2D[] = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = Math.round(u ** 3 * curveStart.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * curveEnd.x);
      const y = Math.round(u ** 3 * curveStart.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * curveEnd.y);
      const last = pts[pts.length - 1];
      if (!last || last.x !== x || last.y !== y) pts.push({ x, y });
    }
    const ribbon = createClosedCurveRibbon(pts, 26);
    if (ribbon.length >= 3) onShapeComplete(ribbon);
    resetCurve();
  };

  const closePolygon = () => {
    if (existingPoints.length >= 3) onShapeComplete([...existingPoints]);
  };

  const isHoveringStartNode =
    activeTool === 'polygon' &&
    existingPoints.length >= 3 &&
    Math.hypot(snappedGridPos.x - existingPoints[0].x, snappedGridPos.y - existingPoints[0].y) < GRID_SPACING * 1.5;

  // ---- Pointer handling ----------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);

    // Second finger: switch to pinch/pan and abandon any one-finger gesture.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
      lastPan.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      press.current = null;
      setShapeStart(null);
      setCurveDragging(null);
      return;
    }
    if (pointers.current.size > 2) return;

    const wantsPan = e.button === 1 || e.button === 2 || (e.button === 0 && (e.shiftKey || spaceHeld));
    press.current = { x: p.x, y: p.y, button: e.button, pan: wantsPan, moved: false };
    if (wantsPan) {
      setIsPanning(true);
      lastPan.current = p;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const snapped = screenToGrid(p.x, p.y);

    if (activeTool === 'curve') {
      if (!curveStart) {
        setCurveStart(snapped);
      } else if (!curveEnd) {
        setCurveEnd(snapped);
        const midX = (curveStart.x + snapped.x) / 2;
        const midY = (curveStart.y + snapped.y) / 2;
        const bx = snapped.x - curveStart.x;
        const by = snapped.y - curveStart.y;
        const length = Math.hypot(bx, by);
        const px = length > 0 ? -by / length : 0;
        const py = length > 0 ? bx / length : 1;
        setCurveCenter({
          x: Math.round((midX + px * 40) / GRID_SPACING) * GRID_SPACING,
          y: Math.round((midY + py * 40) / GRID_SPACING) * GRID_SPACING,
        });
        setCurveWidth(0.35);
      } else if (curveCenter) {
        const { c1, c2 } = curveHandles(curveStart, curveEnd, curveCenter, curveWidth);
        const candidates: [CurveNode, Point2D][] = [
          ['center', curveCenter],
          ['width1', c1],
          ['width2', c2],
          ['start', curveStart],
          ['end', curveEnd],
        ];
        const hit = candidates.find(([, pt]) => {
          const s = gridToScreen(pt.x, pt.y);
          return Math.hypot(p.x - s.x, p.y - s.y) < 16;
        });
        if (hit) setCurveDragging(hit[0]);
      }
      return;
    }

    if (activeTool === 'polygon') return; // placed on pointer-up so a pan/pinch never drops a stray point
    setShapeStart(snapped);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    if (gesture.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAround(gesture.current.zoom * (dist / gesture.current.distance), mid.x, mid.y);
      if (lastPan.current) {
        const dx = mid.x - lastPan.current.x;
        const dy = mid.y - lastPan.current.y;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      lastPan.current = mid;
      return;
    }

    if (press.current && Math.hypot(p.x - press.current.x, p.y - press.current.y) > CLICK_SLOP_PX) {
      press.current.moved = true;
    }

    if (isPanning && lastPan.current) {
      const dx = p.x - lastPan.current.x;
      const dy = p.y - lastPan.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPan.current = p;
      return;
    }

    const snapped = screenToGrid(p.x, p.y);
    setSnappedGridPos((prev) => (prev.x === snapped.x && prev.y === snapped.y ? prev : snapped));

    if (activeTool === 'curve' && curveDragging) {
      if (curveDragging === 'start') setCurveStart(snapped);
      else if (curveDragging === 'end') setCurveEnd(snapped);
      else if (curveDragging === 'center') setCurveCenter(snapped);
      else if (curveStart && curveEnd && curveCenter) {
        const target = curveDragging === 'width1' ? curveStart : curveEnd;
        const vt = { x: target.x - curveCenter.x, y: target.y - curveCenter.y };
        const vp = { x: snapped.x - curveCenter.x, y: snapped.y - curveCenter.y };
        const lenSq = vt.x ** 2 + vt.y ** 2;
        setCurveWidth(clamp(lenSq > 0 ? (vp.x * vt.x + vp.y * vt.y) / lenSq : 0, -0.4, 0.9));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (gesture.current) {
      if (pointers.current.size < 2) gesture.current = null;
      if (pointers.current.size === 0) press.current = null;
      lastPan.current = null;
      return;
    }

    const down = press.current;
    press.current = null;
    setCurveDragging(null);

    if (isPanning) {
      setIsPanning(false);
      lastPan.current = null;
      return;
    }
    if (!down || down.button !== 0) return;

    const snapped = screenToGrid(p.x, p.y);

    if (shapeStart) {
      const dx = snapped.x - shapeStart.x;
      const dy = snapped.y - shapeStart.y;
      const minX = Math.min(shapeStart.x, snapped.x);
      const maxX = Math.max(shapeStart.x, snapped.x);
      const minY = Math.min(shapeStart.y, snapped.y);
      const maxY = Math.max(shapeStart.y, snapped.y);
      const bigEnough = maxX - minX >= GRID_SPACING && maxY - minY >= GRID_SPACING;

      if (activeTool === 'circle' && Math.hypot(dx, dy) >= GRID_SPACING) {
        const pts = generateCirclePoints(shapeStart.x, shapeStart.y, Math.round(Math.hypot(dx, dy)));
        if (pts.length >= 3) onShapeComplete(pts);
      } else if (activeTool === 'box' && bigEnough) {
        onShapeComplete([
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ]);
      } else if (activeTool === 'triangle' && bigEnough) {
        onShapeComplete([
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: Math.round((minX + maxX) / 2), y: maxY },
        ]);
      }
      setShapeStart(null);
      return;
    }

    if (activeTool === 'polygon' && !down.moved) {
      // Judge closing from the tap itself: touch has no preceding hover to rely on.
      const first = existingPoints[0];
      if (existingPoints.length >= 3 && Math.hypot(snapped.x - first.x, snapped.y - first.y) < GRID_SPACING * 1.5) {
        closePolygon();
        return;
      }
      const last = existingPoints[existingPoints.length - 1];
      if (last && last.x === snapped.x && last.y === snapped.y) return;
      setExistingPoints((prev) => [...prev, snapped]);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      press.current = null;
      lastPan.current = null;
    }
    setIsPanning(false);
    setShapeStart(null);
    setCurveDragging(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    zoomAround(zoom * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  };

  // ---- Keyboard ------------------------------------------------------------
  const keys = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keys.current = (e, down) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setSpaceHeld(down);
      return;
    }
    if (!down) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      handleClear();
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      handleUndo();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleUndo();
    } else if (e.key === 'Enter') {
      if (activeTool === 'curve') completeCurve();
      else closePolygon();
    }
  };
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keys.current(e, true);
    const onUp = (e: KeyboardEvent) => keys.current(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ---- Rendering -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(dimensions.width * dpr);
    canvas.height = Math.round(dimensions.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const o = origin();
    const step = GRID_SPACING * zoom;

    // Grid: hide the fine lines when zoomed far out so it never turns to mush.
    const drawLines = (vertical: boolean) => {
      const length = vertical ? dimensions.width : dimensions.height;
      const originPos = vertical ? o.x : o.y;
      const first = Math.floor(-originPos / step);
      const last = Math.ceil((length - originPos) / step);
      for (let i = first; i <= last; i++) {
        const major = i % 5 === 0;
        if (!major && step < 7) continue;
        const pos = Math.round(originPos + i * step) + 0.5;
        ctx.strokeStyle = i === 0 ? (vertical ? COLORS.axisY : COLORS.axisX) : major ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.lineWidth = i === 0 ? 1.5 : 1;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, dimensions.height);
        } else {
          ctx.moveTo(0, pos);
          ctx.lineTo(dimensions.width, pos);
        }
        ctx.stroke();
      }
    };
    drawLines(false);
    drawLines(true);

    ctx.font = FONT;
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('X', dimensions.width - 18, clamp(o.y - 8, 14, dimensions.height - 8));
    ctx.fillText('Y', clamp(o.x + 8, 8, dimensions.width - 14), 20);

    // Existing bodies, as reference outlines. Those whose top is on the sketch plane read as solid.
    bodies.forEach((body) => {
      if (!body.visible || body.points.length < 3) return;
      const onPlane = Math.abs((body.elevation ?? 0) + body.extrusionHeight - planeElevation) < 0.5;
      const selected = selectedBodyIds.includes(body.id);
      ctx.beginPath();
      [body.points, ...(body.holes ?? [])].forEach((ring) => {
        ring.forEach((p, i) => {
          const sp = gridToScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
      });
      ctx.fillStyle = onPlane ? 'rgba(237, 239, 245, 0.07)' : 'rgba(237, 239, 245, 0.025)';
      ctx.fill('evenodd');
      ctx.setLineDash(onPlane ? [] : [5, 5]);
      ctx.strokeStyle = selected ? COLORS.accent : onPlane ? '#98a1b6' : '#4a5168';
      ctx.lineWidth = selected || onPlane ? 1.75 : 1.25;
      ctx.stroke();
      ctx.setLineDash([]);

      if (onPlane || selected) {
        const cx = body.points.reduce((a, p) => a + p.x, 0) / body.points.length;
        const cy = body.points.reduce((a, p) => a + p.y, 0) / body.points.length;
        const sp = gridToScreen(cx, cy);
        ctx.font = FONT;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(body.name, sp.x, sp.y);
      }
    });

    const pill = (text: string, x: number, y: number, color: string) => {
      ctx.font = FONT;
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = COLORS.pillBg;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 11, w, 22, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5f6f8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    };

    const dot = (p: Point2D, r: number, fill: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const hoverScreen = gridToScreen(snappedGridPos.x, snappedGridPos.y);

    // Polygon draft
    if (activeTool === 'polygon' && existingPoints.length > 0) {
      const pts = existingPoints.map((p) => gridToScreen(p.x, p.y));
      if (pts.length >= 3) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = COLORS.accentFill;
        ctx.fill();
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (!isPanning) {
        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.setLineDash([6, 5]);
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(hoverScreen.x, hoverScreen.y);
        ctx.strokeStyle = isHoveringStartNode ? COLORS.close : COLORS.accent;
        ctx.stroke();
        ctx.setLineDash([]);

        const prev = existingPoints[existingPoints.length - 1];
        const length = Math.round(Math.hypot(snappedGridPos.x - prev.x, snappedGridPos.y - prev.y));
        if (length > 0) {
          pill(`${length} mm`, (last.x + hoverScreen.x) / 2, (last.y + hoverScreen.y) / 2 - 16, COLORS.accent);
        }
      }
      pts.forEach((p, i) => dot(p, i === 0 ? 6 : 4, i === 0 ? COLORS.close : COLORS.accent));
    }

    // Curve draft
    if (activeTool === 'curve' && curveStart) {
      const s = gridToScreen(curveStart.x, curveStart.y);
      if (!curveEnd) {
        ctx.beginPath();
        ctx.setLineDash([6, 5]);
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(hoverScreen.x, hoverScreen.y);
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        dot(s, 6, COLORS.accent);
      } else if (curveCenter) {
        const e = gridToScreen(curveEnd.x, curveEnd.y);
        const c = gridToScreen(curveCenter.x, curveCenter.y);
        const { c1, c2 } = curveHandles(curveStart, curveEnd, curveCenter, curveWidth);
        const h1 = gridToScreen(c1.x, c1.y);
        const h2 = gridToScreen(c2.x, c2.y);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.bezierCurveTo(h1.x, h1.y, h2.x, h2.y, e.x, e.y);
        ctx.closePath();
        ctx.fillStyle = COLORS.accentFill;
        ctx.fill();

        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.moveTo(h1.x, h1.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(h2.x, h2.y);
        ctx.strokeStyle = COLORS.handle;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.bezierCurveTo(h1.x, h1.y, h2.x, h2.y, e.x, e.y);
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 3;
        ctx.stroke();

        pill(
          `Span ${Math.round(Math.hypot(curveEnd.x - curveStart.x, curveEnd.y - curveStart.y))} mm · Bend ${Math.round(curveWidth * 100)}%`,
          c.x,
          c.y - 26,
          COLORS.accent
        );
        dot(s, 7, COLORS.accent);
        dot(e, 7, COLORS.accent);
        dot(c, 8, COLORS.handle);
        dot(h1, 5, COLORS.handle);
        dot(h2, 5, COLORS.handle);
      }
    }

    // Drag-shape preview
    if (shapeStart && !isPanning) {
      const a = gridToScreen(shapeStart.x, shapeStart.y);
      const b = hoverScreen;
      const w = Math.abs(snappedGridPos.x - shapeStart.x);
      const h = Math.abs(snappedGridPos.y - shapeStart.y);
      ctx.strokeStyle = COLORS.accent;
      ctx.fillStyle = COLORS.accentFill;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      let text = '';
      if (activeTool === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        text = `R ${Math.round(Math.hypot(snappedGridPos.x - shapeStart.x, snappedGridPos.y - shapeStart.y))} mm`;
      } else if (activeTool === 'box') {
        ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
        text = `${w} × ${h} mm`;
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo((a.x + b.x) / 2, b.y);
        ctx.lineTo(b.x, a.y);
        ctx.closePath();
        text = `${w} × ${h} mm`;
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (w > 0 || h > 0) pill(text, (a.x + b.x) / 2, (a.y + b.y) / 2, COLORS.accent);
    }

    // Snap cursor
    if (!isPanning && !shapeStart && !(activeTool === 'curve' && curveDragging)) {
      ctx.beginPath();
      ctx.arc(hoverScreen.x, hoverScreen.y, isHoveringStartNode ? 9 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = isHoveringStartNode ? COLORS.close : COLORS.accent;
      ctx.fillStyle = isHoveringStartNode ? 'rgba(52,211,153,0.2)' : 'rgba(110,91,255,0.3)';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }, [
    dimensions,
    origin,
    zoom,
    gridToScreen,
    existingPoints,
    snappedGridPos,
    isPanning,
    isHoveringStartNode,
    bodies,
    selectedBodyIds,
    planeElevation,
    activeTool,
    shapeStart,
    curveStart,
    curveEnd,
    curveCenter,
    curveWidth,
    curveDragging,
  ]);

  // ---- UI ------------------------------------------------------------------
  const hasDraft = existingPoints.length > 0 || curveStart !== null;
  const hint = (() => {
    if (activeTool === 'polygon') {
      if (existingPoints.length === 0) return 'Click to place the first point';
      if (existingPoints.length < 3) return 'Add at least three points';
      return 'Click the green point (or press Enter) to close and extrude';
    }
    if (activeTool === 'curve') {
      if (!curveStart) return 'Click to place the curve start';
      if (!curveEnd) return 'Click to place the curve end';
      return 'Drag the amber handles to bend, then Extrude curve';
    }
    return 'Click and drag on the grid';
  })();

  const planeOptions = (() => {
    const seen = new Set<number>([0]);
    const options = [{ value: 0, label: 'Ground · 0 mm' }];
    bodies.forEach((b) => {
      if (!b.visible) return;
      const top = Math.round(((b.elevation ?? 0) + b.extrusionHeight) * 100) / 100;
      if (seen.has(top)) return;
      seen.add(top);
      options.push({ value: top, label: `Top of ${b.name} · ${top} mm` });
    });
    return options;
  })();

  const cursor = isPanning ? 'grabbing' : spaceHeld ? 'grab' : 'crosshair';
  const iconBtn =
    'w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 disabled:text-slate-600 disabled:hover:bg-transparent transition-colors';

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden select-none touch-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        style={{ cursor, width: dimensions.width, height: dimensions.height }}
        className="block touch-none"
      />

      {/* Tool picker */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1.5rem)] flex items-center gap-0.5 p-1 rounded-2xl bg-slate-800/90 backdrop-blur-xl border border-white/10 shadow-xl overflow-x-auto no-scrollbar">
        {TOOLS.map(({ id, label, icon: Icon, title }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTool(id)}
            title={title}
            aria-pressed={activeTool === id}
            className={`h-9 px-3 rounded-xl flex items-center gap-2 text-[13px] font-medium shrink-0 transition-colors ${
              activeTool === id ? 'bg-accent-500 text-white shadow-md shadow-accent-500/25' : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon size={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Sketch plane */}
      <div className="absolute top-16 left-3 right-3 flex flex-wrap items-center gap-x-3 gap-y-2 pointer-events-none">
      <label className="pointer-events-auto flex items-center gap-2 min-w-0">
        <span className="text-xs text-slate-400 shrink-0">Sketching on</span>
        <select
          value={planeOptions.some((o) => o.value === planeElevation) ? planeElevation : 'custom'}
          onChange={(e) => e.target.value !== 'custom' && onPlaneChange(parseFloat(e.target.value))}
          aria-label="Sketch plane"
          className="h-9 pl-3 pr-8 rounded-xl bg-slate-800/95 border border-white/10 text-[13px] font-medium text-slate-100 focus:outline-none focus:border-accent-400 shadow-xl truncate"
        >
          {planeOptions.map((o) => (
            <option key={`${o.value}-${o.label}`} value={o.value}>
              {o.label}
            </option>
          ))}
          {!planeOptions.some((o) => o.value === planeElevation) && <option value="custom">{`Custom · ${planeElevation} mm`}</option>}
        </select>
      </label>
      {/* Hint */}
      <span className="px-3 py-1 rounded-full bg-slate-900/70 text-xs text-slate-300 min-w-0 truncate">{hint}</span>
      </div>

      {/* Coordinates */}
      <div className="absolute bottom-3 left-3 text-xs text-slate-500 tabular-nums pointer-events-none hidden sm:block">
        X {snappedGridPos.x} · Y {snappedGridPos.y} mm · Hold Space to pan, scroll to zoom
      </div>

      {/* Actions */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        {activeTool === 'curve' && curveStart && curveEnd && (
          <button
            type="button"
            onClick={completeCurve}
            className="h-9 px-4 rounded-xl bg-accent-500 hover:bg-accent-400 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-accent-500/25 transition-colors"
          >
            <Check size={15} strokeWidth={2.5} /> Extrude curve
          </button>
        )}
        {activeTool === 'polygon' && existingPoints.length >= 3 && (
          <button
            type="button"
            onClick={closePolygon}
            className="h-9 px-4 rounded-xl bg-accent-500 hover:bg-accent-400 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-accent-500/25 transition-colors"
          >
            <Check size={15} strokeWidth={2.5} /> Close &amp; extrude
          </button>
        )}
        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-800/90 backdrop-blur-xl border border-white/10 shadow-xl">
          <button type="button" onClick={handleUndo} disabled={!hasDraft} className={iconBtn} title="Undo last point (⌘Z)" aria-label="Undo last point">
            <Undo2 size={16} />
          </button>
          <button type="button" onClick={handleClear} disabled={!hasDraft} className={iconBtn} title="Clear sketch (Esc)" aria-label="Clear sketch">
            <Trash2 size={16} />
          </button>
          <div className="w-px h-5 bg-white/10 mx-0.5" />
          <button
            type="button"
            onClick={() => zoomAround(zoom / 1.25, dimensions.width / 2 + pan.x, dimensions.height / 2 + pan.y)}
            className={iconBtn}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span className="w-10 text-center text-xs text-slate-400 tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomAround(zoom * 1.25, dimensions.width / 2 + pan.x, dimensions.height / 2 + pan.y)}
            className={iconBtn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setPan({ x: 0, y: 0 });
              setZoom(1);
            }}
            className={iconBtn}
            title="Reset view"
            aria-label="Reset view"
          >
            <Focus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
