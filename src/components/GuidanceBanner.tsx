/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Boxes, Move3d, Repeat, Scissors, Sparkles, X, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { CadTool } from '../types';

interface GuidanceBannerProps {
  activeTool: CadTool;
  isDrawingLine?: boolean;
  drawingStep?: 'start' | 'end' | 'curve' | 'done';
  onCancel: () => void;
}

const PATH_HINTS: Record<string, string> = {
  start: 'Click the ground or a corner to place the path start.',
  end: 'Click to place the path end.',
  curve: 'Click to set how far the path bends.',
};

export default function GuidanceBanner({ activeTool, isDrawingLine, drawingStep, onCancel }: GuidanceBannerProps) {
  let Icon: LucideIcon | null = null;
  let title = '';
  let hint = '';

  if (isDrawingLine) {
    Icon = Repeat;
    title = 'Draw pattern path';
    hint = PATH_HINTS[drawingStep ?? 'start'] ?? '';
  } else if (activeTool === 'moveFace') {
    Icon = Move3d;
    title = 'Move face';
    hint = 'Click a top face or wall, then drag its handle. Drag corner dots to reshape.';
  } else if (activeTool === 'extrude') {
    return null;
  } else if (activeTool === 'bevel') {
    Icon = Sparkles;
    title = 'Fillet & bevel';
    hint = 'Adjust corner rounding and edge bevel for the selected body.';
  } else if (activeTool === 'cut') {
    Icon = Scissors;
    title = 'Cut';
    hint = 'Choose the body to keep and the body to subtract.';
  } else if (activeTool === 'group') {
    Icon = Boxes;
    title = 'Group';
    hint = 'Shift-click to select two or more bodies.';
  } else if (activeTool === 'repeat') {
    Icon = Repeat;
    title = 'Pattern';
    hint = 'Set a count and draw a path to repeat the body along.';
  }

  if (!Icon) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-center gap-3 pl-3 pr-2 py-2 rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl max-w-full"
    >
      <div className="w-7 h-7 rounded-lg bg-accent-500/15 text-accent-300 flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>
      <div className="min-w-0 text-[13px] leading-snug">
        <span className="font-semibold text-white">{title}</span>
        <span className="text-slate-400"> · {hint}</span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Exit tool"
        title="Exit tool (Esc)"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}
