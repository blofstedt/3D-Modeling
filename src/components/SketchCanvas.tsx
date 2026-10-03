/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Point2D, GRID_SPACING } from '../types';
import { createClosedCurveRibbon } from '../utils/geometry';
import { 
  Undo, 
  Trash2, 
  Check, 
  Focus, 
  Move, 
  Circle, 
  Square, 
  Triangle, 
  PenTool, 
  Activity 
} from 'lucide-react';

interface SketchCanvasProps {
  onShapeComplete: (points: Point2D[]) => void;
  existingPoints: Point2D[];
  setExistingPoints: React.Dispatch<React.SetStateAction<Point2D[]>>;
}

export default function SketchCanvas({
  onShapeComplete,
  existingPoints,
  setExistingPoints,
}: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  const [mousePos, setMousePos] = useState<Point2D>({ x: 0, y: 0 }); // In canvas screen coords
  const [snappedGridPos, setSnappedGridPos] = useState<Point2D>({ x: 0, y: 0 }); // In grid coords (origin centered, Y-up)
  const [panOffset, setPanOffset] = useState<Point2D>({ x: 0, y: 0 }); // Direct user panning offset
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point2D>({ x: 0, y: 0 });

  // Standard interactive shape drawing tools
  const [activeTool, setActiveTool] = useState<'polygon' | 'circle' | 'box' | 'triangle' | 'curve'>('polygon');
  // Tracks the starting node coordinates when click-dragging structured shapes
  const [shapeStart, setShapeStart] = useState<Point2D | null>(null);

  // Curve tool interactive nodes states
  const [curveStart, setCurveStart] = useState<Point2D | null>(null);
  const [curveEnd, setCurveEnd] = useState<Point2D | null>(null);
  const [curveCenter, setCurveCenter] = useState<Point2D | null>(null);
  const [curveWidth, setCurveWidth] = useState<number>(0.35);
  const [curveDraggingNode, setCurveDraggingNode] = useState<'start' | 'end' | 'center' | 'width1' | 'width2' | null>(null);

  // Catmull-Rom math equations for smooth curves
  const interpolateSpline = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    );
  };

  // Generates smooth interpolated loop of points
  const getSplinePoints = useCallback((pts: Point2D[], closed: boolean): Point2D[] => {
    if (pts.length < 2) return pts;
    if (pts.length === 2 && !closed) return pts;
    
    const count = pts.length;
    const result: Point2D[] = [];
    const subdivisions = 12; // points per curve segment
    
    const segments = closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % count];
      
      const p0 = closed 
        ? pts[(i - 1 + count) % count] 
        : (i === 0 ? p1 : pts[i - 1]);
        
      const p3 = closed 
        ? pts[(i + 2) % count] 
        : (i + 1 === count - 1 ? p2 : pts[i + 2]);

      for (let s = 0; s < subdivisions; s++) {
        const t = s / subdivisions;
        const rx = interpolateSpline(p0.x, p1.x, p2.x, p3.x, t);
        const ry = interpolateSpline(p0.y, p1.y, p2.y, p3.y, t);
        result.push({ x: Math.round(rx), y: Math.round(ry) });
      }
    }
    
    if (closed) {
      return result;
    } else {
      result.push(pts[count - 1]);
      return result;
    }
  }, []);

  // Generates 24-point circle
  const generateCirclePoints = (cx: number, cy: number, radius: number): Point2D[] => {
    const points: Point2D[] = [];
    const segments = 24;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.round(cx + radius * Math.cos(angle));
      const y = Math.round(cy + radius * Math.sin(angle));
      if (points.length === 0 || x !== points[points.length - 1].x || y !== points[points.length - 1].y) {
        points.push({ x, y });
      }
    }
    if (points.length > 2) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first.x === last.x && first.y === last.y) {
        points.pop();
      }
    }
    return points;
  };

  // Update canvas width/height to fill container reactively
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: width || 600, height: height || 600 });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Convert canvas screen coordinates to centered grid coordinates (Y-up)
  const screenToGrid = useCallback((screenX: number, screenY: number): Point2D => {
    const originX = dimensions.width / 2 + panOffset.x;
    const originY = dimensions.height / 2 + panOffset.y;
    
    const rawGridX = screenX - originX;
    const rawGridY = originY - screenY;

    const snappedGridX = Math.round(rawGridX / GRID_SPACING) * GRID_SPACING;
    const snappedGridY = Math.round(rawGridY / GRID_SPACING) * GRID_SPACING;

    return { x: snappedGridX, y: snappedGridY };
  }, [dimensions, panOffset]);

  // Convert grid coordinates back to screen coordinates
  const gridToScreen = useCallback((gridX: number, gridY: number): Point2D => {
    const originX = dimensions.width / 2 + panOffset.x;
    const originY = dimensions.height / 2 + panOffset.y;
    return {
      x: originX + gridX,
      y: originY - gridY,
    };
  }, [dimensions, panOffset]);

  // Handle snapping calculations during mouse movement
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePos({ x, y });

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanOffset({
        x: panOffset.x + dx,
        y: panOffset.y + dy,
      });
      setPanStart({ x: e.clientX, y: e.clientY });
    } else {
      const snapped = screenToGrid(x, y);
      setSnappedGridPos(snapped);

      if (activeTool === 'curve' && curveDraggingNode) {
        if (curveDraggingNode === 'start') {
          setCurveStart(snapped);
        } else if (curveDraggingNode === 'end') {
          setCurveEnd(snapped);
        } else if (curveDraggingNode === 'center') {
          setCurveCenter(snapped);
        } else if (curveDraggingNode === 'width1' || curveDraggingNode === 'width2') {
          if (curveStart && curveEnd && curveCenter) {
            const C = curveCenter;
            const targetNode = curveDraggingNode === 'width1' ? curveStart : curveEnd;
            const v_target = { x: targetNode.x - C.x, y: targetNode.y - C.y };
            const v_pointer = { x: snapped.x - C.x, y: snapped.y - C.y };
            
            const dotProduct = v_pointer.x * v_target.x + v_pointer.y * v_target.y;
            const lenSq = v_target.x ** 2 + v_target.y ** 2;
            const w = lenSq > 0 ? dotProduct / lenSq : 0;
            setCurveWidth(Math.max(-0.4, Math.min(0.9, w)));
          }
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return; // Only process left click for drawing

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const snapped = screenToGrid(x, y);

    // Dynamic node-based curve tool
    if (activeTool === 'curve') {
      if (!curveStart) {
        setCurveStart(snapped);
      } else if (!curveEnd) {
        setCurveEnd(snapped);
        // Estimate an elegant perpendicular initial curve center node
        const midX = (curveStart.x + snapped.x) / 2;
        const midY = (curveStart.y + snapped.y) / 2;
        const baselineX = snapped.x - curveStart.x;
        const baselineY = snapped.y - curveStart.y;
        const length = Math.hypot(baselineX, baselineY);
        const perpX = length > 0 ? -baselineY / length : 0;
        const perpY = length > 0 ? baselineX / length : 1;
        const offset = 40;
        const cx = Math.round((midX + perpX * offset) / GRID_SPACING) * GRID_SPACING;
        const cy = Math.round((midY + perpY * offset) / GRID_SPACING) * GRID_SPACING;
        
        setCurveCenter({ x: cx, y: cy });
        setCurveWidth(0.35);
      } else if (curveCenter) {
        // We are adjusting the curve. Investigate handle node mouse grabs.
        const sStart = gridToScreen(curveStart.x, curveStart.y);
        const sEnd = gridToScreen(curveEnd.x, curveEnd.y);
        const sCenter = gridToScreen(curveCenter.x, curveCenter.y);
        
        const C1 = {
          x: curveCenter.x + (curveStart.x - curveCenter.x) * curveWidth,
          y: curveCenter.y + (curveStart.y - curveCenter.y) * curveWidth,
        };
        const C2 = {
          x: curveCenter.x + (curveEnd.x - curveCenter.x) * curveWidth,
          y: curveCenter.y + (curveEnd.y - curveCenter.y) * curveWidth,
        };
        
        const sC1 = gridToScreen(C1.x, C1.y);
        const sC2 = gridToScreen(C2.x, C2.y);
        
        const threshold = 16;
        if (Math.hypot(x - sCenter.x, y - sCenter.y) < threshold) {
          setCurveDraggingNode('center');
        } else if (Math.hypot(x - sC1.x, y - sC1.y) < threshold) {
          setCurveDraggingNode('width1');
        } else if (Math.hypot(x - sC2.x, y - sC2.y) < threshold) {
          setCurveDraggingNode('width2');
        } else if (Math.hypot(x - sStart.x, y - sStart.y) < threshold) {
          setCurveDraggingNode('start');
        } else if (Math.hypot(x - sEnd.x, y - sEnd.y) < threshold) {
          setCurveDraggingNode('end');
        }
      }
      return;
    }

    // If using a drag-based shape tool, initiate starting node anchor lock
    if (activeTool === 'circle' || activeTool === 'box' || activeTool === 'triangle') {
      setShapeStart(snapped);
      return;
    }

    // Otherwise, polygon tools:
    // If we click the start point and have at least 3 points, close the shape!
    if (existingPoints.length >= 3) {
      const startPoint = existingPoints[0];
      const distToStart = Math.hypot(snapped.x - startPoint.x, snapped.y - startPoint.y);
      if (distToStart < GRID_SPACING * 1.5) {
        onShapeComplete([...existingPoints]);
        return;
      }
    }

    if (existingPoints.length > 0) {
      const lastPoint = existingPoints[existingPoints.length - 1];
      if (lastPoint.x === snapped.x && lastPoint.y === snapped.y) {
        return; // Don't allow duplicate consecutive points
      }
    }

    setExistingPoints((prev) => [...prev, snapped]);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCurveDraggingNode(null);
    if (e.button === 1 || isPanning) {
      setIsPanning(false);
      return;
    }

    // Finalize drag-based shape drawing on release
    if (shapeStart) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const snapped = screenToGrid(x, y);

      const dx = snapped.x - shapeStart.x;
      const dy = snapped.y - shapeStart.y;
      const dist = Math.hypot(dx, dy);

      if (dist >= GRID_SPACING) {
        if (activeTool === 'circle') {
          const radius = Math.round(dist);
          const circlePts = generateCirclePoints(shapeStart.x, shapeStart.y, radius);
          if (circlePts.length >= 3) {
            onShapeComplete(circlePts);
          }
        } else if (activeTool === 'box') {
          const minX = Math.min(shapeStart.x, snapped.x);
          const maxX = Math.max(shapeStart.x, snapped.x);
          const minY = Math.min(shapeStart.y, snapped.y);
          const maxY = Math.max(shapeStart.y, snapped.y);
          
          if (maxX - minX >= GRID_SPACING && maxY - minY >= GRID_SPACING) {
            const boxPts = [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY }
            ];
            onShapeComplete(boxPts);
          }
        } else if (activeTool === 'triangle') {
          const minX = Math.min(shapeStart.x, snapped.x);
          const maxX = Math.max(shapeStart.x, snapped.x);
          const minY = Math.min(shapeStart.y, snapped.y);
          const maxY = Math.max(shapeStart.y, snapped.y);

          if (maxX - minX >= GRID_SPACING && maxY - minY >= GRID_SPACING) {
            const triPts = [
              { x: minX, y: minY },
              { x: Math.round((minX + maxX) / 2), y: maxY },
              { x: maxX, y: minY }
            ];
            onShapeComplete(triPts);
          }
        }
      }
      setShapeStart(null);
    }
  };

  // Mobile Touch Support: Single finger draws, two fingers pan
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const clientX = touch.clientX;
      const clientY = touch.clientY;
      handleMouseDown({
        clientX,
        clientY,
        button: 0,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any);
    } else if (e.touches.length === 2) {
      setIsPanning(true);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      setPanStart({ x: midX - panOffset.x, y: midY - panOffset.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        shiftKey: false,
      } as any);
    } else if (e.touches.length === 2 && isPanning) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      setPanOffset({ x: midX - panStart.x, y: midY - panStart.y });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      handleMouseUp({
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0,
      } as any);
    }
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
    setCurveStart(null);
    setCurveEnd(null);
    setCurveCenter(null);
    setCurveWidth(0.35);
    setCurveDraggingNode(null);
  };

  const handleCompleteCurveShape = () => {
    if (!curveStart || !curveEnd || !curveCenter) return;
    const pts: Point2D[] = [];
    const steps = 30; // fine-grained 30 smooth steps for premium extrusion resolution

    const C1 = {
      x: curveCenter.x + (curveStart.x - curveCenter.x) * curveWidth,
      y: curveCenter.y + (curveStart.y - curveCenter.y) * curveWidth,
    };
    const C2 = {
      x: curveCenter.x + (curveEnd.x - curveCenter.x) * curveWidth,
      y: curveCenter.y + (curveEnd.y - curveCenter.y) * curveWidth,
    };

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round((1 - t) ** 3 * curveStart.x + 3 * (1 - t) ** 2 * t * C1.x + 3 * (1 - t) * t ** 2 * C2.x + t ** 3 * curveEnd.x);
      const y = Math.round((1 - t) ** 3 * curveStart.y + 3 * (1 - t) ** 2 * t * C1.y + 3 * (1 - t) * t ** 2 * C2.y + t ** 3 * curveEnd.y);
      if (pts.length === 0 || pts[pts.length - 1].x !== x || pts[pts.length - 1].y !== y) {
        pts.push({ x, y });
      }
    }

    // Create an extrudable closed polygon ribbon with manifold thickness
    const closedRibbon = createClosedCurveRibbon(pts, 26);
    if (closedRibbon.length >= 3) {
      onShapeComplete(closedRibbon);
    }

    // Reset workflow states
    setCurveStart(null);
    setCurveEnd(null);
    setCurveCenter(null);
    setCurveWidth(0.35);
    setCurveDraggingNode(null);
  };

  const handleResetPan = () => {
    setPanOffset({ x: 0, y: 0 });
  };

  // Hover checks to signal start node closure
  const isHoveringStartNode = useCallback(() => {
    if (existingPoints.length < 3) return false;
    const startPoint = existingPoints[0];
    const distance = Math.hypot(snappedGridPos.x - startPoint.x, snappedGridPos.y - startPoint.y);
    return distance < GRID_SPACING * 1.5;
  }, [existingPoints, snappedGridPos]);

  // Canvas drawing effect loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Render grid background
    ctx.fillStyle = '#0f172a'; // slate-900 background
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const gridColor = '#1e293b';       // slate-800
    const axisColor = '#334155';       // slate-700
    const originX = dimensions.width / 2 + panOffset.x;
    const originY = dimensions.height / 2 + panOffset.y;

    // Horizontal grid lines
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = gridColor;
    let hLineOffset = originY % GRID_SPACING;
    for (let y = hLineOffset; y < dimensions.height; y += GRID_SPACING) {
      ctx.beginPath();
      if (Math.abs(y - originY) < 1) {
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
      }
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }

    // Vertical grid lines
    let vLineOffset = originX % GRID_SPACING;
    for (let x = vLineOffset; x < dimensions.width; x += GRID_SPACING) {
      ctx.beginPath();
      if (Math.abs(x - originX) < 1) {
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
      }
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }

    // Text labels of primary axes
    ctx.fillStyle = '#475569'; // slate-600
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Y +', originX + 8, 20);
    ctx.fillText('X +', dimensions.width - 25, originY - 8);
    ctx.fillText(`Grid snap: ${GRID_SPACING}px`, 15, dimensions.height - 15);

    // 1. Draw existing freeform segments
    if (activeTool !== 'curve' && existingPoints.length > 0) {
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(59, 130, 246, 0.5)'; // neon blue glow

      let renderPoints = [...existingPoints];
      if (activeTool === 'curve') {
        renderPoints = getSplinePoints(existingPoints, false);
      }

      ctx.beginPath();
      const firstScreenPt = gridToScreen(renderPoints[0].x, renderPoints[0].y);
      ctx.moveTo(firstScreenPt.x, firstScreenPt.y);
      
      for (let i = 1; i < renderPoints.length; i++) {
        const screenPt = gridToScreen(renderPoints[i].x, renderPoints[i].y);
        ctx.lineTo(screenPt.x, screenPt.y);
      }
      ctx.strokeStyle = activeTool === 'curve' ? '#818cf8' : '#3b82f6';
      ctx.stroke();

      ctx.shadowBlur = 0; // reset

      // Draw active segment nodes/vertices
      existingPoints.forEach((pt, index) => {
        const screenPt = gridToScreen(pt.x, pt.y);
        ctx.beginPath();
        if (index === 0) {
          ctx.arc(screenPt.x, screenPt.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981'; // green start node
        } else {
          ctx.arc(screenPt.x, screenPt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = activeTool === 'curve' ? '#a5b4fc' : '#60a5fa';
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Draw segment preview from last point to standard snapped position
      if (!isPanning) {
        const lastPt = existingPoints[existingPoints.length - 1];
        const lastScreenPt = gridToScreen(lastPt.x, lastPt.y);
        const snappedScreenPt = gridToScreen(snappedGridPos.x, snappedGridPos.y);

        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isHoveringStartNode() ? '#10b981' : (activeTool === 'curve' ? '#a5b4fc' : '#60a5fa');
        ctx.lineWidth = 2;

        if (activeTool === 'curve') {
          const tempPts = getSplinePoints([...existingPoints, snappedGridPos], false);
          ctx.moveTo(lastScreenPt.x, lastScreenPt.y);
          const lastControlIndexInSpline = tempPts.findIndex(pt => Math.abs(pt.x - lastPt.x) < 2 && Math.abs(pt.y - lastPt.y) < 2);
          const startIndex = lastControlIndexInSpline >= 0 ? lastControlIndexInSpline : 0;
          
          for (let s = startIndex; s < tempPts.length; s++) {
            const screenPt = gridToScreen(tempPts[s].x, tempPts[s].y);
            ctx.lineTo(screenPt.x, screenPt.y);
          }
        } else {
          ctx.moveTo(lastScreenPt.x, lastScreenPt.y);
          ctx.lineTo(snappedScreenPt.x, snappedScreenPt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Label dimensions
        const dx = snappedGridPos.x - lastPt.x;
        const dy = snappedGridPos.y - lastPt.y;
        const length = Math.round(Math.hypot(dx, dy));
        
        if (length > 0) {
          const midX = (lastScreenPt.x + snappedScreenPt.x) / 2;
          const midY = (lastScreenPt.y + snappedScreenPt.y) / 2;
          
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = activeTool === 'curve' ? '#818cf8' : '#3b82f6';
          ctx.lineWidth = 1;
          const text = `${length} units`;
          const textWidth = ctx.measureText(text).width;
          
          ctx.beginPath();
          ctx.roundRect(midX - textWidth/2 - 6, midY - 10, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY - 1);
        }
      }
    }

    // 1b. Premium Interactive Node-Based Curve rendering
    if (activeTool === 'curve' && curveStart) {
      const screenStart = gridToScreen(curveStart.x, curveStart.y);
      if (!curveEnd) {
        // Step 1: Baseline drafting preview
        const screenSnapped = gridToScreen(snappedGridPos.x, snappedGridPos.y);
        ctx.beginPath();
        ctx.moveTo(screenStart.x, screenStart.y);
        ctx.lineTo(screenSnapped.x, screenSnapped.y);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#818cf8';
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Start node indicator
        ctx.beginPath();
        ctx.arc(screenStart.x, screenStart.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (curveCenter) {
        // Step 2: Full bezier curve and handles rendering
        const screenEnd = gridToScreen(curveEnd.x, curveEnd.y);
        const screenCenter = gridToScreen(curveCenter.x, curveCenter.y);

        const C1 = {
          x: curveCenter.x + (curveStart.x - curveCenter.x) * curveWidth,
          y: curveCenter.y + (curveStart.y - curveCenter.y) * curveWidth,
        };
        const C2 = {
          x: curveCenter.x + (curveEnd.x - curveCenter.x) * curveWidth,
          y: curveCenter.y + (curveEnd.y - curveCenter.y) * curveWidth,
        };

        const screenC1 = gridToScreen(C1.x, C1.y);
        const screenC2 = gridToScreen(C2.x, C2.y);

        // Filled preview backing region
        ctx.beginPath();
        ctx.moveTo(screenStart.x, screenStart.y);
        ctx.bezierCurveTo(screenC1.x, screenC1.y, screenC2.x, screenC2.y, screenEnd.x, screenEnd.y);
        ctx.lineTo(screenStart.x, screenStart.y);
        ctx.fillStyle = 'rgba(129, 140, 248, 0.08)';
        ctx.fill();

        // Extruded straight baseline representer
        ctx.beginPath();
        ctx.moveTo(screenEnd.x, screenEnd.y);
        ctx.lineTo(screenStart.x, screenStart.y);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tangents handles line
        ctx.beginPath();
        ctx.moveTo(screenCenter.x, screenCenter.y);
        ctx.lineTo(screenC1.x, screenC1.y);
        ctx.moveTo(screenCenter.x, screenCenter.y);
        ctx.lineTo(screenC2.x, screenC2.y);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Master splined contour
        ctx.beginPath();
        ctx.moveTo(screenStart.x, screenStart.y);
        ctx.bezierCurveTo(screenC1.x, screenC1.y, screenC2.x, screenC2.y, screenEnd.x, screenEnd.y);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(129, 140, 248, 0.4)';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Display property overlay tooltips
        const dx = curveEnd.x - curveStart.x;
        const dy = curveEnd.y - curveStart.y;
        const spanDist = Math.round(Math.hypot(dx, dy));
        
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.font = '10px "JetBrains Mono", monospace';
        const text = `Span: ${spanDist} units • Curve: ${Math.round(curveWidth * 100)}%`;
        const textWidth = ctx.measureText(text).width;
        ctx.beginPath();
        ctx.roundRect(screenCenter.x - textWidth/2 - 6, screenCenter.y - 28, textWidth + 12, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, screenCenter.x, screenCenter.y - 19);

        // Nodes
        ctx.beginPath();
        ctx.arc(screenStart.x, screenStart.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenEnd.x, screenEnd.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#eab308';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenC1.x, screenC1.y, 5, 0, Math.PI * 2);
        ctx.arc(screenC2.x, screenC2.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 2. Draw structured shape dragging previews (circle, box, triangle)
    if (shapeStart && !isPanning) {
      const startScreen = gridToScreen(shapeStart.x, shapeStart.y);
      const endScreen = gridToScreen(snappedGridPos.x, snappedGridPos.y);
      
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(234, 179, 8, 0.4)'; // amber/yellow preview glow
      ctx.strokeStyle = '#eab308';
      ctx.setLineDash([6, 4]);

      if (activeTool === 'circle') {
        const radius = Math.round(Math.hypot(snappedGridPos.x - shapeStart.x, snappedGridPos.y - shapeStart.y));
        const screenRadius = Math.round(Math.hypot(endScreen.x - startScreen.x, endScreen.y - startScreen.y));
        
        ctx.beginPath();
        ctx.arc(startScreen.x, startScreen.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#eab308';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(startScreen.x, startScreen.y, screenRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(endScreen.x, endScreen.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        if (radius > 0) {
          const midX = (startScreen.x + endScreen.x) / 2;
          const midY = (startScreen.y + endScreen.y) / 2;
          const text = `R: ${radius} units`;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(midX - textWidth/2 - 6, midY - 10, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY - 1);
        }
      } else if (activeTool === 'box') {
        const x1 = shapeStart.x;
        const y1 = shapeStart.y;
        const x2 = snappedGridPos.x;
        const y2 = snappedGridPos.y;
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const screenW = endScreen.x - startScreen.x;
        const screenH = endScreen.y - startScreen.y;

        ctx.beginPath();
        ctx.rect(startScreen.x, startScreen.y, screenW, screenH);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        if (width > 0 && height > 0) {
          const midX = (startScreen.x + endScreen.x) / 2;
          const midY = (startScreen.y + endScreen.y) / 2;
          const text = `${width} × ${height}`;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(midX - textWidth/2 - 6, midY - 10, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY - 1);
        }
      } else if (activeTool === 'triangle') {
        const x1 = shapeStart.x;
        const y1 = shapeStart.y;
        const x2 = snappedGridPos.x;
        const y2 = snappedGridPos.y;
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        const p1 = startScreen;
        const p2 = { x: (startScreen.x + endScreen.x) / 2, y: endScreen.y };
        const p3 = { x: endScreen.x, y: startScreen.y };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Bounding helper
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = '#64748b';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.rect(startScreen.x, startScreen.y, endScreen.x - startScreen.x, endScreen.y - startScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (width > 0 && height > 0) {
          const midX = (startScreen.x + endScreen.x) / 2;
          const midY = (startScreen.y + endScreen.y) / 2;
          const text = `W: ${width} • H: ${height}`;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.roundRect(midX - textWidth/2 - 6, midY - 10, textWidth + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY - 1);
        }
      }
    }

    // 3. Draw standard snapping preview cursor node
    if (!isPanning && !shapeStart && (activeTool !== 'curve' || !curveStart)) {
      const activeScreenPt = gridToScreen(snappedGridPos.x, snappedGridPos.y);
      ctx.beginPath();
      const isClosing = isHoveringStartNode();
      
      if (isClosing) {
        ctx.arc(activeScreenPt.x, activeScreenPt.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();
      } else {
        ctx.arc(activeScreenPt.x, activeScreenPt.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.fill();
      }
    }

    // Direct axis orientation indicator widget top right
    const widgetX = dimensions.width - 50;
    const widgetY = 50;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ef4444'; // X Red
    ctx.beginPath();
    ctx.moveTo(widgetX, widgetY);
    ctx.lineTo(widgetX + 25, widgetY);
    ctx.stroke();
    
    ctx.strokeStyle = '#10b981'; // Y Green
    ctx.beginPath();
    ctx.moveTo(widgetX, widgetY);
    ctx.lineTo(widgetX, widgetY - 25);
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', widgetX + 28, widgetY);
    ctx.fillText('Y', widgetX - 3, widgetY - 32);

  }, [dimensions, existingPoints, snappedGridPos, panOffset, isPanning, gridToScreen, isHoveringStartNode, activeTool, shapeStart, getSplinePoints, curveStart, curveEnd, curveCenter, curveWidth]);

  // Keyboard shortcut listener for escape and undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExistingPoints([]);
        setShapeStart(null);
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setExistingPoints]);

  return (
    <div id="sketch-canvas-container" ref={containerRef} className="relative w-full flex-1 min-h-[300px] h-full bg-white/5 backdrop-blur-md overflow-hidden cursor-crosshair rounded-2xl border border-white/10 shadow-2xl select-none animate-fade-in flex flex-col">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseLeave={() => {
          setIsPanning(false);
          setShapeStart(null);
        }}
        className="block w-full h-full flex-1 min-h-0 touch-none"
      />

      {/* Floating Shape Tool Selector Toolbar top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1 sm:gap-1.5 shadow-2xl z-25 pointer-events-auto">
        <div className="text-white/40 uppercase font-mono font-bold text-[8px] sm:text-[9px] tracking-wider mr-1 sm:mr-2 select-none border-r border-white/10 pr-1.5 sm:pr-2 leading-none">
          shape
        </div>
        
        <button
          onClick={() => {
            setActiveTool('polygon');
            setExistingPoints([]);
            setCurveStart(null);
            setCurveEnd(null);
            setCurveCenter(null);
            setCurveDraggingNode(null);
          }}
          title="Polygon Tool: Left-click points, connect to close shape"
          className={`p-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 font-mono transition-all ${
            activeTool === 'polygon'
              ? 'bg-cyan-600 border border-cyan-400 text-white shadow-md shadow-cyan-500/20'
              : 'hover:bg-white/5 border border-transparent text-white/60 hover:text-white'
          }`}
        >
          <PenTool size={11} />
          <span className="hidden leading-none xs:inline">Poly</span>
        </button>

        <button
          onClick={() => {
            setActiveTool('circle');
            setExistingPoints([]);
            setCurveStart(null);
            setCurveEnd(null);
            setCurveCenter(null);
            setCurveDraggingNode(null);
          }}
          title="Circle Tool: Click and hold, then drag outwards to size radius"
          className={`p-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 font-mono transition-all ${
            activeTool === 'circle'
              ? 'bg-cyan-600 border border-cyan-400 text-white shadow-md shadow-cyan-500/20'
              : 'hover:bg-white/5 border border-transparent text-white/60 hover:text-white'
          }`}
        >
          <Circle size={11} />
          <span className="hidden leading-none xs:inline">Circle</span>
        </button>

        <button
          onClick={() => {
            setActiveTool('box');
            setExistingPoints([]);
            setCurveStart(null);
            setCurveEnd(null);
            setCurveCenter(null);
            setCurveDraggingNode(null);
          }}
          title="Rectangle/Box Tool: Click and hold, drag to opposite corner"
          className={`p-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 font-mono transition-all ${
            activeTool === 'box'
              ? 'bg-cyan-600 border border-cyan-400 text-white shadow-md shadow-cyan-500/20'
              : 'hover:bg-white/5 border border-transparent text-white/60 hover:text-white'
          }`}
        >
          <Square size={11} />
          <span className="hidden leading-none xs:inline">Box</span>
        </button>

        <button
          onClick={() => {
            setActiveTool('triangle');
            setExistingPoints([]);
            setCurveStart(null);
            setCurveEnd(null);
            setCurveCenter(null);
            setCurveDraggingNode(null);
          }}
          title="Triangle Tool: Click and hold, drag bounding rectangle"
          className={`p-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 font-mono transition-all ${
            activeTool === 'triangle'
              ? 'bg-cyan-600 border border-cyan-400 text-white shadow-md shadow-cyan-500/20'
              : 'hover:bg-white/5 border border-transparent text-white/60 hover:text-white'
          }`}
        >
          <Triangle size={11} />
          <span className="hidden leading-none xs:inline">Tri</span>
        </button>

        <button
          onClick={() => {
            setActiveTool('curve');
            setExistingPoints([]);
            setCurveStart(null);
            setCurveEnd(null);
            setCurveCenter(null);
            setCurveDraggingNode(null);
          }}
          title="Curve Tool: Specify start, end, and drag center node and tangent shape"
          className={`p-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 font-mono transition-all ${
            activeTool === 'curve'
              ? 'bg-cyan-600 border border-cyan-400 text-white shadow-md shadow-cyan-500/20'
              : 'hover:bg-white/5 border border-transparent text-white/60 hover:text-white'
          }`}
        >
          <Activity size={11} className="text-cyan-300" />
          <span className="hidden leading-none xs:inline">Curve</span>
        </button>
      </div>

      {/* Hover Coordinate Tracker Overlay near bottom left */}
      {!isPanning && (
        <div className="absolute bottom-4 left-4 flex flex-col gap-1 items-start bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 font-mono text-xs text-white/80 pointer-events-none transition-all duration-200 shadow-md">
          <div className="text-white/40 font-semibold uppercase text-[10px] tracking-wider mb-0.5">Cursor coordinates</div>
          <div className="flex gap-4">
            <span>X: <strong className="text-white">{snappedGridPos.x}</strong></span>
            <span>Y: <strong className="text-white">{snappedGridPos.y}</strong></span>
          </div>
        </div>
      )}

      {/* Floating Status / mode indicator label inside canvas top left */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 items-start pointer-events-none select-none">
        <div className="bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white/80 flex items-center gap-1.5 font-medium shadow-sm pointer-events-auto">
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
          <span>Sketch Mode: Active Snapping</span>
        </div>

        {activeTool !== 'curve' && existingPoints.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-cyan-300 font-mono">
            <strong>{existingPoints.length}</strong> control {existingPoints.length === 1 ? 'node' : 'nodes'}
          </div>
        )}

        {activeTool === 'curve' && curveStart && (
          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-indigo-300 font-mono">
            <strong>{curveEnd ? '3' : '1'}</strong> active curve {curveEnd ? 'nodes (Drag handles)' : 'node (Set End Point)'}
          </div>
        )}
      </div>

      {/* Action buttons bottom right */}
      <div className="absolute bottom-4 right-4 flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleResetPan}
          title="Recenter Grid (Or drag with Space / Shift / Middle Mouse)"
          className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/10 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs font-mono font-medium shadow-sm"
        >
          <Focus size={15} />
          <span className="hidden md:inline">Recenter</span>
        </button>

        {(existingPoints.length > 0 || curveStart) && (
          <>
            <button
              onClick={handleUndo}
              title="Undo last node (Ctrl+Z)"
              className="p-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/20 text-amber-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-sm"
            >
              <Undo size={15} />
              <span>Undo</span>
            </button>
            <button
              onClick={handleClear}
              title="Clear current sketch draft"
              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-sm"
            >
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </>
        )}

        {activeTool === 'curve' && curveStart && curveEnd && (
          <button
            onClick={handleCompleteCurveShape}
            title="Render and extrude selected curvature"
            className="p-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/20 text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-lg shadow-emerald-500/20 animate-pulse-subtle"
            id="btn-complete-curve"
          >
            <Check size={15} />
            <span>Extrude Curve</span>
          </button>
        )}
      </div>

      {/* Tool Tip helper banner top center, offset below shapes toolbar */}
      <div className="absolute top-18 left-1/2 -translate-x-1/2 text-center pointer-events-none hidden md:block select-none">
        <div className="bg-slate-900/60 backdrop-blur-md px-4 py-1.5 border border-white/5 rounded-full shadow-lg text-[10px] font-mono text-white/80">
          {activeTool === 'polygon' && (
            existingPoints.length === 0 ? (
              <span><strong className="text-cyan-400 font-semibold">CLICK</strong> grid points to draw polygon outline</span>
            ) : existingPoints.length < 3 ? (
              <span className="text-amber-400 font-semibold">Need at least 3 points before closing the loop</span>
            ) : (
              <span className="text-emerald-400 font-bold">Click green start node to close &amp; extrude</span>
            )
          )}
          {activeTool === 'curve' && (
            !curveStart ? (
              <span><strong className="text-indigo-400 font-semibold">CLICK</strong> grid point to set curve <strong className="text-white">START</strong> node</span>
            ) : !curveEnd ? (
              <span><strong className="text-indigo-400 font-semibold">CLICK</strong> grid point to set curve <strong className="text-white">END</strong> node</span>
            ) : (
              <span><strong className="text-amber-400 font-bold">DRAG</strong> Yellow/Amber handles to bend curve & shoulder shape. Then click <strong className="text-emerald-400 font-bold">EXTRUDE CURVE</strong></span>
            )
          )}
          {(activeTool === 'circle' || activeTool === 'box' || activeTool === 'triangle') && (
            <span><strong className="text-yellow-400 font-semibold">CLICK &amp; DRAG</strong> on workspace grid to draw standard {activeTool}</span>
          )}
        </div>
      </div>
      
      {/* Pan instructions bottom center */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-center pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-mono text-white/30 flex items-center gap-1">
          <Move size={10} /> Shift + Left-click or Space or Middle Mouse to Pan
        </span>
      </div>
    </div>
  );
}
