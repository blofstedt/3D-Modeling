/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  Boxes,
  Circle,
  Focus,
  Hexagon,
  Merge,
  Move3d,
  Octagon,
  Pentagon,
  Repeat,
  Scissors,
  Shapes,
  Square,
  SquareRoundCorner,
  Star,
  Trash2,
  Triangle,
  TriangleRight,
  type LucideIcon,
} from 'lucide-react';
import { SHAPE_LABELS, ShapeKind } from '../utils/primitives';
import MenuButton from './Menu';
import { spring } from './controls';

const SHAPE_ICONS: Record<ShapeKind, LucideIcon> = {
  box: Square,
  roundedBox: SquareRoundCorner,
  cylinder: Circle,
  triangle: Triangle,
  wedge: TriangleRight,
  pentagon: Pentagon,
  hexagon: Hexagon,
  octagon: Octagon,
  star: Star,
};

interface BottomBarProps {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  selectedCount: number;
  bodyCount: number;
  isolated: boolean;
  moveOn: boolean;
  /** True when the next shape will be placed on the selected top face. */
  addOnTop: boolean;
  onAddShape: (kind: ShapeKind) => void;
  onToggleMove: () => void;
  onIsolate: () => void;
  onGroup: () => void;
  onJoin: () => void;
  onSubtract: () => void;
  onPattern: () => void;
  onDelete: () => void;
}

interface Tool {
  label: string;
  key: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  active?: boolean;
  danger?: boolean;
}

/** The tools: one Shape tool that opens the shape list, then the commands. */
export default function BottomBar(props: BottomBarProps) {
  const { selectedCount, bodyCount } = props;
  const tools: Tool[] = [
    { label: 'Move', key: 'M', icon: Move3d, onClick: props.onToggleMove, active: props.moveOn, disabled: selectedCount < 1, hint: 'Select a shape' },
    { label: 'Isolate', key: 'I', icon: Focus, onClick: props.onIsolate, active: props.isolated, disabled: !props.isolated && selectedCount < 1, hint: 'Select a shape' },
    { label: 'Group', key: 'G', icon: Boxes, onClick: props.onGroup, disabled: selectedCount < 2, hint: 'Select 2+ shapes' },
    { label: 'Join', key: 'J', icon: Merge, onClick: props.onJoin, disabled: selectedCount < 2, hint: 'Select 2+ shapes' },
    { label: 'Subtract', key: 'S', icon: Scissors, onClick: props.onSubtract, disabled: bodyCount < 2, hint: 'Needs 2+ shapes' },
    { label: 'Repeat', key: 'R', icon: Repeat, onClick: props.onPattern, disabled: selectedCount < 1, hint: 'Select a shape' },
    { label: 'Delete', key: 'Del', icon: Trash2, onClick: props.onDelete, disabled: selectedCount < 1, hint: 'Select a shape', danger: true },
  ];

  return (
    <nav aria-label="Tools" className="shrink-0 h-16 bg-slate-900 border-t border-white/8 z-40 flex items-center justify-evenly sm:justify-center sm:gap-1.5 px-2 sm:px-3">
      <MenuButton id="shapes" openId={props.openId} setOpenId={props.setOpenId} label="Shape" icon={Shapes} placement="up" title="Add a shape" iconOnlyOnMobile>
        <div className="p-3 w-[min(19rem,calc(100vw-1.5rem))]">
          <p className="px-2 pb-2 text-xs text-slate-400">{props.addOnTop ? 'Adds on top of the selected face' : 'Add a shape'}</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((kind, i) => {
              const Icon = SHAPE_ICONS[kind];
              return (
                <motion.button
                  key={kind}
                  type="button"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.025 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    props.onAddShape(kind);
                    props.setOpenId(null);
                  }}
                  className="h-20 rounded-[1.4rem] bg-white/6 hover:bg-white/12 flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition-colors"
                >
                  <Icon size={24} strokeWidth={1.6} />
                  <span className="text-[11px]">{SHAPE_LABELS[kind]}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </MenuButton>

      <div className="hidden sm:block shrink-0 w-px h-6 bg-white/10 mx-1" />

      {tools.map((t) => {
        const Icon = t.icon;
        return (
          <motion.button
            key={t.label}
            type="button"
            onClick={t.onClick}
            disabled={t.disabled}
            aria-label={t.label}
            aria-pressed={t.active || undefined}
            title={t.disabled && t.hint ? `${t.label} · ${t.hint}` : `${t.label} (${t.key})`}
            whileHover={t.disabled ? undefined : { scale: 1.05 }}
            whileTap={t.disabled ? undefined : { scale: 0.92 }}
            transition={spring}
            className={`shrink-0 h-10 w-10 sm:h-9 sm:w-auto sm:px-3.5 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors ${
              t.active
                ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30'
                : t.danger
                  ? 'bg-white/6 text-slate-200 hover:bg-rose-500/20 hover:text-rose-300 disabled:bg-transparent'
                  : 'bg-white/6 text-slate-200 hover:bg-white/12 hover:text-white disabled:bg-transparent'
            } disabled:text-slate-600 disabled:pointer-events-none`}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">{t.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
