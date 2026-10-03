/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowUpDown, 
  Sparkles, 
  Move3d, 
  Check, 
  X, 
  Edit3, 
  Scissors, 
  PenTool, 
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import { Body3D } from '../types';

export interface ShaprDimensionBadgeProps {
  body: Body3D;
  activeEditPart: {
    bodyId: string;
    type: 'face' | 'edge' | 'corner' | 'gizmo';
    faceType?: 'top' | 'side';
    startIndex?: number;
    endIndex?: number;
    index?: number;
  } | null;
  isDragging: boolean;
  dragDelta: number;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onOpenCut?: () => void;
  onOpenBevel?: () => void;
  onDeleteBody?: (id: string) => void;
  onSwitchToSketchOnFace?: () => void;
}

export default function ShaprDimensionBadge({
  body,
  activeEditPart,
  isDragging,
  dragDelta,
  onUpdateBody,
  onOpenCut,
  onOpenBevel,
  onDeleteBody,
  onSwitchToSketchOnFace,
}: ShaprDimensionBadgeProps) {
  const [isEditingNumeric, setIsEditingNumeric] = useState(false);
  const [numericInputValue, setNumericInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEdge = activeEditPart?.type === 'edge' || (activeEditPart?.type === 'gizmo' && activeEditPart.startIndex !== undefined);
  const isTopFace = !activeEditPart || activeEditPart.type === 'face' || activeEditPart.faceType === 'top';

  // Dimension value
  const currentValue = isEdge
    ? (body.bevelSize ?? 2)
    : body.extrusionHeight;

  useEffect(() => {
    if (isEditingNumeric && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingNumeric]);

  const handleStartEdit = () => {
    setNumericInputValue(currentValue.toString());
    setIsEditingNumeric(true);
  };

  const handleCommitEdit = () => {
    const parsed = parseFloat(numericInputValue);
    if (!isNaN(parsed)) {
      if (isEdge) {
        const val = Math.max(0, Math.min(25, parsed));
        onUpdateBody(body.id, { 
          bevelSize: val, 
          bevelEnabled: val > 0 
        });
      } else {
        const val = Math.max(2, Math.min(600, parsed));
        onUpdateBody(body.id, { extrusionHeight: val });
      }
    }
    setIsEditingNumeric(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitEdit();
    } else if (e.key === 'Escape') {
      setIsEditingNumeric(false);
    }
  };

  const adjustValue = (delta: number) => {
    if (isEdge) {
      const next = Math.max(0, Math.min(25, (body.bevelSize ?? 2) + delta));
      onUpdateBody(body.id, { bevelSize: next, bevelEnabled: next > 0 });
    } else {
      const next = Math.max(2, Math.min(600, body.extrusionHeight + delta));
      onUpdateBody(body.id, { extrusionHeight: next });
    }
  };

  // Toggle bevel round vs chamfer
  const toggleChamferRound = () => {
    const currentSegments = body.bevelSegments ?? 3;
    const nextSegments = currentSegments <= 1 ? 4 : 1;
    onUpdateBody(body.id, {
      bevelSegments: nextSegments,
      bevelEnabled: true,
      bevelSize: body.bevelSize && body.bevelSize > 0 ? body.bevelSize : 2,
    });
  };

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150 max-w-[94%] select-none">
      {/* Floating Shapr3D Glass Capsule */}
      <div className="bg-[#0b1120]/95 backdrop-blur-2xl border border-cyan-400/40 rounded-2xl shadow-2xl px-3 py-2 flex items-center gap-2.5 sm:gap-3 text-white border-t-2 border-t-cyan-400">
        {/* Left Icon indicator */}
        <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-400/30 shrink-0">
          {isEdge ? (
            <Sparkles size={15} className="text-amber-400" />
          ) : (
            <ArrowUpDown size={15} className="text-cyan-400" />
          )}
        </div>

        {/* Feature Title & Dimension Pill */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold truncate">
            <span>{isEdge ? 'Fillet / Chamfer' : 'Extrusion Height'}</span>
            <span className="text-white/30">•</span>
            <span className="text-cyan-300 truncate max-w-[100px]">{body.name}</span>
          </div>

          {/* Interactive Value or Inline Input */}
          <div className="flex items-center gap-2 mt-0.5">
            {isEditingNumeric ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="number"
                  step={isEdge ? '0.5' : '1'}
                  value={numericInputValue}
                  onChange={(e) => setNumericInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-20 px-2 py-0.5 bg-slate-800 border border-cyan-400 rounded text-cyan-200 font-mono font-bold text-sm focus:outline-none focus:ring-1 focus:ring-cyan-300"
                />
                <span className="text-xs font-mono text-slate-400">mm</span>
                <button
                  onClick={handleCommitEdit}
                  className="p-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded cursor-pointer transition"
                  title="Apply"
                >
                  <Check size={12} className="stroke-[3]" />
                </button>
                <button
                  onClick={() => setIsEditingNumeric(false)}
                  className="p-1 bg-slate-700 hover:bg-slate-600 text-white rounded cursor-pointer transition"
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartEdit}
                className="group flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
                title="Click to type exact dimension"
              >
                <span className="font-mono font-black text-base tracking-tight text-white group-hover:text-cyan-300">
                  {currentValue.toFixed(isEdge ? 1 : 0)} mm
                </span>
                <Edit3 size={11} className="text-cyan-400 opacity-60 group-hover:opacity-100" />
              </button>
            )}

            {/* Live Dragging Delta indicator */}
            {isDragging && dragDelta !== 0 && (
              <span
                className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded-md ${
                  dragDelta > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                }`}
              >
                {dragDelta > 0 ? `+${dragDelta}` : dragDelta}
              </span>
            )}
          </div>
        </div>

        {/* Stepper Buttons for snap increments */}
        <div className="flex items-center gap-1 border-l border-white/10 pl-2">
          <button
            onClick={() => adjustValue(isEdge ? -1 : -10)}
            className="px-2 py-1 bg-white/5 hover:bg-white/15 active:bg-cyan-500 active:text-slate-950 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            title={isEdge ? '-1 mm' : '-10 mm'}
          >
            {isEdge ? '-1' : '-10'}
          </button>
          <button
            onClick={() => adjustValue(isEdge ? -0.5 : -2)}
            className="px-2 py-1 bg-white/5 hover:bg-white/15 active:bg-cyan-500 active:text-slate-950 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            title={isEdge ? '-0.5 mm' : '-2 mm'}
          >
            {isEdge ? '-0.5' : '-2'}
          </button>
          <button
            onClick={() => adjustValue(isEdge ? 0.5 : 2)}
            className="px-2 py-1 bg-white/5 hover:bg-white/15 active:bg-cyan-500 active:text-slate-950 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            title={isEdge ? '+0.5 mm' : '+2 mm'}
          >
            {isEdge ? '+0.5' : '+2'}
          </button>
          <button
            onClick={() => adjustValue(isEdge ? 1 : 10)}
            className="px-2 py-1 bg-white/5 hover:bg-white/15 active:bg-cyan-500 active:text-slate-950 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer"
            title={isEdge ? '+1 mm' : '+10 mm'}
          >
            {isEdge ? '+1' : '+10'}
          </button>
        </div>

        {/* Chamfer / Round Toggle for Edges */}
        {isEdge && (
          <div className="border-l border-white/10 pl-2">
            <button
              onClick={toggleChamferRound}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1"
              title="Toggle Round Fillet vs Chamfer Angle"
            >
              <span>{(body.bevelSegments ?? 3) <= 1 ? 'Chamfer' : 'Round'}</span>
            </button>
          </div>
        )}

        {/* Quick Context Action Pills */}
        <div className="hidden lg:flex items-center gap-1 border-l border-white/10 pl-2">
          {onOpenBevel && (
            <button
              onClick={onOpenBevel}
              className="p-1.5 bg-white/5 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 rounded-xl transition cursor-pointer"
              title="Fillet / Chamfer Settings"
            >
              <Sparkles size={13} />
            </button>
          )}
          {onOpenCut && (
            <button
              onClick={onOpenCut}
              className="p-1.5 bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-xl transition cursor-pointer"
              title="Cut Out"
            >
              <Scissors size={13} />
            </button>
          )}
          {onSwitchToSketchOnFace && (
            <button
              onClick={onSwitchToSketchOnFace}
              className="p-1.5 bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-300 rounded-xl transition cursor-pointer"
              title="Sketch on Face (S)"
            >
              <PenTool size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
