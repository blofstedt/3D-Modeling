/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowUpDown,
  Boxes,
  Merge,
  MousePointer2,
  Move3d,
  PenLine,
  Repeat,
  Scissors,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { CadTool } from '../types';

interface ToolRailProps {
  activeTool: CadTool;
  selectedBodyCount: number;
  onSelect: () => void;
  onNewSketch: () => void;
  onExtrude: () => void;
  onCut: () => void;
  onBevel: () => void;
  onMoveFace: () => void;
  onRepeat: () => void;
  onGroup: () => void;
  onMerge: () => void;
}

interface ToolDef {
  id: CadTool | 'sketch';
  label: string;
  shortcut: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}

export default function ToolRail(props: ToolRailProps) {
  const { activeTool, selectedBodyCount } = props;
  const multi = selectedBodyCount >= 2;

  const groups: ToolDef[][] = [
    [
      { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2, onClick: props.onSelect },
      { id: 'sketch', label: 'New sketch', shortcut: 'N', icon: PenLine, onClick: props.onNewSketch },
    ],
    [
      { id: 'extrude', label: 'Extrude', shortcut: 'E', icon: ArrowUpDown, onClick: props.onExtrude },
      { id: 'moveFace', label: 'Move face', shortcut: 'M', icon: Move3d, onClick: props.onMoveFace },
      { id: 'bevel', label: 'Fillet & bevel', shortcut: 'B', icon: Sparkles, onClick: props.onBevel },
      { id: 'cut', label: 'Cut', shortcut: 'C', icon: Scissors, onClick: props.onCut },
    ],
    [
      { id: 'repeat', label: 'Pattern', shortcut: 'R', icon: Repeat, onClick: props.onRepeat },
      {
        id: 'group',
        label: 'Group',
        shortcut: 'G',
        icon: Boxes,
        onClick: props.onGroup,
        disabled: !multi,
        hint: 'Select 2+ bodies',
      },
      {
        id: 'merge',
        label: 'Union',
        shortcut: 'U',
        icon: Merge,
        onClick: props.onMerge,
        disabled: !multi,
        hint: 'Select 2+ bodies',
      },
    ],
  ];

  return (
    <nav
      aria-label="Modeling tools"
      className="absolute z-30 bottom-3 left-3 right-3 md:right-auto md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-3 flex md:flex-col items-center gap-1 p-1.5 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-xl overflow-x-auto md:overflow-visible no-scrollbar"
    >
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="shrink-0 w-px h-6 md:w-6 md:h-px bg-white/10 mx-1 md:mx-0 md:my-1" />}
          {group.map((tool) => {
            const Icon = tool.icon;
            const active = tool.id === activeTool;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={tool.onClick}
                disabled={tool.disabled}
                aria-label={tool.label}
                aria-pressed={active}
                className={`group relative shrink-0 w-11 h-11 md:w-10 md:h-10 rounded-xl flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10 disabled:text-slate-600 disabled:hover:bg-transparent'
                }`}
              >
                <Icon size={19} strokeWidth={1.75} />
                <span className="hidden md:flex absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-slate-100 whitespace-nowrap items-center gap-2 opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 transition pointer-events-none shadow-lg">
                  {tool.label}
                  {tool.disabled && tool.hint ? (
                    <span className="text-slate-500">· {tool.hint}</span>
                  ) : (
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] text-slate-300 font-sans">
                      {tool.shortcut}
                    </kbd>
                  )}
                </span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
