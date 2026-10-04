/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Boxes, Circle, Focus, Hexagon, Merge, Repeat, Scissors, Square, Triangle, type LucideIcon } from 'lucide-react';
import { SHAPE_LABELS, ShapeKind } from '../utils/primitives';

interface ToolRailProps {
  selectedCount: number;
  bodyCount: number;
  isolated: boolean;
  /** True when the next shape will be placed on the selected top face. */
  addOnTop: boolean;
  onAddShape: (kind: ShapeKind) => void;
  onIsolate: () => void;
  onGroup: () => void;
  onUnion: () => void;
  onCut: () => void;
  onPattern: () => void;
}

interface Action {
  label: string;
  shortcut: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  active?: boolean;
}

/**
 * Commands, not modes: nothing here changes how the mouse behaves.
 * Moving, resizing and beveling are done directly on the shapes.
 */
export default function ToolRail(props: ToolRailProps) {
  const { selectedCount, bodyCount } = props;
  const groups: Action[][] = [
    (['box', 'cylinder', 'triangle', 'hexagon'] as ShapeKind[]).map((kind) => ({
      label: `${SHAPE_LABELS[kind]}${props.addOnTop ? ' · on top' : ''}`,
      shortcut: '',
      icon: { box: Square, cylinder: Circle, triangle: Triangle, hexagon: Hexagon }[kind],
      onClick: () => props.onAddShape(kind),
    })),
    [
      { label: 'Isolate', shortcut: 'I', icon: Focus, onClick: props.onIsolate, active: props.isolated, disabled: !props.isolated && selectedCount < 1, hint: 'Select a shape' },
      { label: 'Group', shortcut: 'G', icon: Boxes, onClick: props.onGroup, disabled: selectedCount < 2, hint: 'Select 2+ shapes' },
      { label: 'Join', shortcut: 'J', icon: Merge, onClick: props.onUnion, disabled: selectedCount < 2, hint: 'Select 2+ shapes' },
      { label: 'Subtract', shortcut: 'S', icon: Scissors, onClick: props.onCut, disabled: bodyCount < 2, hint: 'Needs 2+ shapes' },
      { label: 'Repeat', shortcut: 'R', icon: Repeat, onClick: props.onPattern, disabled: selectedCount < 1, hint: 'Select a shape' },
    ],
  ];

  return (
    <nav
      aria-label="Actions"
      className="absolute z-30 bottom-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1.5rem)] md:translate-x-0 md:right-auto md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-3 flex md:flex-col items-center gap-1 p-1.5 rounded-full bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-x-auto md:overflow-visible no-scrollbar"
    >
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="shrink-0 w-px h-6 md:w-6 md:h-px bg-white/10 mx-1 md:mx-0 md:my-1" />}
          {group.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                disabled={a.disabled}
                aria-label={a.label}
                aria-pressed={a.active || undefined}
                className={`group relative shrink-0 w-11 h-11 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${
                  a.active
                    ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/10 disabled:text-slate-600 disabled:hover:bg-transparent'
                }`}
              >
                <Icon size={19} strokeWidth={1.75} />
                <span className="hidden md:flex absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-slate-100 whitespace-nowrap items-center gap-2 opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 transition pointer-events-none shadow-lg">
                  {a.label}
                  {a.disabled && a.hint ? (
                    <span className="text-slate-500">· {a.hint}</span>
                  ) : a.shortcut ? (
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] text-slate-300 font-sans">{a.shortcut}</kbd>
                  ) : null}
                </span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
