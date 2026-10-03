/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Body3D, EditorMode, MATERIAL_PRESETS, Point2D, ShapeGroup } from '../types';
import { generateSTL } from '../utils/geometry';
import { 
  Box, 
  Trash2, 
  FolderDown, 
  RotateCcw, 
  Plus, 
  Layers, 
  Sliders, 
  FileDown, 
  Copy, 
  Sparkles, 
  Rotate3d, 
  Eye, 
  EyeOff,
  Scissors, 
  Move3d, 
  Repeat, 
  FolderPlus, 
  Ungroup, 
  CheckSquare, 
  Square,
  ArrowUpDown,
  Download,
  Palette,
  Maximize2
} from 'lucide-react';

interface SidebarProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds?: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onToggleSelectBody?: (id: string) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onDeleteBody: (id: string) => void;
  onCloneBody: (id: string) => void;
  onClearWorkspace: () => void;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  onTriggerNewSketch: () => void;
  groups?: ShapeGroup[];
  onGroupSelected?: () => void;
  onUngroup?: (groupId: string) => void;
  onMergeSelected?: () => void;
  onOpenCut?: () => void;
  onOpenBevel?: () => void;
  onOpenMoveFace?: () => void;
  onOpenRepeat?: () => void;
  onApplyCornerRadius?: (id: string, radius: number) => void;
}

const SWATCHES = [
  { name: 'Cobalt Blue', value: '#3b82f6' },
  { name: 'Lead Gray', value: '#475569' },
  { name: 'Crimson Red', value: '#ef4444' },
  { name: 'Teal Forest', value: '#0d9488' },
  { name: 'Neon Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Hot Pink', value: '#db2777' },
  { name: 'Brass Gold', value: '#b45309' },
  { name: 'Royal Violet', value: '#6d28d9' },
  { name: 'Snow Pearl', value: '#f1f5f9' },
];

export default function Sidebar({
  bodies,
  selectedBodyId,
  selectedBodyIds = [],
  onSelectBody,
  onToggleSelectBody,
  onUpdateBody,
  onDeleteBody,
  onCloneBody,
  onClearWorkspace,
  editorMode,
  setEditorMode,
  onTriggerNewSketch,
  groups = [],
  onGroupSelected,
  onUngroup,
  onMergeSelected,
  onOpenCut,
  onOpenBevel,
  onOpenMoveFace,
  onOpenRepeat,
  onApplyCornerRadius,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'inspect' | 'materials' | 'layers' | 'export'>('inspect');
  const selectedBody = bodies.find((b) => b.id === selectedBodyId);

  // Geometric measurements calculation
  const calculateGeometryStats = (points: Point2D[], height: number) => {
    if (points.length < 3) return { area: 0, volume: 0, bbox: { x: 0, z: 0, y: 0 } };

    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    const volume = Math.round(area * height);

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      area: Math.round(area),
      volume,
      bbox: {
        x: Math.round(maxX - minX),
        z: Math.round(maxY - minY),
        y: Math.round(height),
      }
    };
  };

  const activeStats = selectedBody
    ? calculateGeometryStats(selectedBody.points, selectedBody.extrusionHeight)
    : null;

  // Export handlers
  const handleExportSTL = () => {
    if (bodies.length === 0) return;
    const stlText = generateSTL(bodies);
    const blob = new Blob([stlText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Craft3D-Model-${new Date().toISOString().substring(0, 10)}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportOBJ = () => {
    if (bodies.length === 0) return;
    let objText = `# Craft3D Precision CAD Export\n# Exported on ${new Date().toISOString()}\n\n`;
    let vertexOffset = 1;

    bodies.forEach((body) => {
      if (!body.visible || body.points.length < 3) return;
      objText += `g ${body.name.replace(/\s+/g, '_')}\n`;
      const pts = body.points;
      const n = pts.length;
      const h = body.extrusionHeight;

      // Bottom vertices at y = 0
      pts.forEach((pt) => {
        objText += `v ${pt.x.toFixed(2)} 0.00 ${(-pt.y).toFixed(2)}\n`;
      });
      // Top vertices at y = h
      pts.forEach((pt) => {
        objText += `v ${pt.x.toFixed(2)} ${h.toFixed(2)} ${(-pt.y).toFixed(2)}\n`;
      });

      objText += `\n# Bottom cap\nf `;
      for (let i = n; i >= 1; i--) {
        objText += `${vertexOffset + i - 1} `;
      }
      objText += `\n# Top cap\nf `;
      for (let i = 1; i <= n; i++) {
        objText += `${vertexOffset + n + i - 1} `;
      }
      objText += `\n# Side faces\n`;
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const v1 = vertexOffset + i;
        const v2 = vertexOffset + next;
        const v3 = vertexOffset + n + next;
        const v4 = vertexOffset + n + i;
        objText += `f ${v1} ${v4} ${v3} ${v2}\n`;
      }
      objText += `\n`;
      vertexOffset += n * 2;
    });

    const blob = new Blob([objText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Craft3D-Model-${new Date().toISOString().substring(0, 10)}.obj`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(bodies, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `Craft3D-Workspace-${new Date().toISOString().substring(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex flex-col h-full bg-[#090d16] text-slate-100 select-none border-l border-white/5">
      
      {/* Precision CAD Inspector Header */}
      <div className="p-4 pb-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            Model Inspector
          </h2>
          <p className="text-xs text-slate-400">
            {bodies.length} solid {bodies.length === 1 ? 'body' : 'bodies'} in scene
          </p>
        </div>

        <button
          onClick={onTriggerNewSketch}
          className="p-1.5 px-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
          title="New 2D Sketch"
        >
          <Plus size={13} className="stroke-[2.5]" />
          <span>Sketch</span>
        </button>
      </div>

      {/* Modern Clean Segmented Navigation Tabs */}
      <div className="flex items-center gap-1 p-2 px-3 border-b border-white/5 bg-white/[0.02]">
        <button
          onClick={() => setActiveTab('inspect')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
            activeTab === 'inspect'
              ? 'bg-white/10 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Geometry
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
            activeTab === 'materials'
              ? 'bg-white/10 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Material
        </button>
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
            activeTab === 'layers'
              ? 'bg-white/10 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Bodies ({bodies.length})
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
            activeTab === 'export'
              ? 'bg-white/10 text-white font-semibold shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Export
        </button>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pr-3">
        
        {/* TAB 1: GEOMETRY INSPECTOR */}
        {activeTab === 'inspect' && (
          selectedBody ? (
            <div className="flex flex-col gap-5">
              
              {/* Object Identity */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-medium">Part Name</label>
                <input
                  type="text"
                  value={selectedBody.name}
                  onChange={(e) => onUpdateBody(selectedBody.id, { name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 focus:bg-white/10 transition"
                />
              </div>

              {/* Primary Extrusion Depth Section */}
              <div className="flex flex-col gap-2 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-white flex items-center gap-1.5">
                    <ArrowUpDown size={13} className="text-cyan-400" />
                    Extrusion Depth
                  </span>
                  <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                    {selectedBody.extrusionHeight} mm
                  </span>
                </div>

                <input
                  type="range"
                  min="5"
                  max="250"
                  step="5"
                  value={selectedBody.extrusionHeight}
                  onChange={(e) => onUpdateBody(selectedBody.id, { extrusionHeight: parseInt(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                />

                <div className="flex items-center justify-between gap-1 pt-1">
                  <button
                    onClick={() => onUpdateBody(selectedBody.id, { extrusionHeight: Math.max(5, selectedBody.extrusionHeight - 10) })}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-xs font-mono transition cursor-pointer"
                  >
                    -10
                  </button>
                  <button
                    onClick={() => onUpdateBody(selectedBody.id, { extrusionHeight: Math.max(5, selectedBody.extrusionHeight - 5) })}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-xs font-mono transition cursor-pointer"
                  >
                    -5
                  </button>
                  <button
                    onClick={() => onUpdateBody(selectedBody.id, { extrusionHeight: Math.min(500, selectedBody.extrusionHeight + 5) })}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-xs font-mono transition cursor-pointer"
                  >
                    +5
                  </button>
                  <button
                    onClick={() => onUpdateBody(selectedBody.id, { extrusionHeight: Math.min(500, selectedBody.extrusionHeight + 10) })}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-xs font-mono transition cursor-pointer"
                  >
                    +10
                  </button>
                </div>
              </div>

              {/* Corner Fillet / Rounding */}
              {onApplyCornerRadius && (
                <div className="flex flex-col gap-2 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-white flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400" />
                      Corner Fillet (Round)
                    </span>
                    <span className="font-mono font-semibold text-amber-300 tabular-nums">
                      {selectedBody.cornerRadius || 0} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={selectedBody.cornerRadius || 0}
                    onChange={(e) => onApplyCornerRadius(selectedBody.id, parseInt(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Bevel & Chamfer Edges */}
              <div className="flex flex-col gap-2 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-white">3D Edge Bevel</span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={selectedBody.bevelEnabled !== false}
                      onChange={(e) => onUpdateBody(selectedBody.id, { bevelEnabled: e.target.checked })}
                      className="rounded accent-cyan-400"
                    />
                    <span className="text-slate-300">{selectedBody.bevelEnabled !== false ? 'Enabled' : 'Sharp'}</span>
                  </label>
                </div>
                {selectedBody.bevelEnabled !== false && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={selectedBody.bevelSize ?? 1}
                      onChange={(e) => onUpdateBody(selectedBody.id, { bevelSize: parseFloat(e.target.value) })}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                    />
                    <span className="text-xs font-mono text-cyan-300 tabular-nums w-12 text-right">
                      {selectedBody.bevelSize ?? 1} mm
                    </span>
                  </div>
                )}
              </div>

              {/* Cutout Holes Indicator */}
              {selectedBody.holes && selectedBody.holes.length > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-rose-200">
                    {selectedBody.holes.length} internal {selectedBody.holes.length === 1 ? 'cutout' : 'cutouts'}
                  </span>
                  <button
                    onClick={() => onUpdateBody(selectedBody.id, { holes: [] })}
                    className="text-xs text-rose-300 hover:text-white underline cursor-pointer"
                  >
                    Clear Cutouts
                  </button>
                </div>
              )}

              {/* Bounding Box & Volume Dimensions */}
              {activeStats && (
                <div className="flex flex-col gap-2 p-3 bg-white/[0.02] rounded-xl border border-white/5 text-xs">
                  <span className="text-xs text-slate-400 font-medium">Geometric Dimensions</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-[10px] text-slate-400">Width (X)</div>
                      <div className="font-mono font-semibold text-white">{activeStats.bbox.x} mm</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-[10px] text-slate-400">Length (Y)</div>
                      <div className="font-mono font-semibold text-white">{activeStats.bbox.z} mm</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-[10px] text-slate-400">Height (Z)</div>
                      <div className="font-mono font-semibold text-white">{activeStats.bbox.y} mm</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>Base Area: <strong className="text-white font-mono">{activeStats.area.toLocaleString()} mm²</strong></span>
                    <span>Volume: <strong className="text-white font-mono">{activeStats.volume.toLocaleString()} mm³</strong></span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onCloneBody(selectedBody.id)}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer border border-white/10"
                >
                  <Copy size={13} />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={() => onDeleteBody(selectedBody.id)}
                  className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer border border-rose-500/20"
                >
                  <Trash2 size={13} />
                </button>
              </div>

            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-xs flex flex-col items-center gap-2">
              <Box size={24} className="text-slate-600 mb-1" />
              <p className="font-medium text-slate-300">No Solid Selected</p>
              <p className="text-[11px] text-slate-500 max-w-[200px]">
                Click or tap any shape on the 3D plane to inspect and adjust dimensions.
              </p>
            </div>
          )
        )}

        {/* TAB 2: MATERIALS & APPEARANCE */}
        {activeTab === 'materials' && (
          selectedBody ? (
            <div className="flex flex-col gap-5">
              
              {/* Material Preset Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-medium">Physical Material Preset</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {MATERIAL_PRESETS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onUpdateBody(selectedBody.id, { materialType: m.id })}
                      className={`p-2.5 rounded-xl border text-xs text-left transition cursor-pointer flex items-center justify-between ${
                        selectedBody.materialType === m.id
                          ? 'bg-cyan-500/15 border-cyan-400/60 text-white font-semibold'
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${selectedBody.materialType === m.id ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                        <span>{m.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono capitalize">
                        Roughness: {Math.round(m.roughness * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Swatches */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-400 font-medium">Pigment / Surface Color</label>
                <div className="flex flex-wrap gap-2">
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch.value}
                      onClick={() => onUpdateBody(selectedBody.id, { color: swatch.value })}
                      title={swatch.name}
                      style={{ backgroundColor: swatch.value }}
                      className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 cursor-pointer relative shadow-sm border ${
                        selectedBody.color.toLowerCase() === swatch.value.toLowerCase()
                          ? 'border-white scale-110 ring-2 ring-cyan-400/60'
                          : 'border-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-xs">
              Select an object to modify its physical material or pigment.
            </div>
          )
        )}

        {/* TAB 3: BODIES & ASSEMBLIES */}
        {activeTab === 'layers' && (
          <div className="flex flex-col gap-4">
            
            {/* Multi-selection Bar */}
            {selectedBodyIds.length > 1 && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between text-xs">
                <span className="font-medium text-cyan-300">{selectedBodyIds.length} solids selected</span>
                <div className="flex items-center gap-2">
                  {onGroupSelected && (
                    <button
                      onClick={onGroupSelected}
                      className="px-2 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded font-semibold text-[11px] cursor-pointer"
                    >
                      Group
                    </button>
                  )}
                  {onMergeSelected && (
                    <button
                      onClick={onMergeSelected}
                      className="px-2 py-1 bg-purple-500 hover:bg-purple-400 text-white rounded font-semibold text-[11px] cursor-pointer"
                    >
                      Merge
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Assemblies List */}
            {groups.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-400 font-medium">Assemblies ({groups.length})</span>
                {groups.map((grp) => (
                  <div
                    key={grp.id}
                    className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FolderPlus size={14} className="text-blue-400" />
                      <span className="font-medium text-white">{grp.name}</span>
                      <span className="text-[10px] text-slate-400">({grp.bodyIds.length} parts)</span>
                    </div>
                    {onUngroup && (
                      <button
                        onClick={() => onUngroup(grp.id)}
                        className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                        title="Ungroup assembly"
                      >
                        <Ungroup size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bodies List */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-400 font-medium">All Solids ({bodies.length})</span>
              {bodies.map((body) => {
                const isSelected = selectedBodyId === body.id || selectedBodyIds.includes(body.id);
                return (
                  <div
                    key={body.id}
                    onClick={() => onSelectBody(body.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400/60 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: body.color }}
                      />
                      <span className="font-medium truncate">{body.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0">
                        {body.extrusionHeight}mm
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onUpdateBody(body.id, { visible: !body.visible })}
                        className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                        title={body.visible ? 'Hide body' : 'Show body'}
                      >
                        {body.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-600" />}
                      </button>
                      <button
                        onClick={() => onDeleteBody(body.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Delete body"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* TAB 4: EXPORT & 3D PRINTING */}
        {activeTab === 'export' && (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex flex-col gap-2">
              <span className="text-xs font-semibold text-white">3D Printing Export</span>
              <p className="text-xs text-slate-400 leading-relaxed">
                Export solids directly to industry-standard 3D formats compatible with slicers (Cura, PrusaSlicer, Bambu Studio) and 3D modeling packages (Blender, Fusion 360).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleExportSTL}
                className="w-full py-2.5 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <Download size={14} />
                <span>Export Standard STL (3D Print)</span>
              </button>

              <button
                onClick={handleExportOBJ}
                className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-white/10"
              >
                <FileDown size={14} />
                <span>Export Wavefront OBJ</span>
              </button>

              <button
                onClick={handleExportJSON}
                className="w-full py-2 px-3 bg-transparent hover:bg-white/5 text-slate-400 hover:text-white rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <FolderDown size={14} />
                <span>Export Workspace JSON</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/5">
              <button
                onClick={onClearWorkspace}
                className="w-full py-2 px-3 text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>Reset All Solids</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
