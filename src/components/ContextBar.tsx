/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IconButton, NumberBox, signed, stepClass } from './controls';
import {
  Boxes,
  Copy,
  Focus,
  Merge,
  PenLine,
  Repeat,
  RotateCcw,
  RotateCw,
  Scissors,
  Shapes,
  SquarePen,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BevelStyle, Body3D, EdgeSel, FaceSel } from '../types';
import { edgeSize, edgeStyle } from '../utils/edges';
import { selectionBounds } from '../utils/transform';

interface ContextBarProps {
  selected: Body3D[];
  edges: EdgeSel[];
  face: FaceSel | null;
  onExtrudeFace: (face: FaceSel, delta: number) => void;
  onClearFace: () => void;
  bodyCount: number;
  isolated: boolean;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  onClearEdges: () => void;
  onMove: (dx: number, dy: number, dz: number) => void;
  onRotate: (degrees: number) => void;
  onResize: (width: number, depth: number) => void;
  onSketchOnTop: () => void;
  onEditOutline: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUnion: () => void;
  onCut: () => void;
  onPattern: () => void;
  onIsolate: () => void;
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-1.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute z-20 top-3 left-3 right-32 flex justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-full flex flex-wrap items-end justify-center gap-x-4 gap-y-2 px-3.5 py-2 rounded-[1.75rem] bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl">
        {children}
      </div>
    </div>
  );
}

function Title({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="min-w-0 self-center pr-1">
      <div className="text-sm font-semibold text-white leading-tight truncate max-w-44">{label}</div>
      {sub && <div className="text-[11px] leading-tight text-slate-400 truncate max-w-44">{sub}</div>}
    </div>
  );
}

/** Appears for whatever is selected and shows exactly what can be typed or done with it. */
export default function ContextBar(props: ContextBarProps) {
  const { selected, edges, face, onUpdateBody } = props;
  if (!selected.length) return null;

  const body = selected.length === 1 ? selected[0] : null;
  const bounds = selectionBounds(selected)!;

  // Edge and face edits live in a panel next to the selection (see FloatingControls).
  if (edges.length || face) return null;

  // ---- One shape: type any number you see ---------------------------------
  if (body) {
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxY - bounds.minY;
    return (
      <Shell>
        <Title label={body.name} sub={body.groupId ? 'In a group' : undefined} />
        <Group label="Size">
          <NumberBox label="Width" value={width} min={1} onCommit={(v) => props.onResize(v, depth)} />
          <NumberBox label="Depth" value={depth} min={1} onCommit={(v) => props.onResize(width, v)} />
          <NumberBox label="Height" value={body.extrusionHeight} min={2} max={600} onCommit={(v) => onUpdateBody(body.id, { extrusionHeight: Math.max(2, Math.min(600, Math.round(v))) })} />
        </Group>
        <Group label="Position">
          <NumberBox label="X" value={bounds.centerX} onCommit={(v) => props.onMove(v - bounds.centerX, 0, 0)} />
          <NumberBox label="Y" value={bounds.centerY} onCommit={(v) => props.onMove(0, v - bounds.centerY, 0)} />
          <NumberBox label="Lift" value={bounds.minElevation} min={0} onCommit={(v) => props.onMove(0, 0, Math.max(0, v) - bounds.minElevation)} />
        </Group>
        <div className="flex items-center gap-0.5 self-end">
          <IconButton icon={RotateCcw} label="Rotate 90° left" onClick={() => props.onRotate(90)} />
          <IconButton icon={RotateCw} label="Rotate 90° right" onClick={() => props.onRotate(-90)} />
          <span className="w-px h-5 bg-white/10 mx-1" />
          <IconButton icon={PenLine} label="Sketch on top of this shape (N)" onClick={props.onSketchOnTop} />
          <IconButton icon={SquarePen} label="Edit this shape's outline in 2D" onClick={props.onEditOutline} />
          <IconButton icon={Focus} label={props.isolated ? 'Show everything (I)' : 'Isolate this shape (I)'} onClick={props.onIsolate} active={props.isolated} />
          <IconButton icon={Copy} label="Duplicate (⌘D)" onClick={props.onDuplicate} />
          {props.bodyCount >= 2 && <IconButton icon={Scissors} label="Cut another shape out of this one (C)" onClick={props.onCut} />}
          <IconButton icon={Repeat} label="Repeat along a path (R)" onClick={props.onPattern} />
          <IconButton icon={Trash2} label="Delete (Del)" onClick={props.onDelete} danger />
        </div>
      </Shell>
    );
  }

  // ---- Several shapes: move them together, combine them -------------------
  return (
    <Shell>
      <Title label={`${selected.length} shapes`} sub="Drag one to move them all" />
      <Group label="Position">
        <NumberBox label="X" value={bounds.centerX} onCommit={(v) => props.onMove(v - bounds.centerX, 0, 0)} />
        <NumberBox label="Y" value={bounds.centerY} onCommit={(v) => props.onMove(0, v - bounds.centerY, 0)} />
        <NumberBox label="Lift" value={bounds.minElevation} min={0} onCommit={(v) => props.onMove(0, 0, Math.max(0, v) - bounds.minElevation)} />
      </Group>
      <div className="flex items-center gap-0.5 self-end">
        <IconButton icon={RotateCcw} label="Rotate 90° left" onClick={() => props.onRotate(90)} />
        <IconButton icon={RotateCw} label="Rotate 90° right" onClick={() => props.onRotate(-90)} />
        <span className="w-px h-5 bg-white/10 mx-1" />
        <IconButton icon={Boxes} label="Group so they move together (G)" onClick={props.onGroup} />
        <IconButton icon={Merge} label="Union into one shape (U)" onClick={props.onUnion} />
        <IconButton icon={Scissors} label="Cut one from another (C)" onClick={props.onCut} />
        <IconButton icon={Repeat} label="Repeat along a path (R)" onClick={props.onPattern} />
        <IconButton icon={Shapes} label={props.isolated ? 'Show everything (I)' : 'Isolate these shapes (I)'} onClick={props.onIsolate} active={props.isolated} />
        <IconButton icon={Trash2} label="Delete (Del)" onClick={props.onDelete} danger />
      </div>
    </Shell>
  );
}
