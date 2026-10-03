/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpDown, Boxes, Merge, MousePointer2, Move3d, Repeat, Scissors, Sparkles, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { CadTool } from '../types';

interface GuidanceBannerProps {
  activeTool: CadTool;
  hasSelection: boolean;
  isDrawingLine?: boolean;
  drawingStep?: 'start' | 'end' | 'curve' | 'done';
  onCancel: () => void;
}

const PATH_HINTS: Record<string, string> = {
  start: 'Click the ground or a corner to place the path start.',
  end: 'Click to place the path end.',
  curve: 'Click to set how far the path bends.',
};

/** One line that says what the active tool does and what to do next. */
export default function GuidanceBanner({ activeTool, hasSelection, isDrawingLine, drawingStep, onCancel }: GuidanceBannerProps) {
  let Icon: LucideIcon;
  let title: string;
  let hint: string;

  if (isDrawingLine) {
    Icon = Repeat;
    title = 'Draw pattern path';
    hint = PATH_HINTS[drawingStep ?? 'start'] ?? '';
  } else {
    switch (activeTool) {
      case 'move':
        Icon = Move3d;
        title = 'Move & rotate';
        hint = hasSelection
          ? 'Drag an arrow to slide along an axis, the square to slide on the ground, the ring to rotate.'
          : 'Click a body, then drag its handles.';
        break;
      case 'extrude':
        Icon = ArrowUpDown;
        title = 'Push / pull';
        hint = 'Drag a top face or a wall. Click a wall first to choose it.';
        break;
      case 'bevel':
        Icon = Sparkles;
        title = 'Fillet & bevel';
        hint = 'Hover an edge to preview it, click to select, then set its size. Only selected edges change.';
        break;
      case 'cut':
        Icon = Scissors;
        title = 'Cut';
        hint = 'Choose the body to keep and the body to subtract.';
        break;
      case 'group':
        Icon = Boxes;
        title = 'Group';
        hint = 'Shift-click to select two or more bodies.';
        break;
      case 'merge':
        Icon = Merge;
        title = 'Union';
        hint = 'Shift-click to select overlapping bodies.';
        break;
      case 'repeat':
        Icon = Repeat;
        title = 'Pattern';
        hint = 'Set a count and draw a path to repeat the body along.';
        break;
      default:
        if (hasSelection) return null;
        Icon = MousePointer2;
        title = 'Select';
        hint = 'Click a body to select it. Drag empty space to orbit.';
    }
  }

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
      {(activeTool !== 'select' || isDrawingLine) && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Done"
          title="Done (Esc)"
          className="h-7 px-2.5 rounded-lg text-xs font-medium text-slate-200 bg-white/8 hover:bg-white/14 shrink-0"
        >
          Done
        </button>
      )}
    </motion.div>
  );
}
