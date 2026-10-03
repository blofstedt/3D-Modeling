/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Scissors, 
  Sparkles, 
  Move3d, 
  Boxes, 
  Repeat, 
  Merge,
  Layers, 
  Rotate3d,
  Plus,
  ArrowUpDown,
  MousePointer
} from 'lucide-react';
import { CadTool, EditorMode } from '../types';

interface CadActionBarProps {
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  activeTool: CadTool;
  setActiveTool: (tool: CadTool) => void;
  selectedBodyCount: number;
  onTriggerNewSketch: () => void;
  onOpenExtrude?: () => void;
  onOpenCut: () => void;
  onOpenBevel: () => void;
  onOpenMoveFace: () => void;
  onOpenGroup: () => void;
  onOpenRepeat: () => void;
  onMergeSolids: () => void;
}

export default function CadActionBar({
  editorMode,
  setEditorMode,
  activeTool,
  setActiveTool,
  selectedBodyCount,
  onTriggerNewSketch,
  onOpenExtrude,
  onOpenCut,
  onOpenBevel,
  onOpenMoveFace,
  onOpenGroup,
  onOpenRepeat,
  onMergeSolids,
}: CadActionBarProps) {
  return (
    <div className="flex items-center gap-1 bg-[#090d16]/95 border border-white/10 backdrop-blur-2xl p-1.5 rounded-2xl shadow-2xl z-30 max-w-full overflow-x-auto no-scrollbar">
      
      {/* 2D / 3D Segmented Switcher */}
      <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/5 shrink-0">
        <button
          onClick={() => setEditorMode('sketch')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
            editorMode === 'sketch'
              ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Switch to 2D Sketch Grid (1)"
        >
          <Layers size={13} />
          <span>2D Sketch</span>
        </button>
        <button
          onClick={() => setEditorMode('view3d')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
            editorMode === 'view3d'
              ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Switch to 3D View (2)"
        >
          <Rotate3d size={13} />
          <span>3D Studio</span>
        </button>
      </div>

      <div className="h-5 w-[1px] bg-white/10 mx-1 shrink-0" />

      {/* Primary CAD Tool Suite */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Select / Pick Tool */}
        <button
          onClick={() => setActiveTool('select')}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'select'
              ? 'bg-white/15 border-white/20 text-white shadow-sm'
              : 'bg-transparent border-transparent text-white/65 hover:text-white hover:bg-white/5'
          }`}
          title="Select Shapes (V)"
        >
          <MousePointer size={13} />
          <span className="hidden md:inline">Select</span>
        </button>

        {/* 1. EXTRUDE / PUSH-PULL */}
        <button
          onClick={() => {
            setActiveTool('extrude');
            if (onOpenExtrude) onOpenExtrude();
          }}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'extrude'
              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Extrude / Push-Pull Height (E)"
        >
          <ArrowUpDown size={13} className="text-cyan-400" />
          <span>Extrude</span>
        </button>

        {/* 2. CUT OUT */}
        <button
          onClick={onOpenCut}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'cut'
              ? 'bg-rose-500/20 border-rose-400/60 text-rose-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Cut Shape (Boolean Subtraction) (C)"
        >
          <Scissors size={13} className="text-rose-400" />
          <span>Cut</span>
        </button>

        {/* 3. ROUND & BEVEL */}
        <button
          onClick={onOpenBevel}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'bevel'
              ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Fillet / Chamfer Bevel Edges (B)"
        >
          <Sparkles size={13} className="text-amber-400" />
          <span>Fillet / Bevel</span>
        </button>

        {/* 4. MOVE FACE */}
        <button
          onClick={onOpenMoveFace}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'moveFace'
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Move Face / Wall Offset (M)"
        >
          <Move3d size={13} className="text-emerald-400" />
          <span className="hidden sm:inline">Move Face</span>
        </button>

        {/* 5. REPEAT PATTERN */}
        <button
          onClick={onOpenRepeat}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'repeat'
              ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Repeat Pattern along Line or Curve (R)"
        >
          <Repeat size={13} className="text-indigo-400" />
          <span className="hidden md:inline">Pattern</span>
        </button>

        {/* 6. GROUP ASSEMBLY */}
        <button
          onClick={onOpenGroup}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            activeTool === 'group'
              ? 'bg-blue-500/20 border-blue-400/60 text-blue-200 font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-white/75 hover:text-white hover:bg-white/5'
          }`}
          title="Group Shapes into Assembly (G)"
        >
          <Boxes size={13} className="text-blue-400" />
          <span className="hidden md:inline">Group {selectedBodyCount > 1 ? `(${selectedBodyCount})` : ''}</span>
        </button>

        {/* 7. UNION MERGE */}
        <button
          onClick={onMergeSolids}
          disabled={selectedBodyCount < 2}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${
            selectedBodyCount >= 2
              ? 'bg-purple-500/20 border-purple-400/50 text-purple-200 hover:bg-purple-500/30'
              : 'bg-transparent border-transparent text-white/25 cursor-not-allowed opacity-40'
          }`}
          title="Merge overlapping shapes (Union) (U)"
        >
          <Merge size={13} className={selectedBodyCount >= 2 ? "text-purple-400" : "text-white/30"} />
          <span className="hidden lg:inline">Union</span>
        </button>
      </div>

      <div className="h-5 w-[1px] bg-white/10 mx-1 shrink-0" />

      {/* New Sketch Action */}
      <button
        onClick={onTriggerNewSketch}
        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-sm shrink-0"
        title="Start a new 2D sketch profile (N)"
      >
        <Plus size={14} className="stroke-[2.5]" />
        <span>New Sketch</span>
      </button>

    </div>
  );
}
