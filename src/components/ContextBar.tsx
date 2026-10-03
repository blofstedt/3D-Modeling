/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowUpDown,
  Boxes,
  Copy,
  Merge,
  Move3d,
  PenLine,
  RotateCcw,
  RotateCw,
  Scissors,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { BevelStyle, Body3D, CadTool, EdgeSel } from '../types';
import { edgeSize, edgeStyle } from '../utils/edges';
import { outwardNormal, wallEnds, withOutline } from '../utils/outline';
import { selectionBounds } from '../utils/transform';
import { EditPart } from './ModelViewer3D';

interface ContextBarProps {
  tool: CadTool;
  selected: Body3D[];
  edges: EdgeSel[];
  part: EditPart | null;
  bodyCount: number;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  onClearEdges: () => void;
  onSetTool: (tool: CadTool) => void;
  onMove: (dx: number, dy: number, dz: number) => void;
  onRotate: (degrees: number) => void;
  onSketchOnTop: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUnion: () => void;
}

const stepClass =
  'h-7 min-w-8 px-1.5 rounded-md bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-200 tabular-nums transition-colors';
const actionClass =
  'h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[13px] font-medium text-slate-200 hover:text-white hover:bg-white/10 transition-colors disabled:text-slate-600 disabled:hover:bg-transparent';

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** A labelled number box that applies its value on Enter or when it loses focus. */
function NumberBox({
  label,
  value,
  unit = 'mm',
  step = 1,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
}) {
  const shown = Math.round(value * 100) / 100;
  const commit = (el: HTMLInputElement) => {
    const v = parseFloat(el.value);
    if (!Number.isNaN(v) && v !== shown) onCommit(v);
    else el.value = String(shown);
  };
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-none text-slate-400">{label}</span>
      <span className="flex items-center gap-1">
        <input
          key={shown}
          type="number"
          step={step}
          min={min}
          max={max}
          defaultValue={shown}
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = String(shown);
              e.currentTarget.blur();
            }
          }}
          aria-label={`${label} in ${unit}`}
          className="w-[4.5rem] h-7 px-2 rounded-md bg-white/6 border border-white/8 text-sm font-semibold text-white tabular-nums focus:outline-none focus:border-accent-400"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </span>
    </label>
  );
}

function Steps({ values, onStep, unit = 'mm' }: { values: number[]; onStep: (n: number) => void; unit?: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Nudge">
      {values.map((v) => (
        <button key={v} type="button" onClick={() => onStep(v)} className={stepClass} title={`${signed(v)} ${unit}`}>
          {signed(v)}
        </button>
      ))}
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

function Title({ icon: Icon, label, sub }: { icon: typeof Move3d; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 self-center">
      <div className="w-8 h-8 rounded-lg bg-accent-500/15 text-accent-300 flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white leading-tight">{label}</div>
        {sub && <div className="text-[11px] leading-tight text-slate-400 truncate max-w-48">{sub}</div>}
      </div>
    </div>
  );
}

export default function ContextBar(props: ContextBarProps) {
  const { tool, selected, edges, part, onUpdateBody, onSetTool } = props;
  const body = selected.length === 1 ? selected[0] : null;
  const subject = body ? body.name : `${selected.length} bodies`;

  // ---- Fillet & bevel ---------------------------------------------------
  if (tool === 'bevel') {
    const first = edges.length ? selected.find((b) => b.id === edges[0].bodyId) : undefined;
    if (!first || !edges.length) {
      return (
        <Shell>
          <Title icon={Sparkles} label="Fillet & bevel" sub="Click an edge, or a corner line, on any body" />
          <span className="text-xs text-slate-400 self-center">Shift-click to select several</span>
        </Shell>
      );
    }
    const onlyCorners = edges.every((e) => e.kind === 'corner');
    const size = edgeSize(first, edges[0]);
    const style = edgeStyle(first, edges.find((e) => e.kind !== 'corner') ?? edges[0]) ?? 'round';
    const edgeLabel = `${edges.length} ${onlyCorners ? (edges.length === 1 ? 'corner' : 'corners') : edges.length === 1 ? 'edge' : 'edges'}`;
    return (
      <Shell>
        <Title icon={Sparkles} label={edgeLabel} sub={first.name} />
        <NumberBox
          label={onlyCorners ? 'Radius' : 'Size'}
          value={size}
          step={0.5}
          min={0}
          max={30}
          onCommit={(v) => props.onEdgeChange(edges, { size: Math.max(0, v) })}
        />
        <Steps values={[-1, -0.5, 0.5, 1]} onStep={(n) => props.onEdgeChange(edges, { size: Math.max(0, size + n) })} />
        {!onlyCorners && (
          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-white/6" role="group" aria-label="Edge profile">
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
        <button type="button" onClick={() => props.onEdgeChange(edges, { size: 0 })} className={`${actionClass} self-center`} title="Remove bevel (Del)">
          <Trash2 size={14} /> Remove
        </button>
        <button type="button" onClick={props.onClearEdges} className={`${actionClass} self-center`} title="Deselect edges">
          <X size={14} />
        </button>
      </Shell>
    );
  }

  if (!selected.length) return null;

  // ---- Move -------------------------------------------------------------
  if (tool === 'move') {
    const b = selectionBounds(selected)!;
    return (
      <Shell>
        <Title icon={Move3d} label="Move" sub={subject} />
        <NumberBox label="X" value={b.centerX} onCommit={(v) => props.onMove(v - b.centerX, 0, 0)} />
        <NumberBox label="Y" value={b.centerY} onCommit={(v) => props.onMove(0, v - b.centerY, 0)} />
        <NumberBox label="Height above ground" value={b.minElevation} min={0} onCommit={(v) => props.onMove(0, 0, Math.max(0, v) - b.minElevation)} />
        <div className="flex items-center gap-1 self-end h-7" role="group" aria-label="Rotate">
          <button type="button" onClick={() => props.onRotate(-90)} className={stepClass} title="Rotate 90° clockwise" aria-label="Rotate 90 degrees clockwise">
            <RotateCw size={13} />
          </button>
          <button type="button" onClick={() => props.onRotate(90)} className={stepClass} title="Rotate 90° counter-clockwise" aria-label="Rotate 90 degrees counter-clockwise">
            <RotateCcw size={13} />
          </button>
        </div>
      </Shell>
    );
  }

  // ---- Push / pull ------------------------------------------------------
  if (tool === 'extrude') {
    if (!body) {
      return (
        <Shell>
          <Title icon={ArrowUpDown} label="Push / pull" sub="Select a single body" />
        </Shell>
      );
    }
    const partOfBody = part?.bodyId === body.id ? part : null;
    const wall = partOfBody?.type === 'wall' && partOfBody.index !== undefined ? partOfBody : null;

    if (wall) {
      const offset = (distance: number) => {
        const ends = wallEnds(body, wall.index!);
        if (!ends) return;
        const n = outwardNormal(ends.a, ends.b, ends.winding);
        const base = (body.basePoints ?? body.points).map((p) => ({ ...p }));
        [wall.index!, (wall.index! + 1) % base.length].forEach((i) => {
          base[i] = { x: Math.round((base[i].x + n.x * distance) * 10) / 10, y: Math.round((base[i].y + n.y * distance) * 10) / 10 };
        });
        onUpdateBody(body.id, withOutline(body, { basePoints: base }));
      };
      return (
        <Shell>
          <Title icon={ArrowUpDown} label="Wall" sub={`${body.name} · drag the wall or its arrow`} />
          <Steps values={[-5, -1, 1, 5]} onStep={offset} />
        </Shell>
      );
    }

    const setHeight = (v: number) => onUpdateBody(body.id, { extrusionHeight: Math.max(2, Math.min(600, Math.round(v))) });
    return (
      <Shell>
        <Title icon={ArrowUpDown} label="Top face" sub={`${body.name} · drag the face or its arrow`} />
        <NumberBox label="Height" value={body.extrusionHeight} min={2} max={600} onCommit={setHeight} />
        <Steps values={[-10, -1, 1, 10]} onStep={(n) => setHeight(body.extrusionHeight + n)} />
      </Shell>
    );
  }

  // ---- Select: what can I do with this? --------------------------------
  const multi = selected.length > 1;
  return (
    <Shell>
      <Title icon={Boxes} label={subject} sub={multi ? 'Shift-click to add or remove' : `${body!.extrusionHeight} mm tall`} />
      <div className="flex flex-wrap items-center gap-0.5 self-center">
        <button type="button" className={actionClass} onClick={() => onSetTool('move')} title="Move and rotate (M)">
          <Move3d size={15} /> Move
        </button>
        {!multi && (
          <>
            <button type="button" className={actionClass} onClick={() => onSetTool('extrude')} title="Push / pull faces (E)">
              <ArrowUpDown size={15} /> Push / pull
            </button>
            <button type="button" className={actionClass} onClick={() => onSetTool('bevel')} title="Fillet and bevel edges (B)">
              <Sparkles size={15} /> Fillet &amp; bevel
            </button>
            <button type="button" className={actionClass} onClick={props.onSketchOnTop} title="Draw on this body's top face">
              <PenLine size={15} /> Sketch on top
            </button>
          </>
        )}
        {multi && (
          <>
            <button type="button" className={actionClass} onClick={props.onGroup} title="Group (G)">
              <Boxes size={15} /> Group
            </button>
            <button type="button" className={actionClass} onClick={props.onUnion} title="Union (U)">
              <Merge size={15} /> Union
            </button>
          </>
        )}
        {props.bodyCount >= 2 && (
          <button type="button" className={actionClass} onClick={() => onSetTool('cut')} title="Cut one body from another (C)">
            <Scissors size={15} /> Cut
          </button>
        )}
        {!multi && (
          <button type="button" className={actionClass} onClick={props.onDuplicate} title="Duplicate (⌘D)" aria-label="Duplicate">
            <Copy size={15} />
          </button>
        )}
        <button type="button" className={`${actionClass} hover:text-rose-300`} onClick={props.onDelete} title="Delete (Del)" aria-label="Delete">
          <Trash2 size={15} />
        </button>
      </div>
    </Shell>
  );
}
