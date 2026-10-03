/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { BevelStyle, Body3D, EdgeSel, MATERIAL_PRESETS, Point2D, RepeatConfig } from '../types';
import { buildBodyGeometry, getInteriorAnchor } from '../utils/bodyGeometry';
import { EdgePath, edgeKey, edgeSize, listEdges, outlineSegments } from '../utils/edges';
import { getBase, outwardNormal, wallEnds, withOutline } from '../utils/outline';
import { BodyTransform, selectionBounds } from '../utils/transform';
import ViewCube, { CubeFace } from './ViewCube';

type GizmoKind = 'extrude-height' | 'offset-wall' | 'edge-size' | 'rotate';

type Hit =
  | { type: 'gizmo'; gizmo: GizmoKind; bodyId?: string; index?: number }
  | { type: 'edge'; sel: EdgeSel }
  | { type: 'body'; bodyId: string; point: THREE.Vector3 };

interface Drag {
  kind: 'height' | 'wall' | 'edge-size' | 'move' | 'rotate';
  startClientY: number;
  mmPerPixel: number;
  bodyId?: string;
  planeY?: number;
  startPoint?: THREE.Vector3;
  // height
  initialHeight?: number;
  nextHeight?: number;
  // wall
  index?: number;
  initialBase?: Point2D[];
  normal?: Point2D;
  // edge size
  sels?: EdgeSel[];
  initialSize?: number;
  // move / rotate
  ids?: string[];
  center?: Point2D;
  a0?: number;
  dx?: number;
  dy?: number;
  angle?: number;
}

export interface ModelViewer3DProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  onTransformBodies: (ids: string[], t: BodyTransform) => void;
  selectedEdges: EdgeSel[];
  onSelectEdges: (edges: EdgeSel[]) => void;
  onEdgeChange: (edges: EdgeSel[], patch: { size?: number; style?: BevelStyle }) => void;
  repeatConfig: RepeatConfig;
  onUpdateRepeatConfig: React.Dispatch<React.SetStateAction<RepeatConfig>>;
  /** Fired when a drag starts/ends so the app can treat it as a single undo step. */
  onDragStateChange?: (dragging: boolean) => void;
  /** One line saying what the pointer is over and what dragging it will do. */
  onHint?: (text: string) => void;
}

const ACCENT = '#8b7cf6';
const ACCENT_LIGHT = '#a99dff';
const WARN = '#fbbf24';
const BACKGROUND = '#08090d';
const CLICK_SLOP_PX = 5;
const EDGE_PICK_PX = 7;
const MAX_WALL_HANDLES = 16;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

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

// Handle geometry and materials are built once and shared; they are never disposed.
const shared = <T extends THREE.BufferGeometry | THREE.Material>(item: T): T => {
  item.userData.shared = true;
  return item;
};
const HANDLE = {
  dot: shared(new THREE.SphereGeometry(1, 16, 12)),
  shaft: shared(new THREE.CylinderGeometry(1.1, 1.1, 18, 12)),
  head: shared(new THREE.ConeGeometry(4.2, 9, 20)),
  arrowHit: shared(new THREE.CylinderGeometry(11, 11, 40, 12)),
};
const handleMaterials = new Map<string, THREE.MeshBasicMaterial>();
const handleMaterial = (color: string, opacity = 1, depthTest = false) => {
  const key = `${color}:${opacity}:${depthTest}`;
  let m = handleMaterials.get(key);
  if (!m) {
    m = shared(new THREE.MeshBasicMaterial({ color, depthTest, transparent: true, opacity }));
    handleMaterials.set(key, m);
  }
  return m;
};
const hiddenMaterial = shared(new THREE.MeshBasicMaterial({ visible: false }));

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const o = obj as THREE.Mesh;
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const m = o.material;
    const dispose = (mat: THREE.Material) => {
      if (mat.userData.shared) return;
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
  body: Body3D;
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
  onTransformBodies,
  selectedEdges,
  onSelectEdges,
  onEdgeChange,
  repeatConfig,
  onUpdateRepeatConfig,
  onDragStateChange,
  onHint,
}: ModelViewer3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isSceneReady, setIsSceneReady] = useState(false);
  /** Body whose bevel cuts are skipped while its outline is being dragged. */
  const [fastId, setFastId] = useState<string | null>(null);
  const [dragLabel, setDragLabel] = useState<{ text: string; x: number; y: number } | null>(null);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const previewGroupRef = useRef<THREE.Group | null>(null);
  const entriesRef = useRef<Map<string, BodyEntry>>(new Map());
  const heightArrowRef = useRef<THREE.Object3D | null>(null);
  const invalidateRef = useRef<(shadows?: boolean) => void>(() => {});
  const refreshOutlinesRef = useRef<() => void>(() => {});
  const clearHoverRef = useRef<() => void>(() => {});
  const frameViewRef = useRef<(face: CubeFace, instant?: boolean) => void>(() => {});
  const tweenRef = useRef<{
    start: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  // Latest props for long-lived event handlers
  const live = useRef({} as ModelViewer3DProps);
  live.current = {
    bodies,
    selectedBodyId,
    selectedBodyIds,
    selectedEdges,
    repeatConfig,
    onSelectBody,
    onUpdateBody,
    onTransformBodies,
    onSelectEdges,
    onEdgeChange,
    onUpdateRepeatConfig,
    onDragStateChange,
    onHint,
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
    const fullRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setSize(width, height);
    renderer.setPixelRatio(fullRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows only change when something moves, so they are redrawn on request.
    renderer.shadowMap.autoUpdate = false;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    viewportSize.set(width, height);

    // Image-based lighting: without an environment map, metals render near-black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.55;

    const key = new THREE.DirectionalLight('#ffffff', 1.15);
    key.position.set(240, 420, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
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

    // ---- On-demand rendering and adaptive resolution ----------------------
    let needsRender = true;
    let shadowsDirty = true;
    const invalidate = (shadows = false) => {
      needsRender = true;
      if (shadows) shadowsDirty = true;
    };
    invalidateRef.current = invalidate;

    let qualityTimer = 0;
    const lowerQualityWhileBusy = () => {
      if (fullRatio > 1 && renderer.getPixelRatio() !== 1) renderer.setPixelRatio(1);
      window.clearTimeout(qualityTimer);
      qualityTimer = window.setTimeout(() => {
        if (renderer.getPixelRatio() !== fullRatio) {
          renderer.setPixelRatio(fullRatio);
          invalidate();
        }
      }, 220);
    };

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

    // ---- Edge picking (screen-space distance to each edge's polyline) -----
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
        for (const edge of listEdges(body)) {
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
            // Cheap reject before the exact distance.
            if (Math.min(ax, bx) - EDGE_PICK_PX > px || Math.max(ax, bx) + EDGE_PICK_PX < px) continue;
            if (Math.min(ay, by) - EDGE_PICK_PX > py || Math.max(ay, by) + EDGE_PICK_PX < py) continue;
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
      for (const c of candidates.slice(0, 6)) {
        const toPoint = c.point.clone().sub(camera.position);
        const dist = toPoint.length();
        raycaster.set(camera.position, toPoint.normalize());
        const hit = raycaster.intersectObjects(bodyGroup.children, true)[0];
        if (!hit || hit.distance >= dist - 1.2) return c.sel;
      }
      return null;
    };

    // ---- Hit testing: handles first, then edges, then solids ---------------
    const resolveHit = (clientX: number, clientY: number): Hit | null => {
      setRay(clientX, clientY);

      if (gizmoGroup.visible && gizmoGroup.children.length) {
        const gizmoHit = raycaster.intersectObjects(gizmoGroup.children, true)[0];
        if (gizmoHit) {
          let obj: THREE.Object3D | null = gizmoHit.object;
          while (obj && !obj.userData.gizmo) obj = obj.parent;
          // The rotation halo lies on the floor: where a shape stands in front of it, the shape wins.
          const hiddenBehindShape =
            obj?.userData.gizmo === 'rotate' && (raycaster.intersectObjects(bodyGroup.children, true)[0]?.distance ?? Infinity) < gizmoHit.distance;
          if (obj && !hiddenBehindShape) {
            return { type: 'gizmo', gizmo: obj.userData.gizmo, bodyId: obj.userData.bodyId, index: obj.userData.index };
          }
        }
      }

      if (!live.current.repeatConfig.isDrawingLine) {
        const sel = pickEdge(clientX, clientY);
        if (sel) return { type: 'edge', sel };
        setRay(clientX, clientY);
      }

      const hit = raycaster.intersectObjects(bodyGroup.children, true)[0];
      if (!hit) return null;
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData.bodyId) obj = obj.parent;
      return obj ? { type: 'body', bodyId: obj.userData.bodyId, point: hit.point.clone() } : null;
    };

    // ---- Hover feedback ----------------------------------------------------
    let hoverEdgeKey: string | null = null;
    let hoverBodyId: string | null = null;
    let lastHint = '';
    const showHint = (text: string) => {
      if (text !== lastHint) {
        lastHint = text;
        live.current.onHint?.(text);
      }
    };

    const setHoverEdge = (sel: EdgeSel | null) => {
      const k = sel ? edgeKey(sel) : null;
      if (k === hoverEdgeKey) return;
      hoverEdgeKey = k;
      clearGroup(hoverGroup);
      if (sel) {
        const body = live.current.bodies.find((b) => b.id === sel.bodyId);
        const edge = body && listEdges(body).find((e) => e.kind === sel.kind && e.index === sel.index);
        if (edge) hoverGroup.add(makeFatLine(edge.points, ACCENT_LIGHT, 4));
      }
      invalidate();
    };
    clearHoverRef.current = () => {
      setHoverEdge(null);
      if (hoverBodyId) {
        hoverBodyId = null;
        refreshOutlines();
      }
    };

    const refreshOutlines = () => {
      const { selectedBodyIds: ids, selectedBodyId: id } = live.current;
      entriesRef.current.forEach((entry, bodyId) => {
        const selected = bodyId === id || ids.includes(bodyId);
        const hovered = bodyId === hoverBodyId;
        entry.outline.visible = selected || hovered;
        (entry.outline.material as THREE.LineBasicMaterial).opacity = selected ? 1 : 0.45;
      });
      invalidate();
    };
    refreshOutlinesRef.current = refreshOutlines;

    const idleHint = () => {
      if (live.current.repeatConfig.isDrawingLine) return 'Click the ground or a corner to place the pattern path';
      return live.current.selectedBodyIds.length
        ? 'Drag the shape to move it · arrow = height · dots = walls · ring = rotate · click an edge to bevel it'
        : 'Click a shape to select it · drag empty space to orbit';
    };

    const hover = (clientX: number, clientY: number) => {
      if (drag || candidate) return;
      const hit = resolveHit(clientX, clientY);
      setHoverEdge(hit?.type === 'edge' ? hit.sel : null);
      const bodyHover = hit?.type === 'body' ? hit.bodyId : hit?.type === 'edge' ? hit.sel.bodyId : null;
      if (bodyHover !== hoverBodyId) {
        hoverBodyId = bodyHover;
        refreshOutlines();
      }

      let cursor = 'default';
      let text = idleHint();
      if (live.current.repeatConfig.isDrawingLine) cursor = 'crosshair';
      else if (hit?.type === 'gizmo') {
        cursor = hit.gizmo === 'extrude-height' || hit.gizmo === 'edge-size' ? 'ns-resize' : 'grab';
        text =
          hit.gizmo === 'extrude-height'
            ? 'Drag to change the height'
            : hit.gizmo === 'offset-wall'
              ? 'Drag to push or pull this wall'
              : hit.gizmo === 'edge-size'
                ? 'Drag to change the bevel size'
                : 'Drag to rotate';
      } else if (hit?.type === 'edge') {
        cursor = 'pointer';
        text = 'Click to select this edge and bevel it · drag to move the shape';
      } else if (hit?.type === 'body') {
        cursor = 'move';
        text = live.current.selectedBodyIds.includes(hit.bodyId) ? 'Drag to move · click an edge to bevel it' : 'Click to select · drag to move';
      }
      renderer.domElement.style.cursor = cursor;
      showHint(text);
    };

    // ---- Drag sessions ----------------------------------------------------
    let drag: Drag | null = null;
    let candidate: { x: number; y: number; hit: Hit | null; pointerId: number } | null = null;
    let pending: { x: number; y: number; shift: boolean } | null = null;
    let pendingHover: { x: number; y: number } | null = null;

    const mmPerPixel = () => {
      const dist = camera.position.distanceTo(controls.target);
      return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (renderer.domElement.clientHeight || 1);
    };

    const resetPreviews = () => {
      entriesRef.current.forEach((entry) => {
        entry.group.position.set(0, 0, 0);
        entry.group.rotation.set(0, 0, 0);
        entry.group.scale.set(1, 1, 1);
      });
    };

    const bodyOf = (id?: string) => live.current.bodies.find((b) => b.id === id);

    /** Bodies that move together when `id` is dragged: the selection if it includes it, else its group. */
    const movingSet = (id: string): string[] => {
      const { selectedBodyIds: sel, bodies: all } = live.current;
      if (sel.includes(id)) return sel;
      const group = all.find((b) => b.id === id)?.groupId;
      return group ? all.filter((b) => b.groupId === group).map((b) => b.id) : [id];
    };

    const restoreGizmos = () => {
      gizmoGroup.visible = true;
      helperGroup.visible = true;
      gizmoGroup.children.forEach((c) => (c.visible = true));
    };

    const beginDrag = (d: Drag, pointerId: number) => {
      drag = d;
      controls.enabled = false;
      renderer.domElement.setPointerCapture(pointerId);
      // Show only the handle being dragged; the rest would be stale until the edit lands.
      gizmoGroup.visible = d.kind === 'height' || d.kind === 'edge-size';
      helperGroup.visible = d.kind === 'edge-size';
      if (d.kind === 'height') gizmoGroup.children.forEach((c) => (c.visible = c === heightArrowRef.current));
      setHoverEdge(null);
      if (d.kind === 'wall') setFastId(d.bodyId ?? null);
      live.current.onDragStateChange?.(true);
      invalidate(true);
    };

    const startGizmoDrag = (hit: Extract<Hit, { type: 'gizmo' }>, e: PointerEvent): Drag | null => {
      const common = { startClientY: e.clientY, mmPerPixel: mmPerPixel() };
      const body = bodyOf(hit.bodyId);
      switch (hit.gizmo) {
        case 'extrude-height':
          return body ? { ...common, kind: 'height', bodyId: body.id, initialHeight: body.extrusionHeight, nextHeight: body.extrusionHeight } : null;
        case 'offset-wall': {
          const ends = body && hit.index !== undefined ? wallEnds(body, hit.index) : null;
          if (!body || !ends) return null;
          const planeY = (body.elevation ?? 0) + body.extrusionHeight / 2;
          return {
            ...common,
            kind: 'wall',
            bodyId: body.id,
            index: hit.index,
            initialBase: getBase(body).map((p) => ({ ...p })),
            normal: outwardNormal(ends.a, ends.b, ends.winding),
            planeY,
            startPoint: intersectPlane(e.clientX, e.clientY, planeY) ?? undefined,
          };
        }
        case 'edge-size': {
          const sels = live.current.selectedEdges;
          const first = sels[0] && bodyOf(sels[0].bodyId);
          return first ? { ...common, kind: 'edge-size', sels, initialSize: edgeSize(first, sels[0]) } : null;
        }
        default: {
          const ids = live.current.selectedBodyIds;
          const bounds = selectionBounds(ids.map((i) => bodyOf(i)).filter((b): b is Body3D => !!b));
          if (!bounds) return null;
          const planeY = bounds.minElevation + 0.3;
          const p = intersectPlane(e.clientX, e.clientY, planeY);
          if (!p) return null;
          const center = { x: bounds.centerX, y: bounds.centerY };
          return { ...common, kind: 'rotate', ids, center, planeY, a0: Math.atan2(-p.z - center.y, p.x - center.x), angle: 0 };
        }
      }
    };

    const startMoveDrag = (bodyId: string, point: THREE.Vector3, e: { clientY: number }): Drag | null => {
      const ids = movingSet(bodyId);
      const bounds = selectionBounds(ids.map((i) => bodyOf(i)).filter((b): b is Body3D => !!b));
      if (!bounds) return null;
      if (!live.current.selectedBodyIds.includes(bodyId)) live.current.onSelectBody(bodyId);
      return {
        kind: 'move',
        startClientY: e.clientY,
        mmPerPixel: mmPerPixel(),
        ids,
        center: { x: bounds.centerX, y: bounds.centerY },
        planeY: point.y,
        startPoint: point,
        dx: 0,
        dy: 0,
      };
    };

    const applyDrag = (d: Drag, m: { x: number; y: number; shift: boolean }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      let text = '';
      lowerQualityWhileBusy();

      if (d.kind === 'height') {
        const next = clamp(Math.round(d.initialHeight! + (d.startClientY - m.y) * d.mmPerPixel), 2, 600);
        d.nextHeight = next;
        // Preview by stretching the existing mesh; the exact geometry is rebuilt on release.
        const body = bodyOf(d.bodyId);
        const entry = entriesRef.current.get(d.bodyId!);
        if (body && entry) {
          const s = next / d.initialHeight!;
          const elev = body.elevation ?? 0;
          entry.group.scale.y = s;
          entry.group.position.y = elev * (1 - s);
          heightArrowRef.current?.position.setY(elev + next + 0.2);
        }
        text = `Height ${next} mm`;
      } else if (d.kind === 'edge-size') {
        const raw = d.initialSize! + (d.startClientY - m.y) * d.mmPerPixel * 0.35;
        const next = clamp(Math.round(raw * 2) / 2, 0, 30);
        live.current.onEdgeChange(d.sels!, { size: next });
        text = next > 0 ? `Size ${next} mm` : 'No bevel';
      } else if (d.kind === 'wall') {
        const body = bodyOf(d.bodyId);
        const cur = intersectPlane(m.x, m.y, d.planeY!);
        if (!body || !cur || !d.normal || !d.startPoint) return;
        const n = d.normal;
        const dist = Math.round((cur.x - d.startPoint.x) * n.x - (cur.z - d.startPoint.z) * n.y);
        const base = d.initialBase!.map((p) => ({ ...p }));
        [d.index!, (d.index! + 1) % base.length].forEach((i) => {
          base[i] = { x: Math.round(base[i].x + n.x * dist), y: Math.round(base[i].y + n.y * dist) };
        });
        live.current.onUpdateBody(body.id, withOutline(body, { basePoints: base }));
        text = `Wall ${signed(dist)} mm`;
      } else if (d.kind === 'move') {
        const cur = intersectPlane(m.x, m.y, d.planeY!);
        if (!cur) return;
        let dx = Math.round(cur.x - d.startPoint!.x);
        let dy = Math.round(-(cur.z - d.startPoint!.z));
        if (m.shift) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        d.dx = dx;
        d.dy = dy;
        // A pure transform of the existing meshes: no geometry is rebuilt while dragging.
        d.ids!.forEach((id) => entriesRef.current.get(id)?.group.position.set(dx, 0, -dy));
        text = `X ${signed(dx)}, Y ${signed(dy)} mm`;
      } else if (d.kind === 'rotate') {
        const cur = intersectPlane(m.x, m.y, d.planeY!);
        if (!cur) return;
        let delta = Math.atan2(-cur.z - d.center!.y, cur.x - d.center!.x) - d.a0!;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        const step = m.shift ? 15 : 1;
        const deg = Math.round((delta * 180) / Math.PI / step) * step;
        const angle = (deg * Math.PI) / 180;
        d.angle = angle;
        const pivot = new THREE.Vector3(d.center!.x, 0, -d.center!.y);
        const shift = pivot.clone().sub(pivot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
        d.ids!.forEach((id) => {
          const group = entriesRef.current.get(id)?.group;
          if (group) {
            group.rotation.y = angle;
            group.position.copy(shift);
          }
        });
        text = `Rotate ${deg}°`;
      }
      setDragLabel({ text, x: m.x - rect.left + 16, y: m.y - rect.top - 28 });
      invalidate(d.kind === 'move' || d.kind === 'rotate' || d.kind === 'height');
    };

    const endDrag = () => {
      const d = drag;
      if (!d) return;
      drag = null;
      controls.enabled = true;
      setDragLabel(null);

      // Commit the previewed change in one update.
      if (d.kind === 'move' && (d.dx || d.dy)) {
        live.current.onTransformBodies(d.ids!, { dx: d.dx!, dy: d.dy!, dz: 0, angle: 0, cx: d.center!.x, cy: d.center!.y });
      } else if (d.kind === 'rotate' && d.angle) {
        live.current.onTransformBodies(d.ids!, { dx: 0, dy: 0, dz: 0, angle: d.angle, cx: d.center!.x, cy: d.center!.y });
      } else if (d.kind === 'height' && d.nextHeight !== d.initialHeight) {
        live.current.onUpdateBody(d.bodyId!, { extrusionHeight: d.nextHeight! });
      } else {
        resetPreviews();
      }
      setFastId(null);
      restoreGizmos();
      live.current.onDragStateChange?.(false);
      invalidate(true);
    };

    const cancelDrag = () => {
      if (!drag) return;
      drag = null;
      resetPreviews();
      controls.enabled = true;
      setDragLabel(null);
      restoreGizmos();
      setFastId(null);
      live.current.onDragStateChange?.(false);
      invalidate(true);
    };

    // ---- Pointer pipeline -------------------------------------------------
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

    const onPointerDown = (e: PointerEvent) => {
      // A second finger means the user wants to orbit/pinch: abandon any one-finger drag.
      if (!e.isPrimary) {
        cancelDrag();
        candidate = null;
        return;
      }
      if (e.button !== 0) return;
      const drawing = live.current.repeatConfig.isDrawingLine;
      const hit = drawing ? null : resolveHit(e.clientX, e.clientY);
      candidate = { x: e.clientX, y: e.clientY, hit, pointerId: e.pointerId };
      if (drawing || !hit) return; // empty space: let OrbitControls take it

      if (hit.type === 'gizmo') {
        const d = startGizmoDrag(hit, e);
        if (d) {
          beginDrag(d, e.pointerId);
          applyDrag(d, { x: e.clientX, y: e.clientY, shift: e.shiftKey });
          candidate = null;
          return;
        }
      }
      // Pressing on a shape never orbits: it either selects it or starts moving it.
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag || candidate) pending = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
      else if (e.pointerType === 'mouse' && e.buttons === 0) pendingHover = { x: e.clientX, y: e.clientY };
    };

    const processMove = (m: { x: number; y: number; shift: boolean }) => {
      if (drag) {
        applyDrag(drag, m);
        return;
      }
      if (!candidate?.hit || candidate.hit.type === 'gizmo') return;
      if (Math.hypot(m.x - candidate.x, m.y - candidate.y) <= CLICK_SLOP_PX) return;
      const hit = candidate.hit;
      const bodyId = hit.type === 'body' ? hit.bodyId : hit.sel.bodyId;
      // For an edge, the move still grabs the body: use the pointer ray's ground hit as the anchor.
      const start = hit.type === 'body' ? hit.point : (() => {
        const body = bodyOf(bodyId);
        return intersectPlane(candidate!.x, candidate!.y, (body?.elevation ?? 0) + (body?.extrusionHeight ?? 0)) ?? new THREE.Vector3();
      })();
      const pointerId = candidate.pointerId;
      const d = startMoveDrag(bodyId, start, { clientY: candidate.y });
      candidate = null;
      if (d) {
        beginDrag(d, pointerId);
        applyDrag(d, m);
      }
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      if (!e.isPrimary) return;
      if (pending) {
        const m = pending;
        pending = null;
        processMove(m);
      }
      const hadDrag = !!drag;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (hadDrag) {
        if (cancelled) cancelDrag();
        else endDrag();
        candidate = null;
        return;
      }
      const down = candidate;
      candidate = null;
      controls.enabled = true;
      if (cancelled || !down || down.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return; // it was an orbit/pan

      if (live.current.repeatConfig.isDrawingLine) {
        handleRepeatClick(e.clientX, e.clientY);
        return;
      }

      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      const hit = down.hit;
      if (!hit) {
        live.current.onSelectBody(null);
      } else if (hit.type === 'edge') {
        const current = live.current.selectedEdges;
        const sameBody = current.length > 0 && current[0].bodyId === hit.sel.bodyId;
        const already = current.some((s) => edgeKey(s) === edgeKey(hit.sel));
        live.current.onSelectBody(hit.sel.bodyId);
        live.current.onSelectEdges(
          multi && sameBody ? (already ? current.filter((s) => edgeKey(s) !== edgeKey(hit.sel)) : [...current, hit.sel]) : [hit.sel]
        );
      } else if (hit.type === 'body') {
        live.current.onSelectBody(hit.bodyId, multi);
      }
    };
    const onPointerUp = (e: PointerEvent) => finishPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => finishPointer(e, true);
    const onPointerLeave = () => {
      pendingHover = null;
      clearHoverRef.current();
    };

    // Registered in the capture phase, ahead of OrbitControls, so a press on a shape can keep it from orbiting.
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
    controls.addEventListener('change', () => {
      invalidate();
      lowerQualityWhileBusy();
    });

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
      invalidate();
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
      invalidate();
    });
    resizeObserver.observe(container);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);

      // Input is applied once per frame, however fast the pointer reports.
      if (pending) {
        const m = pending;
        pending = null;
        processMove(m);
      }
      if (pendingHover && !drag && !candidate) {
        const h = pendingHover;
        pendingHover = null;
        hover(h.x, h.y);
      }

      const tween = tweenRef.current;
      if (tween) {
        const t = clamp((performance.now() - tween.start) / 450, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, ease);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease);
        if (t >= 1) tweenRef.current = null;
        needsRender = true;
      }
      const moved = controls.update();
      if (!moved && !needsRender) return; // nothing changed: skip the frame entirely

      if (shadowsDirty) {
        renderer.shadowMap.needsUpdate = true;
        shadowsDirty = false;
      }
      needsRender = false;
      renderer.render(scene, camera);
    };
    animate();
    setIsSceneReady(true);

    return () => {
      setIsSceneReady(false);
      cancelAnimationFrame(raf);
      window.clearTimeout(qualityTimer);
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

  // ---- Sync solids with the document -------------------------------------
  // Layout effect so a rebuilt mesh replaces the previewed one before the next paint.
  useLayoutEffect(() => {
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
      const existing = entries.get(id);
      const fast = id === fastId;
      if (existing?.body === body && existing.signature.endsWith('|fast') === fast) return; // untouched object
      const signature = bodySignature(body) + (fast ? '|fast' : '');
      if (existing && existing.signature === signature) {
        existing.body = body;
        return;
      }
      if (existing) {
        group.remove(existing.group);
        disposeObject(existing.group);
        entries.delete(id);
      }

      const geometry = buildBodyGeometry(body, { fast });
      if (!geometry) return;
      const mesh = new THREE.Mesh(geometry, createMaterial(body));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const outline = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(outlineSegments(body), 3)),
        new THREE.LineBasicMaterial({ color: ACCENT, transparent: true })
      );
      outline.visible = false;

      const bodyGroup = new THREE.Group();
      bodyGroup.userData.bodyId = id;
      bodyGroup.add(mesh, outline);
      group.add(bodyGroup);
      entries.set(id, { body, group: bodyGroup, outline, signature });
    });
    refreshOutlinesRef.current();
    invalidateRef.current(true);
  }, [bodies, isSceneReady, fastId]);

  useEffect(() => {
    refreshOutlinesRef.current();
  }, [selectedBodyId, selectedBodyIds, isSceneReady]);

  // ---- Handles for what is selected ---------------------------------------
  useLayoutEffect(() => {
    const gizmoGroup = gizmoGroupRef.current;
    const helperGroup = helperGroupRef.current;
    if (!isSceneReady || !gizmoGroup || !helperGroup) return;
    clearGroup(gizmoGroup);
    clearGroup(helperGroup);
    heightArrowRef.current = null;

    const ids = selectedBodyIds.length ? selectedBodyIds : selectedBodyId ? [selectedBodyId] : [];
    const picked = ids.map((id) => bodies.find((b) => b.id === id)).filter((b): b is Body3D => !!b && b.visible);
    if (!picked.length) {
      invalidateRef.current();
      return;
    }
    const bounds = selectionBounds(picked)!;
    const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    const s = clamp(extent / 170, 0.7, 2.4);

    // Rotation halo around the selection, on the ground it stands on.
    const radius = 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 12;
    const ring = new THREE.Group();
    ring.position.set(bounds.centerX, bounds.minElevation + 0.3, -bounds.centerY);
    ring.userData = { gizmo: 'rotate' };
    const ringLine = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.8, 6, 96).rotateX(Math.PI / 2), handleMaterial('#d4d9e6', 0.55, true));
    ringLine.renderOrder = 28;
    const ringHit = new THREE.Mesh(new THREE.TorusGeometry(radius, 6, 5, 48).rotateX(Math.PI / 2), hiddenMaterial);
    ring.add(ringLine, ringHit);
    gizmoGroup.add(ring);

    const body = picked.length === 1 ? picked[0] : null;
    if (body) {
      const elev = body.elevation ?? 0;
      const top = elev + body.extrusionHeight;
      const topY = top + 0.2;

      // Arrow on the top face: height.
      const anchor = getInteriorAnchor(body);
      const arrow = new THREE.Group();
      arrow.position.set(anchor.x, topY, -anchor.y);
      arrow.scale.setScalar(s);
      arrow.userData = { gizmo: 'extrude-height', bodyId: body.id };
      const mat = handleMaterial('#ffffff');
      const arrowRing = new THREE.Mesh(shared(new THREE.RingGeometry(4.5, 6.5, 40).rotateX(-Math.PI / 2)), mat);
      const shaft = new THREE.Mesh(HANDLE.shaft, mat);
      shaft.position.y = 9;
      const head = new THREE.Mesh(HANDLE.head, mat);
      head.position.y = 22.5;
      arrowRing.renderOrder = shaft.renderOrder = head.renderOrder = 30;
      const hit = new THREE.Mesh(HANDLE.arrowHit, hiddenMaterial);
      hit.position.y = 16;
      arrow.add(arrowRing, shaft, head, hit);
      gizmoGroup.add(arrow);
      heightArrowRef.current = arrow;

      // A dot at the middle of each wall: push or pull it.
      const base = getBase(body);
      if (base.length <= MAX_WALL_HANDLES) {
        for (let j = 0; j < base.length; j++) {
          const ends = wallEnds(body, j);
          if (!ends) continue;
          const len = Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y);
          if (len < 14) continue;
          const n = outwardNormal(ends.a, ends.b, ends.winding);
          const dot = new THREE.Group();
          dot.position.set((ends.a.x + ends.b.x) / 2 + n.x * 6 * s, topY, -((ends.a.y + ends.b.y) / 2 + n.y * 6 * s));
          dot.userData = { gizmo: 'offset-wall', bodyId: body.id, index: j };
          const knob = new THREE.Mesh(HANDLE.dot, handleMaterial('#ffffff'));
          knob.scale.setScalar(2.6 * s);
          knob.renderOrder = 30;
          const knobHit = new THREE.Mesh(HANDLE.dot, hiddenMaterial);
          knobHit.scale.setScalar(7 * s);
          dot.add(knob, knobHit);
          gizmoGroup.add(dot);
        }
      }

      // The selected edges, and a handle to size their bevel.
      const chosen = selectedEdges
        .map((sel) => {
          const edge = sel.bodyId === body.id ? listEdges(body).find((e) => e.kind === sel.kind && e.index === sel.index) : undefined;
          return edge ? edge : null;
        })
        .filter((e): e is EdgePath => !!e);
      chosen.forEach((edge) => helperGroup.add(makeFatLine(edge.points, WARN, 4.5)));

      if (chosen.length) {
        const edge = chosen[0];
        const mi = Math.floor(edge.points.length / 2);
        const mid = edge.points[mi];
        const prev = edge.points[Math.max(0, mi - 1)];
        const next = edge.points[Math.min(edge.points.length - 1, mi + 1)];
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
        const knob = new THREE.Mesh(HANDLE.dot, handleMaterial(WARN));
        knob.scale.setScalar(3.6 * s);
        knob.renderOrder = 32;
        const knobHit = new THREE.Mesh(HANDLE.dot, hiddenMaterial);
        knobHit.scale.setScalar(9 * s);
        handle.add(knob, knobHit);
        gizmoGroup.add(handle);
      }
    }
    invalidateRef.current();
  }, [bodies, selectedBodyId, selectedBodyIds, selectedEdges, isSceneReady]);

  // ---- Pattern path preview ----------------------------------------------
  useEffect(() => {
    const group = previewGroupRef.current;
    if (!isSceneReady || !group) return;
    clearGroup(group);

    const { startPoint, endPoint, controlPoint, type, isDrawingLine, drawingStep } = repeatConfig;
    if (isDrawingLine || drawingStep === 'done') {
      const toWorld = (p: Point2D) => new THREE.Vector3(p.x, 0.6, -p.y);
      const markerMat = shared(new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }));
      [startPoint, controlPoint, endPoint].forEach((p) => {
        if (!p) return;
        const m = new THREE.Mesh(HANDLE.dot, markerMat);
        m.scale.setScalar(3.2);
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
    }
    invalidateRef.current();
  }, [repeatConfig, isSceneReady]);

  // The idle hint depends on selection; hover text takes over while the pointer is over something.
  useEffect(() => {
    clearHoverRef.current();
    onHint?.(
      repeatConfig.isDrawingLine
        ? 'Click the ground or a corner to place the pattern path'
        : selectedBodyIds.length
          ? 'Drag the shape to move it · arrow = height · dots = walls · ring = rotate · click an edge to bevel it'
          : 'Click a shape to select it · drag empty space to orbit'
    );
  }, [selectedBodyIds, repeatConfig.isDrawingLine, onHint]);

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
    </div>
  );
}
