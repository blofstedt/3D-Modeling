/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { BevelStyle, Body3D, CadTool, EdgeSel, MATERIAL_PRESETS, Point2D, RepeatConfig } from '../types';
import { buildBodyGeometry, buildBodyShape, getInteriorAnchor } from '../utils/bodyGeometry';
import { EdgePath, edgeKey, edgeSize, listEdges, outlineSegments } from '../utils/edges';
import { getBase, getOutline, outwardNormal, wallEnds, withOutline } from '../utils/outline';
import { selectionBounds, transformBody } from '../utils/transform';
import ViewCube, { CubeFace } from './ViewCube';

/** What the user is pointing at on a body. Drives which handles are shown. */
export interface EditPart {
  bodyId: string;
  type: 'face' | 'wall' | 'corner';
  faceType?: 'top' | 'bottom';
  /** Base side index for a wall, base vertex index for a corner. */
  index?: number;
}

type GizmoKind =
  | 'extrude-height'
  | 'offset-wall'
  | 'vertex'
  | 'edge-size'
  | 'move-x'
  | 'move-y'
  | 'move-z'
  | 'move-plane'
  | 'rotate';

type Hit =
  | { type: 'gizmo'; gizmo: GizmoKind; bodyId?: string; index?: number }
  | { type: 'edge'; sel: EdgeSel }
  | { type: 'face'; faceType: 'top' | 'bottom'; bodyId: string }
  | { type: 'wall'; bodyId: string; index: number }
  | { type: 'corner'; bodyId: string; index: number };

interface Drag {
  kind: 'height' | 'wall' | 'vertex' | 'edge-size' | 'move-axis' | 'move-plane' | 'rotate';
  pointerId: number;
  startClientY: number;
  mmPerPixel: number;
  bodyId?: string;
  initialHeight?: number;
  initialBase?: Point2D[];
  index?: number;
  normal?: Point2D;
  planeY?: number;
  startPoint?: THREE.Vector3;
  sels?: EdgeSel[];
  initialSize?: number;
  axis?: 'x' | 'y' | 'z';
  origin?: THREE.Vector3;
  t0?: number;
  snapshot?: Map<string, Body3D>;
  center?: Point2D;
  a0?: number;
  minElevation?: number;
}

export interface ModelViewer3DProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  selectedEdges: EdgeSel[];
  onSelectEdges: (edges: EdgeSel[]) => void;
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  repeatConfig: RepeatConfig;
  onUpdateRepeatConfig: React.Dispatch<React.SetStateAction<RepeatConfig>>;
  activeCadTool: CadTool;
  activeEditPart: EditPart | null;
  setActiveEditPart: (part: EditPart | null) => void;
  /** Fired when a handle drag starts/ends so the app can treat it as a single undo step. */
  onDragStateChange?: (dragging: boolean) => void;
}

const ACCENT = '#8b7cf6';
const ACCENT_LIGHT = '#a99dff';
const WARN = '#fbbf24';
const BACKGROUND = '#08090d';
const CLICK_SLOP_PX = 5;
const EDGE_PICK_PX = 9;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function distanceToSegment2D(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/** Fat lines need the viewport size to draw at a pixel width; every live one is tracked here. */
const lineMaterials = new Set<LineMaterial>();
const viewportSize = new THREE.Vector2(1, 1);

function makeFatLine(points: { x: number; y: number; z: number }[], color: string, widthPx: number) {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: widthPx,
    resolution: viewportSize.clone(),
  });
  lineMaterials.add(material);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 20;
  return line;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const o = obj as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material;
    const dispose = (mat: THREE.Material) => {
      if (mat instanceof LineMaterial) lineMaterials.delete(mat);
      mat.dispose();
    };
    if (Array.isArray(m)) m.forEach(dispose);
    else if (m) dispose(m);
  });
}

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function createMaterial(body: Body3D): THREE.Material {
  const preset = MATERIAL_PRESETS.find((p) => p.id === body.materialType) || MATERIAL_PRESETS[0];
  const color = body.color || preset.color;
  const common = {
    color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  };
  switch (body.materialType) {
    case 'glossy':
      return new THREE.MeshPhysicalMaterial({ ...common, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        ...common,
        transmission: preset.transmission ?? 0.8,
        ior: preset.ior ?? 1.5,
        thickness: 8,
        transparent: true,
        opacity: 0.92,
      });
    case 'neon':
      return new THREE.MeshStandardMaterial({
        ...common,
        emissive: color,
        emissiveIntensity: preset.emissiveIntensity ?? 1.2,
      });
    default:
      return new THREE.MeshStandardMaterial(common);
  }
}

const bodySignature = (b: Body3D) =>
  JSON.stringify([
    b.points,
    b.basePoints,
    b.cornerRadii,
    b.holes,
    b.extrusionHeight,
    b.elevation,
    b.edgeBevels,
    b.materialType,
    b.color,
  ]);

interface BodyEntry {
  group: THREE.Group;
  outline: THREE.LineSegments;
  signature: string;
}

export default function ModelViewer3D({
  bodies,
  selectedBodyId,
  selectedBodyIds,
  onSelectBody,
  onUpdateBody,
  selectedEdges,
  onSelectEdges,
  onEdgeChange,
  repeatConfig,
  onUpdateRepeatConfig,
  activeCadTool,
  activeEditPart,
  setActiveEditPart,
  onDragStateChange,
}: ModelViewer3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [dragLabel, setDragLabel] = useState<{ text: string; x: number; y: number } | null>(null);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const previewGroupRef = useRef<THREE.Group | null>(null);
  const entriesRef = useRef<Map<string, BodyEntry>>(new Map());
  const dragRef = useRef<Drag | null>(null);
  const clearHoverRef = useRef<() => void>(() => {});
  const tweenRef = useRef<{
    start: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);
  const frameViewRef = useRef<(face: CubeFace, instant?: boolean) => void>(() => {});

  // Latest props for long-lived event handlers
  const live = useRef({} as Omit<ModelViewer3DProps, 'selectedBodyIds'> & { selectedBodyIds: string[] });
  live.current = {
    bodies,
    selectedBodyId,
    selectedBodyIds,
    selectedEdges,
    activeCadTool,
    activeEditPart,
    repeatConfig,
    onSelectBody,
    onUpdateBody,
    onSelectEdges,
    onEdgeChange,
    onUpdateRepeatConfig,
    setActiveEditPart,
    onDragStateChange,
  };

  // ---- Scene setup (once) -------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog = new THREE.Fog(BACKGROUND, 900, 2800);

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 4000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    viewportSize.set(width, height);

    // Image-based lighting: without an environment map, metals render near-black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.9;

    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(240, 420, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 50;
    key.shadow.camera.far = 1400;
    key.shadow.camera.left = -420;
    key.shadow.camera.right = 420;
    key.shadow.camera.top = 420;
    key.shadow.camera.bottom = -420;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.6;
    scene.add(key);

    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowCatcher.position.y = -0.05;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    const grid = new THREE.GridHelper(1200, 60, '#252a3b', '#151824');
    grid.position.y = -0.1;
    scene.add(grid);

    const axis = (to: THREE.Vector3, color: string) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), to]),
        new THREE.LineBasicMaterial({ color })
      );
    const axisX = axis(new THREE.Vector3(140, 0.05, 0), '#fb7185');
    const axisY = axis(new THREE.Vector3(0, 0.05, -140), '#34d399');
    scene.add(axisX, axisY);

    const bodyGroup = new THREE.Group();
    const helperGroup = new THREE.Group();
    const hoverGroup = new THREE.Group();
    const gizmoGroup = new THREE.Group();
    const previewGroup = new THREE.Group();
    scene.add(bodyGroup, helperGroup, hoverGroup, gizmoGroup, previewGroup);
    bodyGroupRef.current = bodyGroup;
    gizmoGroupRef.current = gizmoGroup;
    helperGroupRef.current = helperGroup;
    previewGroupRef.current = previewGroup;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const setRay = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const intersectPlane = (clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
      setRay(clientX, clientY);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), point) ? point : null;
    };
    /** Position along a world axis nearest to the pointer ray. */
    const axisParam = (clientX: number, clientY: number, origin: THREE.Vector3, dir: THREE.Vector3): number | null => {
      setRay(clientX, clientY);
      const rd = raycaster.ray.direction;
      const w0 = origin.clone().sub(raycaster.ray.origin);
      const b = dir.dot(rd);
      const d = dir.dot(w0);
      const e = rd.dot(w0);
      const denom = 1 - b * b;
      if (Math.abs(denom) < 1e-4) return null;
      return (b * e - d) / denom;
    };
    const axisDir = (name: 'x' | 'y' | 'z') =>
      name === 'x' ? new THREE.Vector3(1, 0, 0) : name === 'y' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);

    // ---- Edge picking (screen-space distance to each edge's polyline) -----
    const edgeCache = new WeakMap<Body3D, EdgePath[]>();
    const edgesOf = (b: Body3D) => {
      let edges = edgeCache.get(b);
      if (!edges) {
        edges = listEdges(b);
        edgeCache.set(b, edges);
      }
      return edges;
    };

    const pickEdge = (clientX: number, clientY: number): EdgeSel | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      camera.updateMatrixWorld();
      const candidates: { sel: EdgeSel; dist: number; point: THREE.Vector3 }[] = [];
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();

      for (const body of live.current.bodies) {
        if (!body.visible) continue;
        for (const edge of edgesOf(body)) {
          let best = Infinity;
          let bestPoint: THREE.Vector3 | null = null;
          for (let i = 0; i + 1 < edge.points.length; i++) {
            const p = edge.points[i];
            const q = edge.points[i + 1];
            a.set(p.x, p.y, p.z).project(camera);
            b.set(q.x, q.y, q.z).project(camera);
            if (a.z > 1 || b.z > 1) continue;
            const ax = (a.x * 0.5 + 0.5) * rect.width;
            const ay = (-a.y * 0.5 + 0.5) * rect.height;
            const bx = (b.x * 0.5 + 0.5) * rect.width;
            const by = (-b.y * 0.5 + 0.5) * rect.height;
            const { distance, t } = distanceToSegment2D(px, py, ax, ay, bx, by);
            if (distance < best) {
              best = distance;
              bestPoint = new THREE.Vector3(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
            }
          }
          if (bestPoint && best <= EDGE_PICK_PX) {
            candidates.push({ sel: { bodyId: body.id, kind: edge.kind, index: edge.index }, dist: best, point: bestPoint });
          }
        }
      }
      candidates.sort((c1, c2) => c1.dist - c2.dist);

      // Skip edges hidden behind the body.
      for (const c of candidates.slice(0, 8)) {
        const toPoint = c.point.clone().sub(camera.position);
        const dist = toPoint.length();
        raycaster.set(camera.position, toPoint.normalize());
        const hit = raycaster.intersectObjects(bodyGroup.children, true)[0];
        if (!hit || hit.distance >= dist - 1.2) return c.sel;
      }
      return null;
    };

    // ---- Hit testing: handles first, then edges (bevel tool), then solids --
    const resolveHit = (clientX: number, clientY: number): Hit | null => {
      setRay(clientX, clientY);

      if (gizmoGroup.children.length) {
        const gizmoHit = raycaster.intersectObjects(gizmoGroup.children, true)[0];
        if (gizmoHit) {
          let obj: THREE.Object3D | null = gizmoHit.object;
          while (obj && !obj.userData.gizmo) obj = obj.parent;
          if (obj) {
            return { type: 'gizmo', gizmo: obj.userData.gizmo, bodyId: obj.userData.bodyId, index: obj.userData.index };
          }
        }
      }

      if (live.current.activeCadTool === 'bevel') {
        const sel = pickEdge(clientX, clientY);
        if (sel) return { type: 'edge', sel };
        setRay(clientX, clientY);
      }

      const hit = raycaster.intersectObjects(bodyGroup.children, true)[0];
      if (!hit) return null;
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData.bodyId) obj = obj.parent;
      if (!obj) return null;
      const bodyId: string = obj.userData.bodyId;
      const body = live.current.bodies.find((b) => b.id === bodyId);
      if (!body) return null;

      const normalY = hit.face ? hit.face.normal.y : 1;
      if (normalY > 0.5) return { type: 'face', faceType: 'top', bodyId };
      if (normalY < -0.5) return { type: 'face', faceType: 'bottom', bodyId };

      const outline = getOutline(body);
      const hx = hit.point.x;
      const hy = -hit.point.z;
      let best = 0;
      let bestDist = Infinity;
      outline.points.forEach((p1, i) => {
        const p2 = outline.points[(i + 1) % outline.points.length];
        const d = distanceToSegment2D(hx, hy, p1.x, p1.y, p2.x, p2.y).distance;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      const role = outline.roles[best];
      return role.kind === 'corner'
        ? { type: 'corner', bodyId, index: role.index }
        : { type: 'wall', bodyId, index: role.index };
    };

    // ---- Hover highlight for edges ----------------------------------------
    let hoverKey: string | null = null;
    const setHover = (sel: EdgeSel | null) => {
      const key = sel ? edgeKey(sel) : null;
      if (key === hoverKey) return;
      hoverKey = key;
      clearGroup(hoverGroup);
      if (!sel) return;
      const body = live.current.bodies.find((b) => b.id === sel.bodyId);
      const edge = body && edgesOf(body).find((e) => e.kind === sel.kind && e.index === sel.index);
      if (edge) hoverGroup.add(makeFatLine(edge.points, ACCENT_LIGHT, 4));
    };
    clearHoverRef.current = () => setHover(null);

    // ---- Drag sessions ----------------------------------------------------
    const mmPerPixel = () => {
      const dist = camera.position.distanceTo(controls.target);
      return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (renderer.domElement.clientHeight || 1);
    };

    const selectedSet = (): Body3D[] => {
      const { selectedBodyIds: ids, selectedBodyId: id, bodies: all } = live.current;
      const list = ids.length ? ids : id ? [id] : [];
      return list.map((i) => all.find((b) => b.id === i)).filter((b): b is Body3D => !!b && b.visible);
    };

    const wallDrag = (common: Pick<Drag, 'pointerId' | 'startClientY' | 'mmPerPixel'>, body: Body3D, side: number, e: PointerEvent): Drag | null => {
      const ends = wallEnds(body, side);
      if (!ends) return null;
      const planeY = (body.elevation ?? 0) + body.extrusionHeight / 2;
      return {
        ...common,
        kind: 'wall',
        bodyId: body.id,
        index: side,
        initialBase: getBase(body).map((p) => ({ ...p })),
        normal: outwardNormal(ends.a, ends.b, ends.winding),
        planeY,
        startPoint: intersectPlane(e.clientX, e.clientY, planeY) ?? undefined,
      };
    };

    const startDrag = (hit: Hit, e: PointerEvent): Drag | null => {
      const common = { pointerId: e.pointerId, startClientY: e.clientY, mmPerPixel: mmPerPixel() };
      const bodyOf = (id?: string) => live.current.bodies.find((b) => b.id === id);

      if (hit.type === 'gizmo') {
        const body = bodyOf(hit.bodyId);
        switch (hit.gizmo) {
          case 'extrude-height':
            return body ? { ...common, kind: 'height', bodyId: body.id, initialHeight: body.extrusionHeight } : null;
          case 'offset-wall':
            return body && hit.index !== undefined ? wallDrag(common, body, hit.index, e) : null;
          case 'vertex':
            return body && hit.index !== undefined
              ? {
                  ...common,
                  kind: 'vertex',
                  bodyId: body.id,
                  index: hit.index,
                  initialBase: getBase(body).map((p) => ({ ...p })),
                  planeY: (body.elevation ?? 0) + body.extrusionHeight,
                }
              : null;
          case 'edge-size': {
            const sels = live.current.selectedEdges;
            const first = sels[0] && bodyOf(sels[0].bodyId);
            return first ? { ...common, kind: 'edge-size', sels, initialSize: edgeSize(first, sels[0]) } : null;
          }
          default: {
            const set = selectedSet();
            const bounds = selectionBounds(set);
            if (!bounds) return null;
            const origin = new THREE.Vector3(bounds.centerX, bounds.maxTop + 0.2, -bounds.centerY);
            const center = { x: bounds.centerX, y: bounds.centerY };
            const move = {
              ...common,
              snapshot: new Map(set.map((b) => [b.id, b])),
              center,
              origin,
              minElevation: bounds.minElevation,
            };
            if (hit.gizmo === 'move-plane') {
              const start = intersectPlane(e.clientX, e.clientY, origin.y);
              return start ? { ...move, kind: 'move-plane', planeY: origin.y, startPoint: start } : null;
            }
            if (hit.gizmo === 'rotate') {
              const p = intersectPlane(e.clientX, e.clientY, origin.y);
              return p ? { ...move, kind: 'rotate', planeY: origin.y, a0: Math.atan2(-p.z - center.y, p.x - center.x) } : null;
            }
            const name = hit.gizmo === 'move-x' ? 'x' : hit.gizmo === 'move-y' ? 'y' : 'z';
            const t0 = axisParam(e.clientX, e.clientY, origin, axisDir(name));
            return t0 === null ? null : { ...move, kind: 'move-axis', axis: name, t0 };
          }
        }
      }

      // In Push/Pull you can also drag the face or wall itself.
      if (live.current.activeCadTool !== 'extrude') return null;
      if (hit.type === 'face' && hit.faceType === 'top') {
        const body = bodyOf(hit.bodyId);
        return body ? { ...common, kind: 'height', bodyId: body.id, initialHeight: body.extrusionHeight } : null;
      }
      if (hit.type === 'wall') {
        const body = bodyOf(hit.bodyId);
        return body ? wallDrag(common, body, hit.index, e) : null;
      }
      return null;
    };

    const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

    const applyDrag = (drag: Drag, e: PointerEvent) => {
      const update = live.current.onUpdateBody;
      const body = drag.bodyId ? live.current.bodies.find((b) => b.id === drag.bodyId) : undefined;
      const rect = renderer.domElement.getBoundingClientRect();
      let text = '';

      if (drag.kind === 'height' && body) {
        const next = clamp(Math.round(drag.initialHeight! + (drag.startClientY - e.clientY) * drag.mmPerPixel), 2, 600);
        update(body.id, { extrusionHeight: next });
        text = `Height ${next} mm`;
      } else if (drag.kind === 'edge-size') {
        const raw = drag.initialSize! + (drag.startClientY - e.clientY) * drag.mmPerPixel * 0.35;
        const next = clamp(Math.round(raw * 2) / 2, 0, 30);
        live.current.onEdgeChange(drag.sels!, { size: next });
        text = next > 0 ? `Size ${next} mm` : 'No bevel';
      } else if (drag.kind === 'wall' && body && drag.normal && drag.startPoint) {
        const cur = intersectPlane(e.clientX, e.clientY, drag.planeY!);
        if (!cur) return;
        const n = drag.normal;
        const dist = Math.round((cur.x - drag.startPoint.x) * n.x - (cur.z - drag.startPoint.z) * n.y);
        const base = drag.initialBase!.map((p) => ({ ...p }));
        [drag.index!, (drag.index! + 1) % base.length].forEach((i) => {
          base[i] = { x: Math.round(base[i].x + n.x * dist), y: Math.round(base[i].y + n.y * dist) };
        });
        update(body.id, withOutline(body, { basePoints: base }));
        text = `Wall ${signed(dist)} mm`;
      } else if (drag.kind === 'vertex' && body) {
        const cur = intersectPlane(e.clientX, e.clientY, drag.planeY!);
        if (!cur) return;
        const base = drag.initialBase!.map((p) => ({ ...p }));
        base[drag.index!] = { x: Math.round(cur.x / 5) * 5, y: Math.round(-cur.z / 5) * 5 };
        update(body.id, withOutline(body, { basePoints: base }));
        text = `Corner ${base[drag.index!].x}, ${base[drag.index!].y}`;
      } else if (drag.snapshot && drag.center && drag.origin) {
        let dx = 0;
        let dy = 0;
        let dz = 0;
        let angle = 0;
        if (drag.kind === 'move-axis') {
          const t = axisParam(e.clientX, e.clientY, drag.origin, axisDir(drag.axis!));
          if (t === null) return;
          const delta = Math.round(t - drag.t0!);
          if (drag.axis === 'x') dx = delta;
          else if (drag.axis === 'y') dy = delta;
          else dz = Math.max(delta, -drag.minElevation!);
          const shown = drag.axis === 'z' ? dz : delta;
          text = `${drag.axis!.toUpperCase()} ${signed(shown)} mm`;
        } else if (drag.kind === 'move-plane') {
          const cur = intersectPlane(e.clientX, e.clientY, drag.planeY!);
          if (!cur) return;
          dx = Math.round(cur.x - drag.startPoint!.x);
          dy = Math.round(-(cur.z - drag.startPoint!.z));
          text = `X ${signed(dx)}, Y ${signed(dy)} mm`;
        } else {
          const cur = intersectPlane(e.clientX, e.clientY, drag.planeY!);
          if (!cur) return;
          let delta = Math.atan2(-cur.z - drag.center.y, cur.x - drag.center.x) - drag.a0!;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          const step = e.shiftKey ? 15 : 1;
          const deg = Math.round((delta * 180) / Math.PI / step) * step;
          angle = (deg * Math.PI) / 180;
          text = `Rotate ${deg}°`;
        }
        drag.snapshot.forEach((b0, id) => {
          update(id, transformBody(b0, { dx, dy, dz, angle, cx: drag.center!.x, cy: drag.center!.y }));
        });
      }
      setDragLabel({ text, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 28 });
    };

    // ---- Pointer pipeline -------------------------------------------------
    let pressed: { x: number; y: number; pointerId: number } | null = null;

    const handleRepeatClick = (clientX: number, clientY: number) => {
      const point = intersectPlane(clientX, clientY, 0);
      if (!point) return;
      let snap: Point2D = { x: Math.round(point.x), y: Math.round(-point.z) };
      live.current.bodies.forEach((b) =>
        b.points.forEach((pt) => {
          if (Math.hypot(pt.x - snap.x, pt.y - snap.y) < 25) snap = { x: pt.x, y: pt.y };
        })
      );
      const cfg = live.current.repeatConfig;
      const update = live.current.onUpdateRepeatConfig;
      if (cfg.drawingStep === 'start') {
        update((p) => ({ ...p, startPoint: snap, drawingStep: 'end' }));
      } else if (cfg.drawingStep === 'end') {
        update((p) =>
          cfg.type === 'curved'
            ? { ...p, endPoint: snap, drawingStep: 'curve' }
            : { ...p, endPoint: snap, isDrawingLine: false, drawingStep: 'done' }
        );
      } else if (cfg.drawingStep === 'curve') {
        update((p) => ({ ...p, controlPoint: snap, isDrawingLine: false, drawingStep: 'done' }));
      }
    };

    const partFromHit = (hit: Hit): EditPart | null => {
      if (hit.type === 'face') return { bodyId: hit.bodyId, type: 'face', faceType: hit.faceType };
      if (hit.type === 'wall') return { bodyId: hit.bodyId, type: 'wall', index: hit.index };
      if (hit.type === 'corner') return { bodyId: hit.bodyId, type: 'corner', index: hit.index };
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      pressed = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      if (live.current.repeatConfig.isDrawingLine) return;

      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) return;
      const drag = startDrag(hit, e);
      if (!drag) return;

      // Take the gesture away from OrbitControls before it starts.
      controls.enabled = false;
      dragRef.current = drag;
      renderer.domElement.setPointerCapture(e.pointerId);

      if (hit.type !== 'gizmo' && hit.type !== 'edge') {
        live.current.onSelectBody(hit.bodyId);
        const part = partFromHit(hit);
        if (part) live.current.setActiveEditPart(part);
      } else if (drag.kind === 'vertex') {
        live.current.setActiveEditPart({ bodyId: drag.bodyId!, type: 'corner', index: drag.index });
      } else if (drag.kind === 'wall') {
        live.current.setActiveEditPart({ bodyId: drag.bodyId!, type: 'wall', index: drag.index });
      }
      live.current.onDragStateChange?.(true);
      applyDrag(drag, e);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        applyDrag(drag, e);
        return;
      }
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
      const hit = resolveHit(e.clientX, e.clientY);
      setHover(hit?.type === 'edge' ? hit.sel : null);
      const tool = live.current.activeCadTool;
      let cursor = 'default';
      if (live.current.repeatConfig.isDrawingLine) cursor = 'crosshair';
      else if (hit?.type === 'gizmo') cursor = 'grab';
      else if (hit?.type === 'edge') cursor = 'pointer';
      else if (hit && tool === 'extrude' && (hit.type === 'wall' || (hit.type === 'face' && hit.faceType === 'top'))) cursor = 'ns-resize';
      else if (hit) cursor = 'pointer';
      renderer.domElement.style.cursor = cursor;
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      if (dragRef.current) {
        dragRef.current = null;
        controls.enabled = true;
        setDragLabel(null);
        live.current.onDragStateChange?.(false);
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        pressed = null;
        return;
      }
      const down = pressed;
      pressed = null;
      if (cancelled || !down || down.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return; // it was an orbit/pan

      if (live.current.repeatConfig.isDrawingLine) {
        handleRepeatClick(e.clientX, e.clientY);
        return;
      }

      const tool = live.current.activeCadTool;
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      const hit = resolveHit(e.clientX, e.clientY);

      if (!hit) {
        if (tool === 'bevel' && live.current.selectedEdges.length) live.current.onSelectEdges([]);
        else live.current.onSelectBody(null);
        live.current.setActiveEditPart(null);
        return;
      }
      if (hit.type === 'gizmo') return;

      if (hit.type === 'edge') {
        const current = live.current.selectedEdges;
        const sameBody = current.length > 0 && current[0].bodyId === hit.sel.bodyId;
        const already = current.some((s) => edgeKey(s) === edgeKey(hit.sel));
        if (multi && sameBody) {
          live.current.onSelectEdges(already ? current.filter((s) => edgeKey(s) !== edgeKey(hit.sel)) : [...current, hit.sel]);
        } else {
          live.current.onSelectEdges([hit.sel]);
        }
        live.current.onSelectBody(hit.sel.bodyId);
        return;
      }

      live.current.onSelectBody(hit.bodyId, multi);
      if (tool === 'bevel') live.current.onSelectEdges([]);
      if (!multi) live.current.setActiveEditPart(partFromHit(hit));
    };
    const onPointerUp = (e: PointerEvent) => finishPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => finishPointer(e, true);
    const onPointerLeave = () => setHover(null);

    // Registered in the capture phase, ahead of OrbitControls, so a handle grab can disable it.
    renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minDistance = 20;
    controls.maxDistance = 2500;

    // ---- Camera framing ---------------------------------------------------
    const frameView = (face: CubeFace, instant = false) => {
      const box = new THREE.Box3();
      let any = false;
      live.current.bodies.forEach((b) => {
        if (!b.visible) return;
        any = true;
        const lo = b.elevation ?? 0;
        b.points.forEach((p) => {
          box.expandByPoint(new THREE.Vector3(p.x, lo, -p.y));
          box.expandByPoint(new THREE.Vector3(p.x, lo + b.extrusionHeight, -p.y));
        });
      });
      if (!any) box.set(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 50, 100));

      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 40);
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const fitFov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect) : vFov;
      const distance = (radius / Math.sin(fitFov / 2)) * 1.2;

      const directions: Record<CubeFace, THREE.Vector3> = {
        iso: new THREE.Vector3(0.62, 0.55, 0.72),
        top: new THREE.Vector3(0, 1, 0.0001),
        bottom: new THREE.Vector3(0, -1, 0.0001),
        front: new THREE.Vector3(0, 0.08, 1),
        back: new THREE.Vector3(0, 0.08, -1),
        right: new THREE.Vector3(1, 0.08, 0),
        left: new THREE.Vector3(-1, 0.08, 0),
      };
      const toPos = center.clone().add(directions[face].normalize().multiplyScalar(distance));

      if (instant) {
        camera.position.copy(toPos);
        controls.target.copy(center);
        controls.update();
        tweenRef.current = null;
      } else {
        tweenRef.current = {
          start: performance.now(),
          fromPos: camera.position.clone(),
          toPos,
          fromTarget: controls.target.clone(),
          toTarget: center,
        };
      }
    };
    frameViewRef.current = frameView;
    frameView('iso', true);

    // ---- Resize + render loop ---------------------------------------------
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      viewportSize.set(w, h);
      lineMaterials.forEach((m) => m.resolution.set(w, h));
    });
    resizeObserver.observe(container);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const tween = tweenRef.current;
      if (tween) {
        const t = clamp((performance.now() - tween.start) / 450, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, ease);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease);
        if (t >= 1) tweenRef.current = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setIsSceneReady(true);

    return () => {
      setIsSceneReady(false);
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      entriesRef.current.clear();
      [bodyGroup, gizmoGroup, helperGroup, previewGroup, hoverGroup].forEach(clearGroup);
      [shadowCatcher, grid, axisX, axisY].forEach(disposeObject);
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
    };
  }, []);

  // ---- Sync solids with the document (only rebuilt when their shape changes) ----
  useEffect(() => {
    const group = bodyGroupRef.current;
    if (!isSceneReady || !group) return;
    const entries = entriesRef.current;
    const visible = new Map(bodies.filter((b) => b.visible).map((b) => [b.id, b]));

    entries.forEach((entry, id) => {
      if (!visible.has(id)) {
        group.remove(entry.group);
        disposeObject(entry.group);
        entries.delete(id);
      }
    });

    visible.forEach((body, id) => {
      const signature = bodySignature(body);
      const existing = entries.get(id);
      if (existing?.signature === signature) return;
      if (existing) {
        group.remove(existing.group);
        disposeObject(existing.group);
        entries.delete(id);
      }

      const geometry = buildBodyGeometry(body);
      if (!geometry) return;
      const mesh = new THREE.Mesh(geometry, createMaterial(body));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const outline = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(outlineSegments(body), 3)),
        new THREE.LineBasicMaterial({ color: ACCENT })
      );
      outline.visible = false;

      const bodyGroup = new THREE.Group();
      bodyGroup.userData.bodyId = id;
      bodyGroup.add(mesh, outline);
      group.add(bodyGroup);
      entries.set(id, { group: bodyGroup, outline, signature });
    });
  }, [bodies, isSceneReady]);

  // ---- Selection outlines -------------------------------------------------
  useEffect(() => {
    entriesRef.current.forEach((entry, id) => {
      entry.outline.visible = id === selectedBodyId || selectedBodyIds.includes(id);
    });
  }, [selectedBodyId, selectedBodyIds, bodies, isSceneReady]);

  // ---- Tool handles & highlights ------------------------------------------
  useEffect(() => {
    const gizmoGroup = gizmoGroupRef.current;
    const helperGroup = helperGroupRef.current;
    if (!isSceneReady || !gizmoGroup || !helperGroup) return;
    clearGroup(gizmoGroup);
    clearGroup(helperGroup);

    const ids = selectedBodyIds.length ? selectedBodyIds : selectedBodyId ? [selectedBodyId] : [];
    const picked = ids.map((id) => bodies.find((b) => b.id === id)).filter((b): b is Body3D => !!b && b.visible);
    const handleMaterial = (color = '#ffffff', opacity = 1) =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity });
    const overlayMaterial = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    const hiddenHit = () => new THREE.MeshBasicMaterial({ visible: false });
    const handleScale = (extent: number) => clamp(extent / 170, 0.7, 2.4);
    const extentOf = (b: Body3D) => {
      const xs = b.points.map((p) => p.x);
      const ys = b.points.map((p) => p.y);
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };

    // ---- Move: axes, ground-plane square, rotation ring ----
    if (activeCadTool === 'move' && picked.length) {
      const b = selectionBounds(picked)!;
      const s = handleScale(Math.max(b.maxX - b.minX, b.maxY - b.minY));
      const root = new THREE.Group();
      root.position.set(b.centerX, b.maxTop + 0.2, -b.centerY);
      root.scale.setScalar(s);

      const arrow = (gizmo: GizmoKind, color: string, orient: (o: THREE.Object3D) => void) => {
        const g = new THREE.Group();
        g.userData = { gizmo };
        const mat = handleMaterial(color);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 34, 10), mat);
        shaft.position.y = 25;
        const head = new THREE.Mesh(new THREE.ConeGeometry(4.2, 11, 16), mat);
        head.position.y = 47.5;
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 58, 8), hiddenHit());
        hit.position.y = 30;
        shaft.renderOrder = head.renderOrder = 31;
        g.add(shaft, head, hit);
        orient(g);
        root.add(g);
      };
      arrow('move-x', '#fb7185', (o) => (o.rotation.z = -Math.PI / 2));
      arrow('move-y', '#34d399', (o) => (o.rotation.x = -Math.PI / 2));
      arrow('move-z', ACCENT, () => {});

      const square = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), handleMaterial(WARN, 0.6));
      square.position.set(26, 0.3, -26);
      square.renderOrder = 30;
      square.userData = { gizmo: 'move-plane' };
      root.add(square);

      const radius = 64;
      const ringGroup = new THREE.Group();
      ringGroup.userData = { gizmo: 'rotate' };
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 1, 8, 72).rotateX(Math.PI / 2), handleMaterial('#d4d9e6', 0.9));
      ring.renderOrder = 30;
      const ringHit = new THREE.Mesh(new THREE.TorusGeometry(radius, 6, 6, 48).rotateX(Math.PI / 2), hiddenHit());
      ringGroup.add(ring, ringHit);
      root.add(ringGroup);
      gizmoGroup.add(root);
    }

    const single = picked.length === 1 ? picked[0] : null;

    // ---- Push/pull: face or wall handle, corner dots ----
    if (activeCadTool === 'extrude' && single) {
      const part = activeEditPart?.bodyId === single.id ? activeEditPart : null;
      const elev = single.elevation ?? 0;
      const top = elev + single.extrusionHeight;
      const topY = top + 0.2;
      const s = handleScale(extentOf(single));
      const wall = part?.type === 'wall' && part.index !== undefined ? wallEnds(single, part.index) : null;
      const topActive = !part || (part.type === 'face' && part.faceType !== 'bottom');

      if (topActive) {
        const shape = buildBodyShape(single);
        if (shape) {
          const overlay = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), overlayMaterial(0.2));
          overlay.position.y = topY;
          overlay.renderOrder = 10;
          helperGroup.add(overlay);
        }
        const anchor = getInteriorAnchor(single);
        const arrow = new THREE.Group();
        arrow.position.set(anchor.x, topY, -anchor.y);
        arrow.scale.setScalar(s);
        arrow.userData = { gizmo: 'extrude-height', bodyId: single.id };
        const mat = handleMaterial(ACCENT);
        const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6.5, 40).rotateX(-Math.PI / 2), mat);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 18, 12), mat);
        shaft.position.y = 9;
        const head = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 20), mat);
        head.position.y = 22.5;
        ring.renderOrder = shaft.renderOrder = head.renderOrder = 30;
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 40, 12), hiddenHit());
        hit.position.y = 16;
        arrow.add(ring, shaft, head, hit);
        gizmoGroup.add(arrow);
      }

      if (wall) {
        const { a, b, winding } = wall;
        const quad = new THREE.BufferGeometry();
        quad.setAttribute(
          'position',
          new THREE.BufferAttribute(
            new Float32Array([
              a.x, elev, -a.y, b.x, elev, -b.y, b.x, top, -b.y,
              a.x, elev, -a.y, b.x, top, -b.y, a.x, top, -a.y,
            ]),
            3
          )
        );
        const wallMesh = new THREE.Mesh(quad, overlayMaterial(0.28));
        wallMesh.renderOrder = 10;
        helperGroup.add(wallMesh);

        const n = outwardNormal(a, b, winding);
        const dir = new THREE.Vector3(n.x, 0, -n.y);
        const group = new THREE.Group();
        group.position.set((a.x + b.x) / 2, (elev + top) / 2, -(a.y + b.y) / 2);
        group.userData = { gizmo: 'offset-wall', bodyId: single.id, index: part!.index };
        const helper = new THREE.ArrowHelper(dir, new THREE.Vector3(), 26 * s, ACCENT, 9 * s, 5 * s);
        (helper.line.material as THREE.Material).depthTest = false;
        (helper.cone.material as THREE.Material).depthTest = false;
        helper.line.renderOrder = helper.cone.renderOrder = 31;
        const hit = new THREE.Mesh(new THREE.SphereGeometry(12 * s, 12, 8), hiddenHit());
        hit.position.copy(dir.clone().multiplyScalar(14 * s));
        group.add(helper, hit);
        gizmoGroup.add(group);
      }

      if (part && part.type !== 'face') {
        const dot = new THREE.SphereGeometry(2.4 * s, 16, 12);
        getBase(single).forEach((pt, i) => {
          const active = part.type === 'corner' && part.index === i;
          const node = new THREE.Mesh(dot, handleMaterial(active ? ACCENT : '#ffffff'));
          node.position.set(pt.x, topY, -pt.y);
          node.renderOrder = 30;
          node.userData = { gizmo: 'vertex', bodyId: single.id, index: i };
          gizmoGroup.add(node);
        });
      }
    }

    // ---- Fillet & bevel: pickable edges, the selection, and its size handle ----
    if (activeCadTool === 'bevel') {
      const positions: number[] = [];
      bodies.forEach((body) => {
        if (!body.visible) return;
        listEdges(body).forEach((edge) => {
          for (let i = 0; i + 1 < edge.points.length; i++) {
            const p = edge.points[i];
            const q = edge.points[i + 1];
            positions.push(p.x, p.y, p.z, q.x, q.y, q.z);
          }
        });
      });
      helperGroup.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
          new THREE.LineBasicMaterial({ color: ACCENT_LIGHT, transparent: true, opacity: 0.28 })
        )
      );

      const chosen = selectedEdges
        .map((sel) => {
          const body = bodies.find((b) => b.id === sel.bodyId);
          const edge = body && listEdges(body).find((e) => e.kind === sel.kind && e.index === sel.index);
          return body && edge ? { body, edge } : null;
        })
        .filter((x): x is { body: Body3D; edge: EdgePath } => !!x);
      chosen.forEach(({ edge }) => helperGroup.add(makeFatLine(edge.points, WARN, 4.5)));

      if (chosen.length) {
        const { body, edge } = chosen[0];
        const mi = Math.floor(edge.points.length / 2);
        const mid = edge.points[mi];
        const prev = edge.points[Math.max(0, mi - 1)];
        const next = edge.points[Math.min(edge.points.length - 1, mi + 1)];
        const s = handleScale(extentOf(body));

        // Push the handle away from the body so it never covers the edge it controls.
        const cx = body.points.reduce((acc, p) => acc + p.x, 0) / body.points.length;
        const cy = body.points.reduce((acc, p) => acc + p.y, 0) / body.points.length;
        const out = new THREE.Vector3(mid.x - cx, 0, mid.z + cy);
        const tangent = new THREE.Vector3(next.x - prev.x, next.y - prev.y, next.z - prev.z);
        if (edge.kind !== 'corner' && tangent.lengthSq() > 0) {
          const side = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
          if (side.dot(out) < 0) side.negate();
          out.copy(side);
        }
        out.y = 0;
        out.normalize().multiplyScalar(9 * s);

        const handle = new THREE.Group();
        handle.position.set(mid.x + out.x, mid.y + (edge.kind === 'bottom' ? -4 * s : edge.kind === 'top' ? 4 * s : 0), mid.z + out.z);
        handle.userData = { gizmo: 'edge-size', bodyId: body.id };
        const knob = new THREE.Mesh(new THREE.SphereGeometry(3.4 * s, 18, 12), handleMaterial('#ffffff'));
        knob.renderOrder = 32;
        const hit = new THREE.Mesh(new THREE.SphereGeometry(9 * s, 12, 8), hiddenHit());
        handle.add(knob, hit);
        gizmoGroup.add(handle);
      }
    }
  }, [activeEditPart, activeCadTool, bodies, selectedBodyId, selectedBodyIds, selectedEdges, isSceneReady]);

  // ---- Pattern path preview ----------------------------------------------
  useEffect(() => {
    const group = previewGroupRef.current;
    if (!isSceneReady || !group) return;
    clearGroup(group);

    const { startPoint, endPoint, controlPoint, type, isDrawingLine, drawingStep } = repeatConfig;
    if (!isDrawingLine && drawingStep !== 'done') return;

    const toWorld = (p: Point2D) => new THREE.Vector3(p.x, 0.6, -p.y);
    const marker = new THREE.SphereGeometry(3.2, 14, 10);
    const markerMat = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false });
    [startPoint, controlPoint, endPoint].forEach((p) => {
      if (!p) return;
      const m = new THREE.Mesh(marker, markerMat);
      m.position.copy(toWorld(p));
      m.renderOrder = 40;
      group.add(m);
    });

    if (startPoint && endPoint) {
      const curve =
        type === 'curved' && controlPoint
          ? new THREE.QuadraticBezierCurve3(toWorld(startPoint), toWorld(controlPoint), toWorld(endPoint))
          : new THREE.LineCurve3(toWorld(startPoint), toWorld(endPoint));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
        new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false })
      );
      line.renderOrder = 39;
      group.add(line);
    }
  }, [repeatConfig, isSceneReady]);

  // Drop any edge hover highlight when leaving the bevel tool.
  useEffect(() => {
    if (activeCadTool !== 'bevel') clearHoverRef.current();
  }, [activeCadTool]);

  const handleSelectCameraAngle = useCallback((face: CubeFace) => frameViewRef.current(face), []);

  return (
    <div className="absolute inset-0 select-none touch-none overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />

      <ViewCube
        camera={isSceneReady ? cameraRef.current : null}
        onSelectFace={handleSelectCameraAngle}
        onResetCamera={() => handleSelectCameraAngle('iso')}
      />

      {dragLabel && (
        <div
          className="absolute z-30 pointer-events-none px-2 py-1 rounded-lg bg-slate-950/90 border border-white/15 text-xs font-medium text-white tabular-nums shadow-lg whitespace-nowrap"
          style={{ left: dragLabel.x, top: dragLabel.y }}
        >
          {dragLabel.text}
        </div>
      )}

      <div className="hidden md:block absolute bottom-3 left-3 text-xs text-slate-500 pointer-events-none">
        Drag empty space to orbit · Right-drag to pan · Scroll to zoom
      </div>
    </div>
  );
}
