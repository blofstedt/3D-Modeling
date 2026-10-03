/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Body3D, Point2D, RepeatConfig } from '../types';
import { Repeat, X, PenTool, Check, ArrowRight, CornerUpRight, RotateCw, Compass } from 'lucide-react';
import { motion } from 'motion/react';

interface RepeatPatternModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBody: Body3D | null;
  repeatConfig: RepeatConfig;
  setRepeatConfig: React.Dispatch<React.SetStateAction<RepeatConfig>>;
  onStartDrawingLine: () => void;
  onApplyPattern: (config: RepeatConfig) => void;
}

export default function RepeatPatternModal({
  isOpen,
  onClose,
  selectedBody,
  repeatConfig,
  setRepeatConfig,
  onStartDrawingLine,
  onApplyPattern,
}: RepeatPatternModalProps) {
  if (!isOpen || !selectedBody) return null;

  // Compute default start/end if not already set by drawing
  const ensureDefaultPoints = () => {
    if (!repeatConfig.startPoint || !repeatConfig.endPoint) {
      // Centroid of selected body
      const n = selectedBody.points.length;
      const cx = selectedBody.points.reduce((acc, p) => acc + p.x, 0) / n;
      const cy = selectedBody.points.reduce((acc, p) => acc + p.y, 0) / n;
      
      const start = { x: Math.round(cx), y: Math.round(cy) };
      const end = { x: Math.round(cx + 200), y: Math.round(cy) };
      const control = { x: Math.round(cx + 100), y: Math.round(cy + 60) };

      setRepeatConfig((prev) => ({
        ...prev,
        startPoint: prev.startPoint || start,
        endPoint: prev.endPoint || end,
        controlPoint: prev.controlPoint || control,
      }));
    }
  };

  const handleApply = () => {
    ensureDefaultPoints();
    onApplyPattern(repeatConfig);
    onClose();
  };

  const lineLength = repeatConfig.startPoint && repeatConfig.endPoint
    ? Math.round(Math.hypot(repeatConfig.endPoint.x - repeatConfig.startPoint.x, repeatConfig.endPoint.y - repeatConfig.startPoint.y))
    : 200;

  const spacing = repeatConfig.count > 1 ? Math.round(lineLength / (repeatConfig.count - 1)) : lineLength;

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
            <div className="p-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl">
              <Repeat size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Repeat Pattern Along Line or Curve
              </h2>
              <p className="text-[11px] text-white/50 font-mono">
                Target: <span className="text-cyan-300 font-semibold">{selectedBody.name}</span>
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
        <div className="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          
          {/* Pattern Type Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">
              Trajectory Geometry
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRepeatConfig((prev) => ({ ...prev, type: 'linear' }))}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold cursor-pointer transition border text-left flex items-center gap-2.5 ${
                  repeatConfig.type === 'linear'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <ArrowRight size={16} className="text-cyan-400" />
                <div className="flex flex-col">
                  <span>Straight Line</span>
                  <span className="text-[9px] font-mono text-white/40 font-normal">
                    Equally spaced linear array
                  </span>
                </div>
              </button>

              <button
                onClick={() => setRepeatConfig((prev) => ({ ...prev, type: 'curved' }))}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold cursor-pointer transition border text-left flex items-center gap-2.5 ${
                  repeatConfig.type === 'curved'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <CornerUpRight size={16} className="text-cyan-400" />
                <div className="flex flex-col">
                  <span>Curved Line / Arc</span>
                  <span className="text-[9px] font-mono text-white/40 font-normal">
                    Follows contour curvature
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Draw Line Against Object Button */}
          <div className="bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-transparent p-4 rounded-2xl border border-cyan-400/20 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <PenTool size={14} className="text-cyan-400" />
                  Draw Guideline Against Object
                </h4>
                <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
                  Click two points on or against your shape in the scene to establish the exact path and distance.
                </p>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onStartDrawingLine();
                }}
                className="shrink-0 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-500/20 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Compass size={13} />
                <span>Draw Path Now</span>
              </button>
            </div>

            {repeatConfig.startPoint && repeatConfig.endPoint && (
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/10 flex items-center justify-between text-[10px] font-mono text-white/60">
                <span>Drawn Path: ({repeatConfig.startPoint.x}, {repeatConfig.startPoint.y}) → ({repeatConfig.endPoint.x}, {repeatConfig.endPoint.y})</span>
                <span className="text-cyan-300 font-bold">{lineLength} units length</span>
              </div>
            )}
          </div>

          {/* Repeat Count Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-white/60 uppercase tracking-wider">Number of Copies</span>
              <span className="text-cyan-300 font-bold">{repeatConfig.count} items</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={repeatConfig.count}
              onChange={(e) => setRepeatConfig((prev) => ({ ...prev, count: parseInt(e.target.value) }))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
            />
            <div className="flex justify-between text-[9px] font-mono text-white/30">
              <span>2 copies</span>
              <span>10 copies</span>
              <span>20 copies</span>
            </div>
          </div>

          {/* Curved Path Orientation Option */}
          {repeatConfig.type === 'curved' && (
            <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={repeatConfig.followCurve}
                onChange={(e) => setRepeatConfig((prev) => ({ ...prev, followCurve: e.target.checked }))}
                className="rounded border-white/20 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer accent-cyan-400"
              />
              <div className="flex flex-col">
                <span className="font-semibold flex items-center gap-1.5">
                  <RotateCw size={13} className="text-cyan-400" /> Rotate copies with curve tangent
                </span>
                <span className="text-[10px] text-white/40">
                  Each copy will orient itself naturally along the curve slope (like gear teeth or fence pickets)
                </span>
              </div>
            </label>
          )}

          {/* Real-time Math Summary */}
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-[11px] font-mono text-white/60 flex flex-col gap-1">
            <div className="text-white font-bold text-xs mb-0.5">Summary:</div>
            <div className="flex justify-between">
              <span>Total Array Span:</span>
              <span className="text-white/90">{lineLength} units</span>
            </div>
            <div className="flex justify-between">
              <span>Equally Spaced Interval:</span>
              <span className="text-cyan-300 font-bold">{spacing} units between each</span>
            </div>
            <div className="flex justify-between">
              <span>New Solids Created:</span>
              <span className="text-white/90">{repeatConfig.count - 1} duplicates</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2.5 bg-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Repeat size={14} />
            <span>Create {repeatConfig.count} Repeated Objects</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
