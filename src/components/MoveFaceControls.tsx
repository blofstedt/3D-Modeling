/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpDown, Check, Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { Body3D } from '../types';
import { EditPart } from './ModelViewer3D';

interface MoveFaceControlsProps {
  activeEditPart: EditPart | null;
  body: Body3D;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onClose: () => void;
}

const step =
  'h-8 min-w-9 px-2 rounded-lg bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-100 tabular-nums transition-colors flex items-center justify-center gap-1';

export default function MoveFaceControls({ activeEditPart, body, onUpdateBody, onClose }: MoveFaceControlsProps) {
  const wallSelected =
    activeEditPart?.bodyId === body.id &&
    activeEditPart.type === 'edge' &&
    activeEditPart.startIndex !== undefined &&
    activeEditPart.endIndex !== undefined;

  const setHeight = (value: number) =>
    onUpdateBody(body.id, { extrusionHeight: Math.max(2, Math.min(600, Math.round(value))) });

  const offsetWall = (distance: number) => {
    if (!wallSelected || !activeEditPart) return;
    const i1 = activeEditPart.startIndex!;
    const i2 = activeEditPart.endIndex!;
    const pts = body.points.map((p) => ({ ...p }));
    const p1 = pts[i1];
    const p2 = pts[i2];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (len < 0.001) return;
    const nx = -(p2.y - p1.y) / len;
    const ny = (p2.x - p1.x) / len;
    const move = (p: { x: number; y: number }) => ({
      x: Math.round((p.x + nx * distance) * 10) / 10,
      y: Math.round((p.y + ny * distance) * 10) / 10,
    });
    pts[i1] = move(p1);
    pts[i2] = move(p2);

    const base = body.basePoints;
    if (base && base.length === body.points.length) {
      const nextBase = base.map((p) => ({ ...p }));
      nextBase[i1] = move(base[i1]);
      nextBase[i2] = move(base[i2]);
      onUpdateBody(body.id, { points: pts, basePoints: nextBase });
    } else {
      onUpdateBody(body.id, { points: pts, basePoints: pts, cornerRadius: 0 });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl max-w-full flex-wrap justify-center"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <ArrowUpDown size={15} className="text-accent-300" />
        <span className="font-semibold text-white">{wallSelected ? 'Wall offset' : 'Height'}</span>
        <span className="text-slate-500 truncate max-w-32">{body.name}</span>
      </div>

      {wallSelected ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => offsetWall(-5)} className={step} title="Push wall in 5 mm">
            <Minus size={12} /> 5
          </button>
          <button type="button" onClick={() => offsetWall(-1)} className={step} title="Push wall in 1 mm">
            <Minus size={12} /> 1
          </button>
          <button type="button" onClick={() => offsetWall(1)} className={step} title="Pull wall out 1 mm">
            <Plus size={12} /> 1
          </button>
          <button type="button" onClick={() => offsetWall(5)} className={step} title="Pull wall out 5 mm">
            <Plus size={12} /> 5
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={5}
            max={Math.max(250, body.extrusionHeight)}
            step={1}
            value={body.extrusionHeight}
            onChange={(e) => setHeight(parseFloat(e.target.value))}
            aria-label="Height"
            className="w-28 sm:w-36 h-1"
          />
          <input
            type="number"
            min={2}
            max={600}
            value={body.extrusionHeight}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setHeight(v);
            }}
            aria-label="Height in millimetres"
            className="w-16 h-8 px-2 rounded-lg bg-white/6 border border-white/8 text-sm text-right text-white tabular-nums focus:outline-none focus:border-accent-400"
          />
          <span className="text-xs text-slate-500">mm</span>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Done"
        title="Done (Esc)"
        className="h-8 px-3 rounded-lg bg-accent-500 hover:bg-accent-400 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
      >
        <Check size={14} strokeWidth={2.5} /> Done
      </button>
    </motion.div>
  );
}
