/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point2D {
  x: number;
  y: number;
}

export type MaterialType = 'matte' | 'metal' | 'glossy' | 'glass' | 'neon';

export interface MaterialPreset {
  id: MaterialType;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  emissiveIntensity?: number;
  transmission?: number;
  ior?: number;
}

export interface Body3D {
  id: string;
  name: string;
  points: Point2D[];
  basePoints?: Point2D[]; // original unrounded vertices for dynamic corner radius edits
  holes?: Point2D[][]; // cutouts or inner loops
  extrusionHeight: number;
  color: string;
  materialType: MaterialType;
  visible: boolean;
  createdAt: string;
  // Edge & Corner controls
  bevelEnabled?: boolean;
  bevelSize?: number; // 0 to 15
  bevelSegments?: number; // 1 (chamfer) to 5 (round fillet)
  cornerRadius?: number; // 0 to 30 (2D corner rounding)
  // Grouping
  groupId?: string;
}

export interface ShapeGroup {
  id: string;
  name: string;
  bodyIds: string[];
}

export type CadTool = 'select' | 'extrude' | 'cut' | 'bevel' | 'moveFace' | 'group' | 'repeat' | 'merge';

export interface RepeatConfig {
  type: 'linear' | 'curved';
  count: number;
  startPoint: Point2D | null;
  controlPoint: Point2D | null;
  endPoint: Point2D | null;
  followCurve: boolean;
  isDrawingLine: boolean;
  drawingStep: 'start' | 'end' | 'curve' | 'done';
}

export type EditorMode = 'sketch' | 'view3d';

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'matte',
    name: 'Matte Polymer',
    color: '#3b82f6', // blue
    roughness: 0.8,
    metalness: 0.1
  },
  {
    id: 'metal',
    name: 'Anodized Steel',
    color: '#94a3b8', // slate/gray
    roughness: 0.2,
    metalness: 0.95
  },
  {
    id: 'glossy',
    name: 'Polished Lacquer',
    color: '#ef4444', // red
    roughness: 0.05,
    metalness: 0.0
  },
  {
    id: 'glass',
    name: 'Translucent Acrylic',
    color: '#10b981', // green
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.8,
    ior: 1.5
  },
  {
    id: 'neon',
    name: 'Emissive Lasing',
    color: '#eab308', // yellow
    roughness: 0.5,
    metalness: 0.0,
    emissiveIntensity: 1.5
  }
];

export const GRID_SPACING = 20; // grid snap interval in pixels

export interface ColorSwatch {
  name: string;
  value: string;
}

export const SWATCHES: ColorSwatch[] = [
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

