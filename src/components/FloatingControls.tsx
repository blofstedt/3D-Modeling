/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { BevelStyle } from '../types';
import { spring } from './controls';

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
