/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Body3D } from '../types';
import { Scissors, ArrowRightLeft, Check, X, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface CutModalProps {
  onClose: () => void;
  bodies: Body3D[];
  initialTargetId: string | null;
  onApplyCut: (targetId: string, cutterId: string, keepCutter: boolean) => void;
}

export default function CutModal({
  onClose,
  bodies,
  initialTargetId,
  onApplyCut,
}: CutModalProps) {
  // Default target is the selected body or the first body
  const availableBodies = bodies.filter((b) => b.visible);
  const defaultTargetId = initialTargetId || (availableBodies[0] ? availableBodies[0].id : '');
  const remainingBodies = availableBodies.filter((b) => b.id !== defaultTargetId);
  const defaultCutterId = remainingBodies[0] ? remainingBodies[0].id : '';

  const [targetId, setTargetId] = useState<string>(defaultTargetId);
  const [cutterId, setCutterId] = useState<string>(defaultCutterId);
  const [keepCutter, setKeepCutter] = useState<boolean>(false);

  const targetBody = bodies.find((b) => b.id === targetId);
  const cutterBody = bodies.find((b) => b.id === cutterId);

  const handleSwap = () => {
    const temp = targetId;
    setTargetId(cutterId);
    setCutterId(temp);
  };

  const handlePerformCut = () => {
    if (!targetId || !cutterId || targetId === cutterId) return;
    onApplyCut(targetId, cutterId, keepCutter);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-800 border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl">
              <Scissors size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                Cut Shape Out Of Another
              </h2>
              <p className="text-[11px] text-white/50 ">
                Boolean Subtraction &amp; Interior Cutouts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex flex-col gap-5 overflow-y-auto">
          {availableBodies.length < 2 ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3 text-amber-300 text-xs">
              <AlertCircle size={18} className="shrink-0" />
              <span>You need at least two solid bodies in your scene to perform a cut. Draw another shape first!</span>
            </div>
          ) : (
            <>
              <div className="text-xs text-white/70 leading-relaxed">
                Select the <span className="text-accent-300 font-semibold">base shape to keep</span>, and the <span className="text-rose-400 font-semibold">cutter shape to subtract</span> from it.
              </div>

              {/* Target & Cutter Selector Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center relative">
                
                {/* Target Box (To Keep) */}
                <div className="bg-white/5 border border-accent-500/40 rounded-xl p-3 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-accent-400 font-semibold">
                      1. Base Shape (Keep)
                    </span>
                    {targetBody && (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/30"
                        style={{ backgroundColor: targetBody.color }}
                      />
                    )}
                  </div>

                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="bg-slate-800 border border-white/15 rounded-full px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent-400 font-medium cursor-pointer"
                  >
                    {availableBodies.map((b) => (
                      <option key={b.id} value={b.id} disabled={b.id === cutterId}>
                        {b.name} ({b.extrusionHeight} mm)
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-white/40  truncate">
                    {targetBody ? `${targetBody.points.length} vertices • Height: ${targetBody.extrusionHeight}u` : 'None selected'}
                  </div>
                </div>

                {/* Quick Swap Button in middle */}
                <button
                  onClick={handleSwap}
                  className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-800 border border-white/20 text-white/70 hover:text-white hover:scale-110 active:scale-95 transition-all flex items-center justify-center shadow-lg mx-auto cursor-pointer"
                  title="Swap Base and Cutter"
                >
                  <ArrowRightLeft size={13} />
                </button>

                {/* Cutter Box (To Subtract) */}
                <div className="bg-white/5 border border-rose-500/40 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-rose-400 font-semibold">
                      2. Cutter (Subtract)
                    </span>
                    {cutterBody && (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/30"
                        style={{ backgroundColor: cutterBody.color }}
                      />
                    )}
                  </div>

                  <select
                    value={cutterId}
                    onChange={(e) => setCutterId(e.target.value)}
                    className="bg-slate-800 border border-white/15 rounded-full px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-400 font-medium cursor-pointer"
                  >
                    {availableBodies.map((b) => (
                      <option key={b.id} value={b.id} disabled={b.id === targetId}>
                        {b.name} ({b.extrusionHeight} mm)
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-white/40  truncate">
                    {cutterBody ? `${cutterBody.points.length} vertices • Will be carved out` : 'None selected'}
                  </div>
                </div>

              </div>

              {/* Keep Cutter Option */}
              <label className="flex items-center gap-2.5 text-xs text-white/70 cursor-pointer select-none bg-white/5 p-2.5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={keepCutter}
                  onChange={(e) => setKeepCutter(e.target.checked)}
                  className="rounded border-white/20 text-accent-500 focus:ring-0 w-4 h-4 cursor-pointer accent-accent-400"
                />
                <span>Keep a copy of cutter shape in workspace after cutting</span>
              </label>

              {/* Dynamic Action Explanation */}
              {targetBody && cutterBody && (
                <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3 text-[11px]  text-white/60">
                  <strong className="text-white">Operation:</strong> Will carve{' '}
                  <span className="text-rose-400 font-semibold">{cutterBody.name}</span> out of{' '}
                  <span className="text-accent-300 font-semibold">{targetBody.name}</span>.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2.5 bg-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handlePerformCut}
            disabled={!targetId || !cutterId || targetId === cutterId}
            className="px-5 py-2.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-30 disabled:pointer-events-none text-white rounded-full text-xs font-semibold transition-all shadow-lg shadow-rose-500/20 cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Scissors size={14} />
            <span>Cut Shape Out</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
