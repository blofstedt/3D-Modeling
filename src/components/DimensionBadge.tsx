/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, PenLine, Scissors, Sparkles, Trash2, X } from 'lucide-react';
import { Body3D } from '../types';
import { EditPart } from './ModelViewer3D';

export interface DimensionBadgeProps {
  body: Body3D;
  activeEditPart: EditPart | null;
  isDragging: boolean;
  dragDelta: number;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onOpenCut: () => void;
  onOpenBevel: () => void;
  onDeleteBody: (id: string) => void;
  onSwitchToSketchOnFace: () => void;
}

const HEIGHT_RANGE: [number, number] = [2, 600];
const BEVEL_RANGE: [number, number] = [0, 25];

const stepButton =
  'h-7 min-w-8 px-1.5 rounded-md bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-200 tabular-nums transition-colors';
const iconButton =
  'w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors';

export default function DimensionBadge({
  body,
  activeEditPart,
  isDragging,
  dragDelta,
  onUpdateBody,
  onOpenCut,
  onOpenBevel,
  onDeleteBody,
  onSwitchToSketchOnFace,
}: DimensionBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEdge = activeEditPart?.bodyId === body.id && activeEditPart.type === 'edge';
  const [min, max] = isEdge ? BEVEL_RANGE : HEIGHT_RANGE;
  const value = isEdge ? body.bevelSize ?? 2 : body.extrusionHeight;
  const steps = isEdge ? [-1, -0.5, 0.5, 1] : [-10, -2, 2, 10];

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Leave edit mode if the user switches body or feature underneath us.
  useEffect(() => setEditing(false), [body.id, isEdge]);

  const setValue = (next: number) => {
    const v = Math.max(min, Math.min(max, next));
    if (isEdge) onUpdateBody(body.id, { bevelSize: v, bevelEnabled: v > 0 });
    else onUpdateBody(body.id, { extrusionHeight: v });
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) setValue(parsed);
    setEditing(false);
  };

  const isChamfer = (body.bevelSegments ?? 3) <= 1;
  const toggleChamfer = () =>
    onUpdateBody(body.id, {
      bevelSegments: isChamfer ? 4 : 1,
      bevelEnabled: true,
      bevelSize: body.bevelSize && body.bevelSize > 0 ? body.bevelSize : 2,
    });

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const signed = (n: number) => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;

  return (
    <div className="absolute z-20 top-3 left-3 right-28 flex justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-full flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent-500/15 text-accent-300 flex items-center justify-center shrink-0">
            {isEdge ? <Sparkles size={16} /> : <ArrowUpDown size={16} />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] leading-tight text-slate-400 truncate max-w-40">
              {isEdge ? 'Fillet radius' : 'Height'} · {body.name}
            </div>
            <div className="flex items-center gap-1.5 h-7">
              {editing ? (
                <>
                  <input
                    ref={inputRef}
                    autoFocus
                    type="number"
                    min={min}
                    max={max}
                    step={isEdge ? 0.5 : 1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    aria-label="Exact value in millimetres"
                    className="w-20 h-7 px-2 rounded-md bg-slate-800 border border-accent-400 text-sm font-semibold text-white tabular-nums focus:outline-none"
                  />
                  <button type="button" onClick={commit} aria-label="Apply" className="w-7 h-7 rounded-md bg-accent-500 hover:bg-accent-400 text-white flex items-center justify-center">
                    <Check size={14} strokeWidth={2.5} />
                  </button>
                  <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="w-7 h-7 rounded-md bg-white/8 hover:bg-white/14 text-slate-200 flex items-center justify-center">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(String(value));
                      setEditing(true);
                    }}
                    title="Click to type an exact value"
                    className="h-7 px-2 rounded-md bg-white/6 hover:bg-white/12 text-sm font-semibold text-white tabular-nums transition-colors"
                  >
                    {fmt(value)} mm
                  </button>
                  {isDragging && dragDelta !== 0 && (
                    <span className={`text-xs font-medium tabular-nums ${dragDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {signed(dragDelta)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Nudge value">
          {steps.map((s) => (
            <button key={s} type="button" onClick={() => setValue(value + s)} className={stepButton} title={`${signed(s)} mm`}>
              {signed(s)}
            </button>
          ))}
        </div>

        {isEdge && (
          <button
            type="button"
            onClick={toggleChamfer}
            className="h-7 px-2.5 rounded-md bg-accent-500/15 hover:bg-accent-500/25 text-accent-200 text-xs font-medium transition-colors"
            title="Switch between round fillet and flat chamfer"
          >
            {isChamfer ? 'Chamfer' : 'Round'}
          </button>
        )}

        <div className="hidden sm:flex items-center gap-0.5 pl-2 border-l border-white/10">
          <button type="button" onClick={onOpenBevel} className={iconButton} title="Fillet & bevel (B)" aria-label="Fillet and bevel">
            <Sparkles size={15} />
          </button>
          <button type="button" onClick={onOpenCut} className={iconButton} title="Cut (C)" aria-label="Cut">
            <Scissors size={15} />
          </button>
          <button type="button" onClick={onSwitchToSketchOnFace} className={iconButton} title="New sketch (N)" aria-label="New sketch">
            <PenLine size={15} />
          </button>
          <button type="button" onClick={() => onDeleteBody(body.id)} className={`${iconButton} hover:text-rose-300`} title="Delete (Del)" aria-label="Delete body">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
