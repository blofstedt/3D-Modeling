/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PenLine, Trash2, X } from 'lucide-react';
import { BevelStyle, Body3D, EdgeSel, FaceSel } from '../types';
import { edgeSize, edgeStyle, MAX_BEVEL_SIZE } from '../utils/edges';
import { IconButton, NumberBox, signed, stepClass } from './controls';

/** Small card that the viewer pins next to whatever is selected. */
function PanelShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-xl">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-white leading-tight">{title}</span>
        {sub && <span className="text-[11px] leading-tight text-slate-400 truncate max-w-40">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

export function EdgePanel({
  body,
  edges,
  onEdgeChange,
  onClear,
}: {
  body: Body3D;
  edges: EdgeSel[];
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  onClear: () => void;
}) {
  const onlyCorners = edges.every((e) => e.kind === 'corner');
  const size = edgeSize(body, edges[0]);
  const style = edgeStyle(body, edges.find((e) => e.kind !== 'corner') ?? edges[0]) ?? 'round';
  const noun = onlyCorners ? 'Corner' : 'Edge';
  const set = (v: number) => onEdgeChange(edges, { size: Math.max(0, Math.min(MAX_BEVEL_SIZE, v)) });

  return (
    <PanelShell title={edges.length > 1 ? `${edges.length} ${noun.toLowerCase()}s` : noun} sub={edges.length === 1 ? 'Shift-click to add more' : undefined}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={MAX_BEVEL_SIZE}
          step={0.5}
          value={Math.min(size, MAX_BEVEL_SIZE)}
          onChange={(e) => set(parseFloat(e.target.value))}
          aria-label={onlyCorners ? 'Radius' : 'Bevel size'}
          className="w-36 accent-accent-400"
        />
        <NumberBox label={onlyCorners ? 'Radius' : 'Size'} value={size} step={0.5} min={0} max={MAX_BEVEL_SIZE} onCommit={set} />
      </div>
      <div className="flex items-center gap-2">
        {!onlyCorners && (
          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-white/6" role="group" aria-label="Edge profile">
            {(['round', 'chamfer'] as BevelStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={style === s}
                onClick={() => onEdgeChange(edges, { style: s })}
                className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  style === s ? 'bg-white/14 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === 'round' ? 'Curved' : 'Flat'}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-0.5 ml-auto">
          <IconButton icon={Trash2} label="Remove bevel (Del)" onClick={() => onEdgeChange(edges, { size: 0 })} danger />
          <IconButton icon={X} label="Done (Esc)" onClick={onClear} />
        </div>
      </div>
    </PanelShell>
  );
}

export function FacePanel({
  body,
  face,
  onExtrudeFace,
  onSketchOnTop,
  onClear,
}: {
  body: Body3D;
  face: FaceSel;
  onExtrudeFace: (face: FaceSel, delta: number) => void;
  onSketchOnTop: () => void;
  onClear: () => void;
}) {
  const elev = body.elevation ?? 0;
  const title = face.kind === 'top' ? 'Top face' : face.kind === 'bottom' ? 'Bottom face' : `Wall ${(face.index ?? 0) + 1}`;
  return (
    <PanelShell title={title} sub="Drag it to extrude">
      <div className="flex items-end gap-2">
        {face.kind === 'top' && (
          <NumberBox label="Height" value={body.extrusionHeight} min={2} max={600} onCommit={(v) => onExtrudeFace(face, v - body.extrusionHeight)} />
        )}
        {face.kind === 'bottom' && (
          <NumberBox label="Bottom at" value={elev} min={0} onCommit={(v) => onExtrudeFace(face, elev - Math.max(0, v))} />
        )}
        <div className="flex items-center gap-1 h-7" role="group" aria-label="Extrude by">
          {[-10, -1, 1, 10].map((n) => (
            <button key={n} type="button" onClick={() => onExtrudeFace(face, n)} className={stepClass} title={`${n > 0 ? 'Pull out' : 'Push in'} ${Math.abs(n)} mm`}>
              {signed(n)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {face.kind === 'top' && <IconButton icon={PenLine} label="Sketch on this face (N)" onClick={onSketchOnTop} />}
          <IconButton icon={X} label="Done (Esc)" onClick={onClear} />
        </div>
      </div>
    </PanelShell>
  );
}
