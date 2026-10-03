/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
import { BevelStyle, Body3D, EdgeSel } from '../types';
import { edgeSize, edgeStyle } from '../utils/edges';
import { selectionBounds } from '../utils/transform';

interface ContextBarProps {
  selected: Body3D[];
  edges: EdgeSel[];
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

const stepClass =
  'h-7 min-w-8 px-1.5 rounded-md bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-200 tabular-nums transition-colors';

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** A labelled number box that applies its value on Enter or when it loses focus. */
function NumberBox({
  label,
  value,
  step = 1,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
}) {
  const shown = Math.round(value * 100) / 100;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const v = parseFloat(draft ?? '');
    setDraft(null);
    if (!Number.isNaN(v) && v !== shown) onCommit(v);
  };

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-none text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft ?? String(shown)}
        onFocus={(e) => {
          setDraft(String(shown));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        aria-label={`${label} in mm`}
        className="w-[4.25rem] h-7 px-2 rounded-md bg-white/6 border border-white/8 text-sm font-semibold text-white tabular-nums focus:outline-none focus:border-accent-400"
      />
    </label>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        active ? 'bg-accent-500/25 text-accent-200' : 'text-slate-300 hover:text-white hover:bg-white/10'
      } ${danger ? 'hover:text-rose-300' : ''}`}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
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
      <div className="pointer-events-auto max-w-full flex flex-wrap items-end justify-center gap-x-4 gap-y-2 px-3 py-2 rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl">
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
  const { selected, edges, onUpdateBody } = props;
  if (!selected.length) return null;

  const body = selected.length === 1 ? selected[0] : null;
  const bounds = selectionBounds(selected)!;

  // ---- An edge (or several) is selected: bevel it -------------------------
  if (edges.length && body) {
    const onlyCorners = edges.every((e) => e.kind === 'corner');
    const size = edgeSize(body, edges[0]);
    const style = edgeStyle(body, edges.find((e) => e.kind !== 'corner') ?? edges[0]) ?? 'round';
    const noun = onlyCorners ? 'corner' : 'edge';
    return (
      <Shell>
        <Title label={`${edges.length} ${noun}${edges.length === 1 ? '' : 's'}`} sub={`${body.name} · Shift-click to add more`} />
        <NumberBox
          label={onlyCorners ? 'Radius' : 'Bevel size'}
          value={size}
          step={0.5}
          min={0}
          max={30}
          onCommit={(v) => props.onEdgeChange(edges, { size: Math.max(0, v) })}
        />
        <div className="flex items-center gap-1 self-end h-7" role="group" aria-label="Nudge">
          {[-1, -0.5, 0.5, 1].map((n) => (
            <button key={n} type="button" onClick={() => props.onEdgeChange(edges, { size: Math.max(0, size + n) })} className={stepClass} title={`${signed(n)} mm`}>
              {signed(n)}
            </button>
          ))}
        </div>
        {!onlyCorners && (
          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-white/6 self-end" role="group" aria-label="Edge profile">
            {(['round', 'chamfer'] as BevelStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={style === s}
                onClick={() => props.onEdgeChange(edges, { style: s })}
                className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  style === s ? 'bg-white/14 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === 'round' ? 'Round' : 'Chamfer'}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-0.5 self-end">
          <IconButton icon={Trash2} label="Remove bevel (Del)" onClick={() => props.onEdgeChange(edges, { size: 0 })} danger />
          <IconButton icon={X} label="Done with edges (Esc)" onClick={props.onClearEdges} />
        </div>
      </Shell>
    );
  }

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
