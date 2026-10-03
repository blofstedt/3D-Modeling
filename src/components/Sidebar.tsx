/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Box,
  Boxes,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileJson,
  Merge,
  RotateCcw,
  Sparkles,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { Body3D, MATERIAL_PRESETS, ShapeGroup, SWATCHES } from '../types';
import { getPolygonSignedArea } from '../utils/geometry';
import { exportJSON, exportOBJ, exportSTL } from '../utils/exporters';

interface SidebarProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onDeleteBody: (id: string) => void;
  onCloneBody: (id: string) => void;
  onClearWorkspace: () => void;
  onLoadDemo: () => void;
  groups: ShapeGroup[];
  onGroupSelected: () => void;
  onUngroup: (groupId: string) => void;
  onMergeSelected: () => void;
  onApplyCornerRadius: (id: string, radius: number) => void;
}

type Tab = 'properties' | 'material' | 'bodies' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'material', label: 'Material' },
  { id: 'bodies', label: 'Bodies' },
  { id: 'export', label: 'Export' },
];

const fieldClass =
  'h-8 rounded-lg bg-white/6 border border-white/8 px-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent-400 focus:bg-white/8 transition-colors';

const secondaryButton =
  'h-9 px-3 rounded-xl bg-white/6 hover:bg-white/10 border border-white/8 text-sm font-medium text-slate-100 flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:pointer-events-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

interface NumberSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Values outside [min, max] are still accepted via the number field. */
  hardMax?: number;
  onChange: (value: number) => void;
}

function NumberSlider({ label, value, min, max, step = 1, hardMax = max, onChange }: NumberSliderProps) {
  const clampValue = (v: number) => Math.max(min, Math.min(hardMax, v));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={hardMax}
            step={step}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange(clampValue(v));
            }}
            aria-label={label}
            className={`${fieldClass} w-16 text-right tabular-nums`}
          />
          <span className="text-xs text-slate-500 w-5">mm</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={Math.max(max, value)}
        step={step}
        value={value}
        onChange={(e) => onChange(clampValue(parseFloat(e.target.value)))}
        aria-label={`${label} slider`}
        className="w-full h-1 cursor-pointer"
      />
    </div>
  );
}

function bodyStats(body: Body3D) {
  const area = (ring: { x: number; y: number }[]) => (ring.length < 3 ? 0 : Math.abs(getPolygonSignedArea(ring)));
  const footprint = Math.max(0, area(body.points) - (body.holes ?? []).reduce((sum, h) => sum + area(h), 0));
  const xs = body.points.map((p) => p.x);
  const ys = body.points.map((p) => p.y);
  return {
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    depth: Math.round(Math.max(...ys) - Math.min(...ys)),
    height: Math.round(body.extrusionHeight),
    area: Math.round(footprint),
    volume: Math.round(footprint * body.extrusionHeight),
  };
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-12 px-4">
      <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center text-slate-400">
        <Box size={20} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="text-xs text-slate-500 max-w-52 leading-relaxed">{text}</p>
    </div>
  );
}

export default function Sidebar({
  bodies,
  selectedBodyId,
  selectedBodyIds,
  onSelectBody,
  onUpdateBody,
  onDeleteBody,
  onCloneBody,
  onClearWorkspace,
  onLoadDemo,
  groups,
  onGroupSelected,
  onUngroup,
  onMergeSelected,
  onApplyCornerRadius,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>('properties');
  const [exportNote, setExportNote] = useState<string | null>(null);
  const body = bodies.find((b) => b.id === selectedBodyId) || null;
  const stats = body ? bodyStats(body) : null;

  const runExport = (fn: (b: Body3D[]) => boolean | void) => {
    const ok = fn(bodies);
    setExportNote(ok === false ? 'Nothing visible to export.' : null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 text-slate-100">
      <div className="px-4 pt-3.5 pr-14 md:pr-4 shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">Inspector</h2>
        <p className="text-xs text-slate-500">
          {bodies.length} {bodies.length === 1 ? 'body' : 'bodies'}
          {selectedBodyIds.length > 1 && ` · ${selectedBodyIds.length} selected`}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 px-3 mt-3 border-b border-white/8 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`relative px-2.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors ${
              tab === t.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-accent-400" />}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
        {/* ---------------- Properties ---------------- */}
        {tab === 'properties' &&
          (body && stats ? (
            <>
              <Field label="Name">
                <input
                  type="text"
                  value={body.name}
                  onChange={(e) => onUpdateBody(body.id, { name: e.target.value })}
                  className={fieldClass}
                />
              </Field>

              <NumberSlider
                label="Height"
                value={body.extrusionHeight}
                min={2}
                max={250}
                hardMax={600}
                onChange={(v) => onUpdateBody(body.id, { extrusionHeight: v })}
              />

              <NumberSlider
                label="Corner radius"
                value={body.cornerRadius || 0}
                min={0}
                max={30}
                onChange={(v) => onApplyCornerRadius(body.id, v)}
              />

              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-400">Edge bevel</span>
                  <input
                    type="checkbox"
                    checked={body.bevelEnabled !== false}
                    onChange={(e) => onUpdateBody(body.id, { bevelEnabled: e.target.checked })}
                    className="w-4 h-4 accent-accent-400"
                  />
                </label>
                {body.bevelEnabled !== false && (
                  <>
                    <NumberSlider
                      label="Bevel size"
                      value={body.bevelSize ?? 1}
                      min={0.5}
                      max={10}
                      step={0.5}
                      onChange={(v) => onUpdateBody(body.id, { bevelSize: v })}
                    />
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white/6">
                      {[
                        { label: 'Chamfer', active: (body.bevelSegments ?? 3) <= 1, segments: 1 },
                        { label: 'Round', active: (body.bevelSegments ?? 3) > 1, segments: 4 },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => onUpdateBody(body.id, { bevelSegments: opt.segments })}
                          className={`h-7 rounded-md text-xs font-medium transition-colors ${
                            opt.active ? 'bg-white/12 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {body.holes && body.holes.length > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
                  <span className="text-slate-300">
                    {body.holes.length} {body.holes.length === 1 ? 'cutout' : 'cutouts'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateBody(body.id, { holes: [] })}
                    className="text-accent-300 hover:text-accent-200 font-medium"
                  >
                    Fill in
                  </button>
                </div>
              )}

              <div className="rounded-xl bg-white/4 border border-white/6 p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Width', stats.width],
                    ['Depth', stats.depth],
                    ['Height', stats.height],
                  ].map(([label, v]) => (
                    <div key={label}>
                      <div className="text-[11px] text-slate-500">{label}</div>
                      <div className="text-sm font-semibold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-white/6 flex justify-between text-xs text-slate-400">
                  <span>
                    Area <span className="text-slate-200 tabular-nums">{stats.area.toLocaleString()}</span> mm²
                  </span>
                  <span>
                    Volume <span className="text-slate-200 tabular-nums">{stats.volume.toLocaleString()}</span> mm³
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => onCloneBody(body.id)} className={`${secondaryButton} flex-1`}>
                  <Copy size={14} /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteBody(body.id)}
                  aria-label="Delete body"
                  className={`${secondaryButton} text-rose-300 hover:bg-rose-500/15 w-9 px-0`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Nothing selected" text="Click a body in the viewport or the Bodies list to edit its properties." />
          ))}

        {/* ---------------- Material ---------------- */}
        {tab === 'material' &&
          (body ? (
            <>
              <Field label="Finish">
                <div className="flex flex-col gap-1">
                  {MATERIAL_PRESETS.map((m) => {
                    const active = body.materialType === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateBody(body.id, { materialType: m.id })}
                        aria-pressed={active}
                        className={`h-9 px-3 rounded-lg flex items-center justify-between text-sm transition-colors ${
                          active ? 'bg-accent-500/15 text-white ring-1 ring-accent-400/60' : 'bg-white/4 text-slate-300 hover:bg-white/8'
                        }`}
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {m.metalness > 0.5 ? 'Metallic' : `${Math.round(m.roughness * 100)}% rough`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Color">
                <div className="flex flex-wrap gap-2">
                  {SWATCHES.map((swatch) => {
                    const active = body.color.toLowerCase() === swatch.value.toLowerCase();
                    return (
                      <button
                        key={swatch.value}
                        type="button"
                        onClick={() => onUpdateBody(body.id, { color: swatch.value })}
                        title={swatch.name}
                        aria-label={swatch.name}
                        aria-pressed={active}
                        style={{ backgroundColor: swatch.value }}
                        className={`w-7 h-7 rounded-full border border-white/20 transition-transform hover:scale-110 ${
                          active ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-accent-400' : ''
                        }`}
                      />
                    );
                  })}
                  <label
                    title="Custom color"
                    className="relative w-7 h-7 rounded-full border border-dashed border-white/30 overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                    style={{ background: 'conic-gradient(#f43f5e, #f59e0b, #10b981, #3b82f6, #a855f7, #f43f5e)' }}
                  >
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#3b82f6'}
                      onChange={(e) => onUpdateBody(body.id, { color: e.target.value })}
                      aria-label="Custom color"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                </div>
              </Field>
            </>
          ) : (
            <EmptyState title="Nothing selected" text="Select a body to change its material and color." />
          ))}

        {/* ---------------- Bodies ---------------- */}
        {tab === 'bodies' && (
          <>
            {selectedBodyIds.length > 1 && (
              <div className="flex items-center justify-between rounded-xl bg-accent-500/10 border border-accent-400/25 px-3 py-2">
                <span className="text-xs font-medium text-accent-200">{selectedBodyIds.length} selected</span>
                <div className="flex gap-1.5">
                  <button type="button" onClick={onGroupSelected} className="h-7 px-2.5 rounded-md bg-white/10 hover:bg-white/16 text-xs font-medium flex items-center gap-1.5">
                    <Boxes size={13} /> Group
                  </button>
                  <button type="button" onClick={onMergeSelected} className="h-7 px-2.5 rounded-md bg-accent-500 hover:bg-accent-400 text-white text-xs font-medium flex items-center gap-1.5">
                    <Merge size={13} /> Union
                  </button>
                </div>
              </div>
            )}

            {groups.length > 0 && (
              <Field label="Groups">
                <div className="flex flex-col gap-1">
                  {groups.map((g) => (
                    <div key={g.id} className="h-9 px-3 rounded-lg bg-white/4 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <Boxes size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate">{g.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">{g.bodyIds.length}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onUngroup(g.id)}
                        aria-label={`Ungroup ${g.name}`}
                        title="Ungroup"
                        className="p-1 rounded text-slate-400 hover:text-white"
                      >
                        <Ungroup size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
            )}

            {bodies.length === 0 ? (
              <EmptyState title="No bodies yet" text="Draw a sketch and pull it into a solid, or load the sample scene." />
            ) : (
              <Field label="All bodies">
                <ul className="flex flex-col gap-1">
                  {bodies.map((b) => {
                    const selected = selectedBodyIds.includes(b.id);
                    return (
                      <li key={b.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => onSelectBody(b.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectBody(b.id, e.shiftKey);
                            }
                          }}
                          className={`group h-10 pl-2.5 pr-1.5 rounded-lg flex items-center gap-2.5 text-sm cursor-pointer transition-colors ${
                            selected ? 'bg-accent-500/15 ring-1 ring-accent-400/50' : 'hover:bg-white/6'
                          } ${b.visible ? '' : 'opacity-50'}`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: b.color }}
                          />
                          <span className="flex-1 truncate">{b.name}</span>
                          <span className="text-xs text-slate-500 tabular-nums shrink-0">{b.extrusionHeight} mm</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectBody(b.id, true);
                            }}
                            aria-label={selected ? `Remove ${b.name} from selection` : `Add ${b.name} to selection`}
                            aria-pressed={selected}
                            title="Add to / remove from selection"
                            className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              selected ? 'bg-accent-500 border-accent-400 text-white' : 'border-white/20 text-transparent hover:border-white/40'
                            }`}
                          >
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateBody(b.id, { visible: !b.visible });
                            }}
                            aria-label={b.visible ? `Hide ${b.name}` : `Show ${b.name}`}
                            className="p-1 rounded text-slate-400 hover:text-white shrink-0"
                          >
                            {b.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-slate-600 mt-1">Shift-click to select several bodies.</p>
              </Field>
            )}
          </>
        )}

        {/* ---------------- Export ---------------- */}
        {tab === 'export' && (
          <>
            <p className="text-xs text-slate-400 leading-relaxed">
              Exports every visible body exactly as shown, including cutouts and bevels. STL is Z-up, ready for slicers.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => runExport(exportSTL)}
                disabled={bodies.length === 0}
                className="h-9 rounded-xl bg-accent-500 hover:bg-accent-400 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download size={15} /> Export STL
              </button>
              <button type="button" onClick={() => runExport(exportOBJ)} disabled={bodies.length === 0} className={secondaryButton}>
                <Download size={15} /> Export OBJ
              </button>
              <button type="button" onClick={() => runExport(exportJSON)} disabled={bodies.length === 0} className={secondaryButton}>
                <FileJson size={15} /> Save as JSON
              </button>
            </div>
            {exportNote && <p className="text-xs text-amber-300">{exportNote}</p>}

            <div className="mt-2 pt-4 border-t border-white/8 flex flex-col gap-2">
              <button type="button" onClick={onLoadDemo} className={secondaryButton}>
                <Sparkles size={15} /> Load sample scene
              </button>
              <button
                type="button"
                onClick={onClearWorkspace}
                disabled={bodies.length === 0}
                className={`${secondaryButton} text-rose-300 hover:bg-rose-500/15`}
              >
                <RotateCcw size={15} /> Clear workspace
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
