/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BevelStyle } from '../types';
import { spring } from './controls';
import { formatLength, parseLength } from '../utils/units';

const OPTIONS: { style: BevelStyle; label: string; path: string }[] = [
  { style: 'round', label: 'Curved edge', path: 'M5 25V15C5 9 9 5 15 5h10' },
  { style: 'chamfer', label: 'Flat bevel', path: 'M5 25V13L13 5h12' },
];

/**
 * Two round buttons that pop up beside the yellow edge handle.
 * Press one and drag: the edge takes that profile and the drag sets its size.
 */
export function BevelPicker({
  current,
  onPress,
  onMove,
  onRelease,
}: {
  current: BevelStyle;
  onPress: (style: BevelStyle, e: React.PointerEvent<HTMLElement>) => void;
  onMove: (e: React.PointerEvent<HTMLElement>) => void;
  onRelease: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <motion.div className="flex items-center gap-3" exit={{ opacity: 0, transition: { duration: 0.1 } }}>
      {OPTIONS.map((o, i) => (
        <motion.button
          key={o.style}
          type="button"
          aria-label={o.label}
          title={o.label}
          initial={{ opacity: 0, scale: 0.3, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.1 } }}
          transition={{ ...spring, stiffness: 460, damping: 24, delay: i * 0.05 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.94 }}
          onPointerDown={(e) => onPress(o.style, e)}
          onPointerMove={onMove}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          style={{ touchAction: 'none' }}
          className={`w-14 h-14 rounded-full flex items-center justify-center border shadow-xl shadow-black/50 backdrop-blur-xl cursor-ns-resize ${
            current === o.style ? 'bg-accent-500 border-accent-300 text-white' : 'bg-slate-800/95 border-white/15 text-slate-100'
          }`}
        >
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={o.path} />
          </svg>
        </motion.button>
      ))}
    </motion.div>
  );
}

/**
 * The number for the face you are working on. It shows while dragging and for a few seconds after;
 * tap it to type an exact value (millimetres, or add a unit such as 12cm).
 */
export function MeasureReadout({
  label,
  value,
  onEditStart,
  onEditEnd,
  onCommit,
}: {
  label: string;
  value: number;
  onEditStart: () => void;
  onEditEnd: () => void;
  onCommit: (mm: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const { main, alt } = formatLength(value);

  const finish = (apply: boolean) => {
    const v = draft === null ? null : parseLength(draft);
    setDraft(null);
    onEditEnd();
    if (apply && v !== null && Math.round(v * 10) !== Math.round(value * 10)) onCommit(v);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.35 } }}
      transition={{ ...spring, stiffness: 440, damping: 28 }}
      className="h-12 rounded-full bg-slate-800/95 backdrop-blur-xl border border-white/12 shadow-xl shadow-black/50 flex items-center gap-2.5 pl-4 pr-4"
    >
      <span className="text-[11px] leading-none uppercase tracking-wide text-slate-400">{label}</span>
      {draft === null ? (
        <button
          type="button"
          aria-label={`${label}: ${main}. Tap to type a value`}
          onClick={() => {
            setDraft(String(Math.round(value * 10) / 10));
            onEditStart();
          }}
          className="flex items-center gap-1.5 h-full"
        >
          <span className="text-base leading-none font-semibold text-white tabular-nums">{main}</span>
          {alt && <span className="text-xs leading-none text-slate-400 tabular-nums">· {alt}</span>}
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          aria-label={`${label} in millimetres`}
          value={draft}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') {
              e.stopPropagation();
              finish(false);
            }
          }}
          className="w-24 h-8 px-3 rounded-full bg-white/10 border border-accent-400 text-base font-semibold text-white tabular-nums focus:outline-none"
        />
      )}
    </motion.div>
  );
}
