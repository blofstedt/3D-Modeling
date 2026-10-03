/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export const stepClass =
  'h-7 min-w-8 px-1.5 rounded-md bg-white/6 hover:bg-white/12 text-xs font-medium text-slate-200 tabular-nums transition-colors';

export const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** A labelled number box that applies its value on Enter or when it loses focus. */
export function NumberBox({
  label,
  value,
  step = 1,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (v: number) => void;
}) {
  const shown = Math.round(value * 100) / 100;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const v = parseFloat(draft ?? '');
    setDraft(null);
    if (!Number.isNaN(v) && v !== shown) onCommit(v);
  };

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-none text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft ?? String(shown)}
        onFocus={(e) => {
          setDraft(String(shown));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        aria-label={`${label} in mm`}
        className="w-[4.25rem] h-7 px-2 rounded-md bg-white/6 border border-white/8 text-sm font-semibold text-white tabular-nums focus:outline-none focus:border-accent-400"
      />
    </label>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        active ? 'bg-accent-500/25 text-accent-200' : 'text-slate-300 hover:text-white hover:bg-white/10'
      } ${danger ? 'hover:text-rose-300' : ''}`}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}

