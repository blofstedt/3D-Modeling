/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Body3D } from '../types';
import { Sparkles, X, CornerDownRight, Check, Sliders } from 'lucide-react';
import { motion } from 'motion/react';

interface RoundBevelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBody: Body3D | null;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onApplyCornerRadius: (id: string, radius: number) => void;
}

export default function RoundBevelModal({
  isOpen,
  onClose,
  selectedBody,
  onUpdateBody,
  onApplyCornerRadius,
}: RoundBevelModalProps) {
  if (!isOpen || !selectedBody) return null;

  const cornerRadius = selectedBody.cornerRadius || 0;
  const bevelEnabled = selectedBody.bevelEnabled !== undefined ? selectedBody.bevelEnabled : true;
  const bevelSize = selectedBody.bevelSize !== undefined ? selectedBody.bevelSize : 1;
  const bevelSegments = selectedBody.bevelSegments !== undefined ? selectedBody.bevelSegments : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-900 border border-white/15 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Round Corners &amp; Bevel Edges
              </h2>
              <p className="text-[11px] text-white/50 font-mono">
                Target: <span className="text-amber-300 font-semibold">{selectedBody.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
          
          {/* 1. CORNER ROUNDING (FILLET) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CornerDownRight size={16} className="text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  1. Round Corners (2D Fillet)
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                {cornerRadius} px radius
              </span>
            </div>

            <p className="text-[11px] text-white/60 leading-relaxed">
              Curvatures applied directly to the polygon corner vertices to soften sharp angles.
            </p>

            {/* Corner Radius Slider */}
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={cornerRadius}
                onChange={(e) => onApplyCornerRadius(selectedBody.id, parseInt(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
              />
              <div className="flex justify-between text-[9px] font-mono text-white/30">
                <span>0 (Sharp)</span>
                <span>10 (Subtle)</span>
                <span>20 (Smooth)</span>
                <span>30 (Pill)</span>
              </div>
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-white/40 font-mono mr-1">Presets:</span>
              {[
                { label: 'Sharp', val: 0 },
                { label: 'Subtle', val: 4 },
                { label: 'Medium', val: 12 },
                { label: 'Full Round', val: 24 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => onApplyCornerRadius(selectedBody.id, p.val)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition border ${
                    cornerRadius === p.val
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 3D EDGE BEVELING & CHAMFER */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  2. Bevel &amp; Round 3D Edges
                </span>
              </div>

              {/* Bevel Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-[11px] font-mono text-white/50">
                  {bevelEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <input
                  type="checkbox"
                  checked={bevelEnabled}
                  onChange={(e) => onUpdateBody(selectedBody.id, { bevelEnabled: e.target.checked })}
                  className="rounded border-white/20 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer accent-cyan-400"
                />
              </label>
            </div>

            <p className="text-[11px] text-white/60 leading-relaxed">
              Angles or rounds the top, bottom, and side contour perimeter edges in 3D space.
            </p>

            {bevelEnabled && (
              <div className="flex flex-col gap-3.5 pt-1">
                {/* Style Selector: Chamfer vs Round */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                    Edge Profile Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onUpdateBody(selectedBody.id, { bevelSegments: 1 })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer transition border text-left flex flex-col gap-0.5 ${
                        bevelSegments <= 1
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>Chamfer (Flat Cut)</span>
                      <span className="text-[9px] font-mono text-white/40 font-normal">
                        Clean 45° planar angle
                      </span>
                    </button>

                    <button
                      onClick={() => onUpdateBody(selectedBody.id, { bevelSegments: 4 })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer transition border text-left flex flex-col gap-0.5 ${
                        bevelSegments > 1
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>Fillet (Rounded)</span>
                      <span className="text-[9px] font-mono text-white/40 font-normal">
                        Smooth circular curve
                      </span>
                    </button>
                  </div>
                </div>

                {/* Bevel Size Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-white/60">
                    <span>Edge Bevel Size / Depth</span>
                    <span className="text-cyan-300 font-bold">{bevelSize} units</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="12"
                    step="0.5"
                    value={bevelSize}
                    onChange={(e) => onUpdateBody(selectedBody.id, { bevelSize: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-white/30">
                    <span>0.5 (Fine)</span>
                    <span>5.0 (Moderate)</span>
                    <span>12.0 (Bold)</span>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end bg-white/5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
