/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CadTool } from '../types';
import { Scissors, Sparkles, Move3d, Boxes, Repeat, X, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface GuidanceBannerProps {
  activeTool: CadTool;
  isDrawingLine?: boolean;
  drawingStep?: 'start' | 'end' | 'curve' | 'done';
  onCancel: () => void;
}

export default function GuidanceBanner({
  activeTool,
  isDrawingLine,
  drawingStep,
  onCancel,
}: GuidanceBannerProps) {
  if (activeTool === 'select' && !isDrawingLine) return null;

  let title = '';
  let instruction = '';
  let Icon = AlertCircle;
  let colorClass = 'border-cyan-400/40 text-cyan-300';
  let badgeBg = 'bg-cyan-500/20 text-cyan-400';

  if (isDrawingLine) {
    Icon = Repeat;
    title = 'Drawing Repeat Path Against Object';
    colorClass = 'border-cyan-400/40 text-cyan-300';
    badgeBg = 'bg-cyan-500/20 text-cyan-400';
    if (drawingStep === 'start') {
      instruction = 'Click Point 1 against any corner or edge of your object to start the path.';
    } else if (drawingStep === 'end') {
      instruction = 'Click Point 2 to set the end point and direction along the object.';
    } else if (drawingStep === 'curve') {
      instruction = 'Click Point 3 to define the curve apex / bulge along the object.';
    }
  } else if (activeTool === 'cut') {
    Icon = Scissors;
    title = 'Cut Shape Out Tool';
    instruction = 'Choose a base shape to keep and a cutter shape to subtract from it.';
    colorClass = 'border-rose-400/40 text-rose-300';
    badgeBg = 'bg-rose-500/20 text-rose-400';
  } else if (activeTool === 'bevel') {
    Icon = Sparkles;
    title = 'Round & Bevel Inspector';
    instruction = 'Adjust 2D corner rounding (fillet) or 3D edge chamfer/bevel for the selected solid.';
    colorClass = 'border-amber-400/40 text-amber-300';
    badgeBg = 'bg-amber-500/20 text-amber-400';
  } else if (activeTool === 'moveFace') {
    Icon = Move3d;
    title = 'Move Face & Push-Pull';
    instruction = 'Click any top face or side wall of an object, then drag the glowing 3D arrow to push or pull it.';
    colorClass = 'border-emerald-400/40 text-emerald-300';
    badgeBg = 'bg-emerald-500/20 text-emerald-400';
  } else if (activeTool === 'group') {
    Icon = Boxes;
    title = 'Object Grouping';
    instruction = 'Select 2 or more solids to combine them into a single manipulatable object.';
    colorClass = 'border-indigo-400/40 text-indigo-300';
    badgeBg = 'bg-indigo-500/20 text-indigo-400';
  } else if (activeTool === 'repeat') {
    Icon = Repeat;
    title = 'Repeat Along Line / Curve';
    instruction = 'Specify the repeat count and draw a guideline against the object to replicate it.';
    colorClass = 'border-cyan-400/40 text-cyan-300';
    badgeBg = 'bg-cyan-500/20 text-cyan-400';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border ${colorClass} flex items-center gap-3 text-xs max-w-lg font-sans`}
    >
      <div className={`p-1.5 rounded-lg ${badgeBg} shrink-0`}>
        <Icon size={14} />
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-white flex items-center gap-1.5">
          {title}
        </span>
        <span className="text-[11px] text-white/70 font-normal">
          {instruction}
        </span>
      </div>
      <button
        onClick={onCancel}
        className="ml-auto p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
        title="Exit Tool"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
