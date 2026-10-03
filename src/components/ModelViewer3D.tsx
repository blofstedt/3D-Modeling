/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Body3D, CadTool, MATERIAL_PRESETS, Point2D, RepeatConfig } from '../types';
import { buildBodyGeometry, buildBodyShape, getInteriorAnchor } from '../utils/bodyGeometry';
import ViewCube, { CubeFace } from './ViewCube';
import DimensionBadge from './DimensionBadge';

export interface EditPart {
  bodyId: string;
  type: 'corner' | 'edge' | 'face' | 'gizmo';
  index?: number;
  startIndex?: number;
  endIndex?: number;
  faceType?: 'top' | 'bottom' | 'side';
}

type GizmoKind = 'extrude-height' | 'offset-wall' | 'fillet' | 'vertex';

type Hit =
  | { type: 'gizmo'; gizmo: GizmoKind; bodyId: string; index?: number; startIndex?: number; endIndex?: number }
  | { type: 'face'; faceType: 'top' | 'bottom'; bodyId: string }
  | { type: 'edge'; bodyId: string; startIndex: number; endIndex: number };

interface DragState {
  kind: 'face-height' | 'wall-offset' | 'fillet' | 'vertex';
  bodyId: string;
  startClientY: number;
  initialPoints: Point2D[];
  initialBasePoints?: Point2D[];
  initialHeight: number;
  initialBevelSize: number;
  mmPerPixel: number;
  planeY: number;
  startPlanePoint?: THREE.Vector3;
  cornerIndex?: number;
  edgeStart?: number;
  edgeEnd?: number;
  normal?: Point2D;
}

export interface ModelViewer3DProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  repeatConfig: RepeatConfig;
  onUpdateRepeatConfig: React.Dispatch<React.SetStateAction<RepeatConfig>>;
  activeCadTool: CadTool;
  activeEditPart: EditPart | null;
  setActiveEditPart: (part: EditPart | null) => void;
  onOpenCut: () => void;
  onOpenBevel: () => void;
  onDeleteBody: (id: string) => void;
  onSwitchToSketchOnFace: () => void;
  /** Fired when a handle drag starts/ends so the app can treat it as a single undo step. */
  onDragStateChange?: (dragging: boolean) => void;
}

const ACCENT = '#8b7cf6';
const BACKGROUND = '#08090d';
const CLICK_SLOP_PX = 5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const o = obj as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
    else m?.dispose();
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
    b.holes,
    b.extrusionHeight,
    b.bevelEnabled,
    b.bevelSize,
    b.bevelSegments,
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
  repeatConfig,
  onUpdateRepeatConfig,
  activeCadTool,
  activeEditPart,
  setActiveEditPart,
  onOpenCut,
  onOpenBevel,
  onDeleteBody,
  onSwitchToSketchOnFace,
  onDragStateChange,
}: ModelViewer3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [isSceneReady, setIsSceneReady] = useState(false);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const bodyGroupRef = useRef<THREE.Group | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const previewGroupRef = useRef<THREE.Group | null>(null);
  const entriesRef = useRef<Map<string, BodyEntry>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const tweenRef = useRef<{
    start: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);
  const frameViewRef = useRef<(face: CubeFace, instant?: boolean) => void>(() => {});

  // Latest props for long-lived event handlers
  const live = useRef({
    bodies,
    selectedBodyId,
    activeCadTool,
    activeEditPart,
    repeatConfig,
    onSelectBody,
    onUpdateBody,
    onUpdateRepeatConfig,
    setActiveEditPart,
    onDragStateChange,
  });
  live.current = {
    bodies,
    selectedBodyId,
    activeCadTool,
    activeEditPart,
    repeatConfig,
    onSelectBody,
    onUpdateBody,
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

    // Ground: soft shadow catcher + grid + axes
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
    const gizmoGroup = new THREE.Group();
    const helperGroup = new THREE.Group();
    const previewGroup = new THREE.Group();
    scene.add(bodyGroup, gizmoGroup, helperGroup, previewGroup);
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

    // ---- Hit testing: gizmo handles first, then solids --------------------
    const resolveHit = (clientX: number, clientY: number): Hit | null => {
      setRay(clientX, clientY);

      if (gizmoGroup.children.length) {
        const gizmoHit = raycaster.intersectObjects(gizmoGroup.children, true)[0];
        if (gizmoHit) {
          let obj: THREE.Object3D | null = gizmoHit.object;
          while (obj && !obj.userData.gizmo) obj = obj.parent;
          if (obj) {
            const d = obj.userData;
            return {
              type: 'gizmo',
              gizmo: d.gizmo,
              bodyId: d.bodyId,
              index: d.index,
              startIndex: d.startIndex,
              endIndex: d.endIndex,
            };
          }
        }
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

      const hx = hit.point.x;
      const hy = -hit.point.z;
      const pts = body.points;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const d = distanceToSegment(hx, hy, p1.x, p1.y, p2.x, p2.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return { type: 'edge', bodyId, startIndex: best, endIndex: (best + 1) % pts.length };
    };

    // ---- Drag sessions ----------------------------------------------------
    const mmPerPixel = () => {
      const dist = camera.position.distanceTo(controls.target);
      return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (renderer.domElement.clientHeight || 1);
    };

    const startDrag = (hit: Hit, clientX: number, clientY: number): DragState | null => {
      const body = live.current.bodies.find((b) => b.id === hit.bodyId);
      if (!body) return null;
      const base = {
        bodyId: body.id,
        startClientY: clientY,
        initialPoints: body.points.map((p) => ({ ...p })),
        initialBasePoints: body.basePoints?.map((p) => ({ ...p })),
        initialHeight: body.extrusionHeight,
        initialBevelSize: body.bevelSize ?? 1,
        mmPerPixel: mmPerPixel(),
        planeY: body.extrusionHeight,
      };

      const isHeightDrag =
        (hit.type === 'gizmo' && hit.gizmo === 'extrude-height') ||
        (hit.type === 'face' && hit.faceType === 'top');
      if (isHeightDrag) return { ...base, kind: 'face-height' };

      if (hit.type !== 'gizmo') return null;

      if (hit.gizmo === 'vertex') {
        return { ...base, kind: 'vertex', cornerIndex: hit.index };
      }
      if (hit.gizmo === 'fillet') {
        return { ...base, kind: 'fillet', initialBevelSize: body.bevelSize ?? 2 };
      }
      if (hit.gizmo === 'offset-wall' && hit.startIndex !== undefined && hit.endIndex !== undefined) {
        const p1 = body.points[hit.startIndex];
        const p2 = body.points[hit.endIndex];
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const planeY = body.extrusionHeight / 2;
        return {
          ...base,
          kind: 'wall-offset',
          planeY,
          startPlanePoint: intersectPlane(clientX, clientY, planeY) ?? undefined,
          edgeStart: hit.startIndex,
          edgeEnd: hit.endIndex,
          normal: { x: -(p2.y - p1.y) / len, y: (p2.x - p1.x) / len },
        };
      }
      return null;
    };

    /** Writes edited outline points, keeping the un-rounded base outline consistent. */
    const commitPoints = (drag: DragState, edit: (pts: Point2D[]) => Point2D[]) => {
      const points = edit(drag.initialPoints.map((p) => ({ ...p })));
      const base = drag.initialBasePoints;
      if (base && base.length === drag.initialPoints.length) {
        live.current.onUpdateBody(drag.bodyId, { points, basePoints: edit(base.map((p) => ({ ...p }))) });
      } else {
        // Corner rounding has added vertices; bake the edit into the outline.
        live.current.onUpdateBody(drag.bodyId, { points, basePoints: points, cornerRadius: 0 });
      }
    };

    const applyDrag = (drag: DragState, clientX: number, clientY: number) => {
      if (drag.kind === 'face-height') {
        const raw = drag.initialHeight + (drag.startClientY - clientY) * drag.mmPerPixel;
        const next = clamp(Math.round(raw), 2, 600);
        setDragDelta(next - drag.initialHeight);
        live.current.onUpdateBody(drag.bodyId, { extrusionHeight: next });
      } else if (drag.kind === 'fillet') {
        const raw = drag.initialBevelSize + (drag.startClientY - clientY) * 0.1;
        const next = clamp(Math.round(raw * 2) / 2, 0, 20);
        setDragDelta(Math.round((next - drag.initialBevelSize) * 10) / 10);
        live.current.onUpdateBody(drag.bodyId, { bevelSize: next, bevelEnabled: next > 0 });
      } else if (drag.kind === 'wall-offset' && drag.normal && drag.startPlanePoint) {
        const current = intersectPlane(clientX, clientY, drag.planeY);
        if (!current) return;
        const dist = Math.round(
          (current.x - drag.startPlanePoint.x) * drag.normal.x - (current.z - drag.startPlanePoint.z) * drag.normal.y
        );
        setDragDelta(dist);
        const { edgeStart, edgeEnd, normal } = drag;
        commitPoints(drag, (pts) => {
          [edgeStart!, edgeEnd!].forEach((i) => {
            pts[i] = { x: Math.round(pts[i].x + normal.x * dist), y: Math.round(pts[i].y + normal.y * dist) };
          });
          return pts;
        });
      } else if (drag.kind === 'vertex' && drag.cornerIndex !== undefined) {
        const current = intersectPlane(clientX, clientY, drag.planeY);
        if (!current) return;
        const snapped = { x: Math.round(current.x / 5) * 5, y: Math.round(-current.z / 5) * 5 };
        commitPoints(drag, (pts) => {
          pts[drag.cornerIndex!] = snapped;
          return pts;
        });
      }
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

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      pressed = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      if (live.current.repeatConfig.isDrawingLine) return;

      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) return;

      const toolDragsFaces = live.current.activeCadTool === 'extrude' || live.current.activeCadTool === 'moveFace';
      if (hit.type !== 'gizmo' && !(hit.type === 'face' && hit.faceType === 'top' && toolDragsFaces)) return;

      const drag = startDrag(hit, e.clientX, e.clientY);
      if (!drag) return;

      // Take the gesture away from OrbitControls before it starts.
      controls.enabled = false;
      dragRef.current = drag;
      renderer.domElement.setPointerCapture(e.pointerId);
      live.current.onSelectBody(drag.bodyId);
      if (hit.type === 'gizmo' && hit.gizmo === 'vertex') {
        live.current.setActiveEditPart({ bodyId: drag.bodyId, type: 'corner', index: hit.index });
      } else if (drag.kind === 'wall-offset' || drag.kind === 'fillet') {
        live.current.setActiveEditPart({
          bodyId: drag.bodyId,
          type: 'edge',
          startIndex: hit.type === 'gizmo' ? hit.startIndex : undefined,
          endIndex: hit.type === 'gizmo' ? hit.endIndex : undefined,
        });
      } else {
        live.current.setActiveEditPart({ bodyId: drag.bodyId, type: 'face', faceType: 'top' });
      }
      live.current.onDragStateChange?.(true);
      setIsDragging(true);
      setDragDelta(0);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        applyDrag(drag, e.clientX, e.clientY);
        return;
      }
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
      const hit = resolveHit(e.clientX, e.clientY);
      renderer.domElement.style.cursor =
        hit?.type === 'gizmo' ? 'grab' : hit ? 'pointer' : live.current.repeatConfig.isDrawingLine ? 'crosshair' : 'default';
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      if (dragRef.current) {
        dragRef.current = null;
        controls.enabled = true;
        live.current.onDragStateChange?.(false);
        setIsDragging(false);
        setDragDelta(0);
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

      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) {
        live.current.onSelectBody(null);
        live.current.setActiveEditPart(null);
        return;
      }
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      live.current.onSelectBody(hit.bodyId, multi);
      if (multi) return;
      if (hit.type === 'face') {
        live.current.setActiveEditPart({ bodyId: hit.bodyId, type: 'face', faceType: hit.faceType });
      } else if (hit.type === 'edge') {
        live.current.setActiveEditPart({
          bodyId: hit.bodyId,
          type: 'edge',
          startIndex: hit.startIndex,
          endIndex: hit.endIndex,
        });
      }
    };
    const onPointerUp = (e: PointerEvent) => finishPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => finishPointer(e, true);

    // Registered in the capture phase, ahead of OrbitControls, so a gizmo grab can disable it.
    renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minDistance = 20;
    controls.maxDistance = 2500;
    controlsRef.current = controls;

    // ---- Camera framing ---------------------------------------------------
    const frameView = (face: CubeFace, instant = false) => {
      const box = new THREE.Box3();
      let any = false;
      live.current.bodies.forEach((b) => {
        if (!b.visible) return;
        any = true;
        b.points.forEach((p) => {
          box.expandByPoint(new THREE.Vector3(p.x, 0, -p.y));
          box.expandByPoint(new THREE.Vector3(p.x, b.extrusionHeight, -p.y));
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
      controls.dispose();
      entriesRef.current.clear();
      [bodyGroup, gizmoGroup, helperGroup, previewGroup].forEach(clearGroup);
      [shadowCatcher, grid, axisX, axisY].forEach(disposeObject);
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      cameraRef.current = null;
      controlsRef.current = null;
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
        new THREE.EdgesGeometry(geometry, 28),
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

  // ---- Gizmos & face/edge highlights for the primary selection ------------
  useEffect(() => {
    const gizmoGroup = gizmoGroupRef.current;
    const helperGroup = helperGroupRef.current;
    if (!isSceneReady || !gizmoGroup || !helperGroup) return;
    clearGroup(gizmoGroup);
    clearGroup(helperGroup);

    const body = bodies.find((b) => b.id === selectedBodyId);
    if (!body || !body.visible || body.points.length < 3) return;
    if (selectedBodyIds.length > 1) return;

    const { points, extrusionHeight: height } = body;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const s = clamp(extent / 170, 0.7, 2.4);
    const topY = height + 0.2;

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
    const handleMaterial = (color = '#ffffff') =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });

    const part = activeEditPart?.bodyId === body.id ? activeEditPart : null;
    const edgeActive = part?.type === 'edge' && part.startIndex !== undefined && part.endIndex !== undefined;
    const faceActive = !edgeActive;
    const showVertices = activeCadTool === 'moveFace' || part?.type === 'corner' || edgeActive;

    // Top-face highlight
    if (faceActive) {
      const shape = buildBodyShape(body);
      if (shape) {
        const overlay = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), overlayMaterial(0.2));
        overlay.position.y = topY;
        overlay.renderOrder = 10;
        helperGroup.add(overlay);
      }
    }

    // Vertex handles (top corners)
    if (showVertices) {
      const sphere = new THREE.SphereGeometry(2.4 * s, 16, 12);
      points.forEach((pt, i) => {
        const active = part?.type === 'corner' && part.index === i;
        const node = new THREE.Mesh(sphere, handleMaterial(active ? ACCENT : '#ffffff'));
        node.position.set(pt.x, topY, -pt.y);
        node.renderOrder = 30;
        node.userData = { gizmo: 'vertex', bodyId: body.id, index: i };
        gizmoGroup.add(node);
      });
    }

    // Push-pull arrow on the top face
    if (faceActive) {
      const anchor = getInteriorAnchor(body);
      const arrow = new THREE.Group();
      arrow.position.set(anchor.x, topY, -anchor.y);
      arrow.scale.setScalar(s);
      arrow.userData = { gizmo: 'extrude-height', bodyId: body.id };

      const ringMat = handleMaterial(ACCENT);
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6.5, 40).rotateX(-Math.PI / 2), ringMat);
      ring.renderOrder = 30;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 18, 12), ringMat);
      shaft.position.y = 9;
      shaft.renderOrder = 31;
      const head = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 20), ringMat);
      head.position.y = 22.5;
      head.renderOrder = 31;
      const hitbox = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 11, 40, 12),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.y = 16;
      arrow.add(ring, shaft, head, hitbox);
      gizmoGroup.add(arrow);
    }

    // Wall highlight + offset arrow + fillet handle for a selected edge
    if (edgeActive) {
      const i1 = part!.startIndex!;
      const i2 = part!.endIndex!;
      const p1 = points[i1];
      const p2 = points[i2];
      if (p1 && p2) {
        const wall = new THREE.BufferGeometry();
        wall.setAttribute(
          'position',
          new THREE.BufferAttribute(
            new Float32Array([
              p1.x, 0, -p1.y, p2.x, 0, -p2.y, p2.x, height, -p2.y,
              p1.x, 0, -p1.y, p2.x, height, -p2.y, p1.x, height, -p1.y,
            ]),
            3
          )
        );
        const wallMesh = new THREE.Mesh(wall, overlayMaterial(0.28));
        wallMesh.renderOrder = 10;
        helperGroup.add(wallMesh);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        // World-space outward normal of the wall (2D normal is (-dy, dx); world z is -y)
        const dir = new THREE.Vector3(-(p2.y - p1.y) / len, 0, -(p2.x - p1.x) / len);

        const offset = new THREE.Group();
        offset.position.set(midX, height / 2, -midY);
        offset.userData = { gizmo: 'offset-wall', bodyId: body.id, startIndex: i1, endIndex: i2 };
        const helper = new THREE.ArrowHelper(dir, new THREE.Vector3(), 26 * s, ACCENT, 9 * s, 5 * s);
        (helper.line.material as THREE.Material).depthTest = false;
        (helper.cone.material as THREE.Material).depthTest = false;
        helper.line.renderOrder = helper.cone.renderOrder = 31;
        const hit = new THREE.Mesh(new THREE.SphereGeometry(12 * s, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.copy(dir.clone().multiplyScalar(14 * s));
        offset.add(helper, hit);
        gizmoGroup.add(offset);

        const fillet = new THREE.Group();
        fillet.position.set(midX, height + 1, -midY);
        fillet.userData = { gizmo: 'fillet', bodyId: body.id, startIndex: i1, endIndex: i2 };
        const arc = new THREE.Mesh(new THREE.TorusGeometry(5 * s, 1.3 * s, 8, 20, Math.PI), handleMaterial('#ffffff'));
        arc.rotation.x = -Math.PI / 2;
        arc.renderOrder = 31;
        const arcHit = new THREE.Mesh(new THREE.SphereGeometry(10 * s, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
        fillet.add(arc, arcHit);
        gizmoGroup.add(fillet);
      }
    }
  }, [activeEditPart, activeCadTool, bodies, selectedBodyId, selectedBodyIds, isSceneReady]);

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

  const handleSelectCameraAngle = useCallback((face: CubeFace) => frameViewRef.current(face), []);

  const selectedBody = bodies.find((b) => b.id === selectedBodyId) || null;

  return (
    <div className="absolute inset-0 select-none touch-none overflow-hidden">
      <div ref={mountRef} className="absolute inset-0" />

      <ViewCube
        camera={isSceneReady ? cameraRef.current : null}
        onSelectFace={handleSelectCameraAngle}
        onResetCamera={() => handleSelectCameraAngle('iso')}
      />

      {selectedBody && selectedBodyIds.length <= 1 && (
        <DimensionBadge
          body={selectedBody}
          activeEditPart={activeEditPart}
          isDragging={isDragging}
          dragDelta={dragDelta}
          onUpdateBody={onUpdateBody}
          onOpenCut={onOpenCut}
          onOpenBevel={onOpenBevel}
          onDeleteBody={onDeleteBody}
          onSwitchToSketchOnFace={onSwitchToSketchOnFace}
        />
      )}

      <div className="hidden md:block absolute bottom-3 left-3 text-xs text-slate-500 pointer-events-none">
        Drag to orbit · Right-drag to pan · Scroll to zoom
      </div>
    </div>
  );
}
