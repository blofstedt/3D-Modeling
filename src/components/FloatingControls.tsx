/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { PenLine, Trash2, X } from 'lucide-react';
import { BevelStyle, Body3D, EdgeSel, FaceSel } from '../types';
import { edgeSize, edgeStyle, MAX_BEVEL_SIZE } from '../utils/edges';
import { IconButton, NumberBox, Segmented, StepButton, signed, spring } from './controls';

/** Rounded card the viewer pins next to the selection; it springs in from the selection and shrinks back out. */
function PanelShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.12 } }}
      transition={{ ...spring, stiffness: 420, damping: 28 }}
      style={{ transformOrigin: '50% 100%' }}
      className="flex flex-col gap-2.5 px-4 py-3 rounded-[1.75rem] bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
    >
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-sm font-semibold text-white leading-tight">{title}</span>
        {sub && <span className="text-[11px] leading-tight text-slate-400 truncate max-w-40">{sub}</span>}
      </div>
      {children}
    </motion.div>
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
          style={{ ["--fill" as string]: `${(Math.min(size, MAX_BEVEL_SIZE) / MAX_BEVEL_SIZE) * 100}%` }}
          className="w-36 h-1.5"
        />
        <NumberBox label={onlyCorners ? 'Radius' : 'Size'} value={size} step={0.5} min={0} max={MAX_BEVEL_SIZE} onCommit={set} />
      </div>
      <div className="flex items-center gap-2">
        {!onlyCorners && (
          <Segmented
            id="profile"
            label="Edge profile"
            value={style}
            onChange={(v) => onEdgeChange(edges, { style: v })}
            options={[
              { value: 'round', label: 'Curved' },
              { value: 'chamfer', label: 'Flat' },
            ]}
          />
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
            <StepButton key={n} onClick={() => onExtrudeFace(face, n)} title={`${n > 0 ? 'Pull out' : 'Push in'} ${Math.abs(n)} mm`}>
              {signed(n)}
            </StepButton>
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
