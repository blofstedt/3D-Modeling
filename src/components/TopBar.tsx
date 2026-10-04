/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Box, FileDown, Move, Palette, Redo2, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react';
import { BevelStyle, Body3D, EdgeSel, FaceSel } from '../types';
import { edgeSize, edgeStyle, MAX_BEVEL_SIZE } from '../utils/edges';
import { selectionBounds } from '../utils/transform';
import MenuButton from './Menu';
import Sidebar from './Sidebar';
import { IconButton, NumberBox, Segmented, StepButton, signed, spring } from './controls';

type SidebarProps = React.ComponentProps<typeof Sidebar>;

interface TopBarProps {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selected: Body3D[];
  /** The selection is one joined shape made of several pieces. */
  joined: boolean;
  edges: EdgeSel[];
  face: FaceSel | null;
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  onClearEdges: () => void;
  onExtrudeFace: (face: FaceSel, delta: number) => void;
  onClearFace: () => void;
  onMove: (dx: number, dy: number, dz: number) => void;
  onResize: (width: number, depth: number) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  sidebar: Omit<SidebarProps, 'section'>;
}

const Chip = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="shrink-0 px-1 leading-tight">
    <div className="text-sm font-semibold text-white whitespace-nowrap">{children}</div>
    {sub && <div className="text-[11px] text-slate-400 whitespace-nowrap">{sub}</div>}
  </div>
);

/** Width, depth, height and where it is: all typed in one small menu. */
function SizePositionPanel({ selected, onMove, onResize, onUpdateBody }: Pick<TopBarProps, 'selected' | 'onMove' | 'onResize' | 'onUpdateBody'>) {
  const b = selectionBounds(selected);
  if (!b) return null;
  const single = selected.length === 1 ? selected[0] : null;
  const width = b.maxX - b.minX;
  const depth = b.maxY - b.minY;
  return (
    <div className="p-4 flex flex-col gap-3 w-[min(19rem,calc(100vw-1.5rem))]">
      {single && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1.5">Size (mm)</p>
          <div className="flex gap-2">
            <NumberBox label="Width" value={width} min={1} onCommit={(v) => onResize(v, depth)} />
            <NumberBox label="Depth" value={depth} min={1} onCommit={(v) => onResize(width, v)} />
            <NumberBox
              label="Height"
              value={single.extrusionHeight}
              min={2}
              max={600}
              onCommit={(v) => onUpdateBody(single.id, { extrusionHeight: Math.max(2, Math.min(600, Math.round(v))) })}
            />
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-1.5">Position (mm)</p>
        <div className="flex gap-2">
          <NumberBox label="X" value={b.centerX} onCommit={(v) => onMove(v - b.centerX, 0, 0)} />
          <NumberBox label="Y" value={b.centerY} onCommit={(v) => onMove(0, v - b.centerY, 0)} />
          <NumberBox label="Z" value={b.minElevation} min={0} onCommit={(v) => onMove(0, 0, Math.max(0, v) - b.minElevation)} />
        </div>
      </div>
    </div>
  );
}

export default function TopBar(props: TopBarProps) {
  const { selected, edges, face, openId, setOpenId } = props;
  const body = selected.length === 1 ? selected[0] : null;

  let mode = 'none';
  if (body && edges.length) mode = 'edge';
  else if (body && face && face.bodyId === body.id) mode = 'face';
  else if (body) mode = 'shape';
  else if (selected.length > 1) mode = 'multi';

  const dynamic = (() => {
    if (mode === 'edge' && body) {
      const onlyCorners = edges.every((e) => e.kind === 'corner');
      const size = edgeSize(body, edges[0]);
      const style = edgeStyle(body, edges.find((e) => e.kind !== 'corner') ?? edges[0]) ?? 'round';
      const set = (v: number) => props.onEdgeChange(edges, { size: Math.max(0, Math.min(MAX_BEVEL_SIZE, v)) });
      return (
        <>
          <Chip sub={body.name}>{edges.length > 1 ? `${edges.length} ${onlyCorners ? 'corners' : 'edges'}` : onlyCorners ? 'Corner' : 'Edge'}</Chip>
          <NumberBox label={onlyCorners ? 'Radius' : 'Size'} value={size} step={0.5} min={0} max={MAX_BEVEL_SIZE} onCommit={set} />
          {!onlyCorners && (
            <Segmented
              id="bar-profile"
              label="Edge profile"
              value={style}
              onChange={(v) => props.onEdgeChange(edges, { style: v })}
              options={[
                { value: 'round', label: 'Curved' },
                { value: 'chamfer', label: 'Flat' },
              ]}
            />
          )}
          <IconButton icon={Trash2} label="Remove bevel (Del)" onClick={() => props.onEdgeChange(edges, { size: 0 })} danger />
          <IconButton icon={X} label="Done (Esc)" onClick={props.onClearEdges} />
        </>
      );
    }
    if (mode === 'face' && body && face) {
      const elev = body.elevation ?? 0;
      return (
        <>
          <Chip sub={body.name}>{face.kind === 'top' ? 'Top face' : face.kind === 'bottom' ? 'Bottom face' : `Wall ${(face.index ?? 0) + 1}`}</Chip>
          {face.kind === 'top' && <NumberBox label="Height" value={body.extrusionHeight} min={2} max={600} onCommit={(v) => props.onExtrudeFace(face, v - body.extrusionHeight)} />}
          {face.kind === 'bottom' && <NumberBox label="Bottom at" value={elev} min={0} onCommit={(v) => props.onExtrudeFace(face, elev - Math.max(0, v))} />}
          <div className="flex items-center gap-1">
            {[-10, -1, 1, 10].map((n) => (
              <StepButton key={n} onClick={() => props.onExtrudeFace(face, n)} title={`${n > 0 ? 'Pull out' : 'Push in'} ${Math.abs(n)} mm`}>
                {signed(n)}
              </StepButton>
            ))}
          </div>
          <IconButton icon={X} label="Done (Esc)" onClick={props.onClearFace} />
          <MenuButton id="size" openId={openId} setOpenId={setOpenId} label="Size & position" icon={Move} placement="down">
            <SizePositionPanel {...props} />
          </MenuButton>
          <MenuButton id="material" openId={openId} setOpenId={setOpenId} label="Material" icon={Palette} placement="down">
            <Sidebar {...props.sidebar} section="material" />
          </MenuButton>
        </>
      );
    }
    if (mode === 'shape' && body) {
      return (
        <>
          <MenuButton id="props" openId={openId} setOpenId={setOpenId} label={body.name} icon={SlidersHorizontal} placement="down" title="Shape properties">
            <Sidebar {...props.sidebar} section="properties" />
          </MenuButton>
          <MenuButton id="size" openId={openId} setOpenId={setOpenId} label="Size & position" icon={Move} placement="down">
            <SizePositionPanel {...props} />
          </MenuButton>
          <MenuButton id="material" openId={openId} setOpenId={setOpenId} label="Material" icon={Palette} placement="down">
            <Sidebar {...props.sidebar} section="material" />
          </MenuButton>
        </>
      );
    }
    if (mode === 'multi') {
      return (
        <>
          <Chip sub={props.joined ? 'Joined · moves as one' : 'Drag one to move them all'}>{props.joined ? selected[0].name : `${selected.length} shapes`}</Chip>
          <MenuButton id="size" openId={openId} setOpenId={setOpenId} label="Position" icon={Move} placement="down">
            <SizePositionPanel {...props} />
          </MenuButton>
        </>
      );
    }
    return <span className="text-[13px] text-slate-500 whitespace-nowrap">Tap a shape to see its properties</span>;
  })();

  return (
    <header className="h-14 shrink-0 px-3 flex items-center gap-2 bg-slate-900 border-b border-white/8 z-40">
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center text-white">
          <Box size={16} strokeWidth={2} />
        </div>
        <IconButton icon={Undo2} label="Undo (⌘Z)" onClick={props.onUndo} />
        <IconButton icon={Redo2} label="Redo (⇧⌘Z)" onClick={props.onRedo} />
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.08 } }}
            transition={spring}
            className="flex items-center justify-start sm:justify-center gap-2 min-w-max sm:min-w-0 sm:px-2"
          >
            {dynamic}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <MenuButton id="file" openId={openId} setOpenId={setOpenId} icon={FileDown} placement="down" title="Export and file">
          <Sidebar {...props.sidebar} section="export" />
        </MenuButton>
      </div>
    </header>
  );
}
