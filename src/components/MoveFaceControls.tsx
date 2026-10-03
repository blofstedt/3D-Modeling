/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Body3D } from '../types';
import { Move3d, Plus, Minus, ArrowUp, ArrowDown, Check, X, ArrowUpDown } from 'lucide-react';
import { motion } from 'motion/react';

interface MoveFaceControlsProps {
  activeEditPart: {
    bodyId: string;
    type: 'face' | 'edge' | 'corner';
    faceType?: 'top' | 'side';
    startIndex?: number;
    endIndex?: number;
    index?: number;
  } | null;
  body: Body3D | null;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onClose: () => void;
}

export default function MoveFaceControls({
  activeEditPart,
  body,
  onUpdateBody,
  onClose,
}: MoveFaceControlsProps) {
  if (!body) return null;

  // Default to top face if no specific part selected
  const isTopFace = !activeEditPart || activeEditPart.type === 'face' || activeEditPart.faceType === 'top';
  const isSideFace = Boolean(activeEditPart && (activeEditPart.type === 'edge' || activeEditPart.faceType === 'side'));

  // Handler to adjust height (Top Face Push/Pull)
  const adjustHeight = (delta: number) => {
    const newHeight = Math.max(5, Math.min(500, Math.round(body.extrusionHeight + delta)));
    onUpdateBody(body.id, { extrusionHeight: newHeight });
  };

  // Handler to push/pull side face outward or inward
  const offsetSideWall = (deltaDistance: number) => {
    if (!isSideFace || !activeEditPart || activeEditPart.startIndex === undefined || activeEditPart.endIndex === undefined) return;
    const pts = [...body.points];
    const n = pts.length;
    const i1 = activeEditPart.startIndex;
    const i2 = activeEditPart.endIndex;

    const p1 = pts[i1];
    const p2 = pts[i2];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    // Normal vector perpendicular to edge
    const nx = -dy / len;
    const ny = dx / len;

    pts[i1] = {
      x: Math.round((p1.x + nx * deltaDistance) * 10) / 10,
      y: Math.round((p1.y + ny * deltaDistance) * 10) / 10,
    };
    pts[i2] = {
      x: Math.round((p2.x + nx * deltaDistance) * 10) / 10,
      y: Math.round((p2.y + ny * deltaDistance) * 10) / 10,
    };

    onUpdateBody(body.id, { points: pts });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.98 }}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-35 bg-[#090d16]/95 border border-white/10 backdrop-blur-2xl px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3.5 text-white max-w-lg w-[92%] sm:w-auto"
    >
      {/* Icon badge */}
      <div className="p-2 bg-cyan-500/15 text-cyan-400 border border-cyan-400/20 rounded-xl shrink-0">
        <ArrowUpDown size={17} />
      </div>

      {/* Info & Step Controls */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-semibold text-white tracking-tight">
              {isTopFace ? 'Top Face Extrude' : 'Side Wall Offset'}
            </span>
            <span className="text-[11px] text-white/45 truncate">
              {body.name}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              min="2"
              max="600"
              value={body.extrusionHeight}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) onUpdateBody(body.id, { extrusionHeight: Math.max(2, Math.min(600, val)) });
              }}
              className="w-14 px-1.5 py-0.5 bg-slate-800/90 border border-cyan-400/50 rounded text-xs font-mono font-bold text-cyan-300 text-right focus:outline-none focus:border-cyan-300"
            />
            <span className="text-[11px] font-mono text-cyan-300/80">mm</span>
          </div>
        </div>

        {isTopFace ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="range"
              min="5"
              max="250"
              step="5"
              value={body.extrusionHeight}
              onChange={(e) => onUpdateBody(body.id, { extrusionHeight: parseInt(e.target.value) })}
              className="w-28 sm:w-36 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustHeight(-10)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition"
                title="Decrease height by 10mm"
              >
                -10
              </button>
              <button
                onClick={() => adjustHeight(-5)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition"
                title="Decrease height by 5mm"
              >
                -5
              </button>
              <button
                onClick={() => adjustHeight(5)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition"
                title="Increase height by 5mm"
              >
                +5
              </button>
              <button
                onClick={() => adjustHeight(10)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition"
                title="Increase height by 10mm"
              >
                +10
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => offsetSideWall(-5)}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition flex items-center gap-1"
              title="Push wall inward by 5mm"
            >
              <Minus size={11} /> -5mm
            </button>
            <button
              onClick={() => offsetSideWall(5)}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-xs font-mono cursor-pointer transition flex items-center gap-1"
              title="Pull wall outward by 5mm"
            >
              <Plus size={11} /> +5mm
            </button>
          </div>
        )}
      </div>

      <div className="h-7 w-[1px] bg-white/10 shrink-0" />

      {/* Done button */}
      <button
        onClick={onClose}
        className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer shrink-0"
        title="Close Inspector"
      >
        <Check size={16} />
      </button>
    </motion.div>
  );
}
