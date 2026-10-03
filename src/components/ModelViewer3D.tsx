/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Body3D, MATERIAL_PRESETS, Point2D, RepeatConfig, CadTool } from '../types';
import { calculateLinearPattern, calculateCurvedPattern, cleanPolygonPoints, ensureWinding } from '../utils/geometry';
import ViewCube, { CubeFace } from './ViewCube';
import ShaprDimensionBadge from './ShaprDimensionBadge';
import { 
  Rotate3d, 
  Compass, 
  Layers, 
  RotateCcw, 
  Move3d, 
  ArrowUpDown,
  Scissors,
  Sparkles,
  PenTool,
  Check,
  X
} from 'lucide-react';

export interface EditPart {
  bodyId: string;
  type: 'corner' | 'edge' | 'face' | 'gizmo';
  index?: number; // corner index
  startIndex?: number; // edge start index
  endIndex?: number; // edge end index
  faceType?: 'top' | 'bottom' | 'side';
}

interface DraggingState {
  type: 'face-height' | 'wall-offset' | 'fillet' | 'vertex' | 'body-move';
  bodyId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPlaneIntersection: THREE.Vector3;
  initialPoints: Point2D[];
  initialHeight: number;
  initialBevelSize: number;
  partCornerIndex?: number;
  partEdgeStartIndex?: number;
  partEdgeEndIndex?: number;
  normal2D?: Point2D;
}

function getDistanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return {
    distance: Math.hypot(px - closestX, py - closestY),
    t: t
  };
}

export interface ModelViewer3DProps {
  bodies: Body3D[];
  selectedBodyId: string | null;
  selectedBodyIds?: string[];
  onSelectBody: (id: string | null, isMultiSelect?: boolean) => void;
  onUpdateBody: (id: string, updates: Partial<Body3D>) => void;
  triggerIntroAnimation: boolean;
  onIntroAnimationComplete: () => void;
  repeatConfig?: RepeatConfig;
  onUpdateRepeatConfig?: React.Dispatch<React.SetStateAction<RepeatConfig>>;
  activeCadTool?: CadTool;
  activeEditPart?: EditPart | null;
  setActiveEditPart?: (part: EditPart | null) => void;
  onOpenCut?: () => void;
  onOpenBevel?: () => void;
  onOpenMoveFace?: () => void;
  onDeleteBody?: (id: string) => void;
  onSwitchToSketchOnFace?: () => void;
}

export default function ModelViewer3D({
  bodies,
  selectedBodyId,
  selectedBodyIds,
  onSelectBody,
  onUpdateBody,
  triggerIntroAnimation,
  onIntroAnimationComplete,
  repeatConfig,
  onUpdateRepeatConfig,
  activeCadTool,
  activeEditPart: externalActiveEditPart,
  setActiveEditPart: externalSetActiveEditPart,
  onOpenCut,
  onOpenBevel,
  onOpenMoveFace,
  onDeleteBody,
  onSwitchToSketchOnFace,
}: ModelViewer3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  
  // Active edit state for part highlighting
  const [internalActiveEditPart, setInternalActiveEditPart] = useState<EditPart | null>(null);
  const activeEditPart = externalActiveEditPart !== undefined ? externalActiveEditPart : internalActiveEditPart;
  const setActiveEditPart = (part: EditPart | null) => {
    setInternalActiveEditPart(part);
    if (externalSetActiveEditPart) externalSetActiveEditPart(part);
  };

  // Dragging & live delta state for Shapr3D dimension callout
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0);

  // Refs to share across Three.js animation and event listeners
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const meshesMapRef = useRef<Map<string, { mesh: THREE.Mesh; outline: THREE.LineSegments }>>(new Map());
  const dragSessionRef = useRef<DraggingState | null>(null);
  
  // Smooth Camera glide transition state (for Shapr3D ViewCube)
  const cameraTweenRef = useRef<{
    active: boolean;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    progress: number;
  } | null>(null);

  const [activeCameraAngle, setActiveCameraAngle] = useState<'iso' | 'top' | 'front'>('iso');
  const [isSceneReady, setIsSceneReady] = useState(false);

  // Sync references to prevent stale closures in event listeners
  const bodiesRef = useRef(bodies);
  const selectedBodyIdRef = useRef(selectedBodyId);
  const onUpdateBodyRef = useRef(onUpdateBody);
  const onSelectBodyRef = useRef(onSelectBody);
  const activeEditPartRef = useRef(activeEditPart);
  const repeatConfigRef = useRef(repeatConfig);
  const onUpdateRepeatConfigRef = useRef(onUpdateRepeatConfig);

  useEffect(() => {
    bodiesRef.current = bodies;
    selectedBodyIdRef.current = selectedBodyId;
    onUpdateBodyRef.current = onUpdateBody;
    onSelectBodyRef.current = onSelectBody;
    activeEditPartRef.current = activeEditPart;
    repeatConfigRef.current = repeatConfig;
    onUpdateRepeatConfigRef.current = onUpdateRepeatConfig;
  }, [bodies, selectedBodyId, onUpdateBody, onSelectBody, activeEditPart, repeatConfig, onUpdateRepeatConfig]);

  // Material builder helper
  const createThreeMaterial = (body: Body3D): THREE.Material => {
    const preset = MATERIAL_PRESETS.find((p) => p.id === body.materialType) || MATERIAL_PRESETS[0];
    const colorVal = body.color || preset.color;

    switch (body.materialType) {
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: colorVal,
          roughness: preset.roughness,
          metalness: preset.metalness,
          side: THREE.DoubleSide,
        });
      case 'glossy':
        return new THREE.MeshPhysicalMaterial({
          color: colorVal,
          roughness: preset.roughness,
          metalness: preset.metalness,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: colorVal,
          roughness: preset.roughness,
          metalness: preset.metalness,
          transmission: preset.transmission || 0.8,
          ior: preset.ior || 1.5,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      case 'neon':
        return new THREE.MeshStandardMaterial({
          color: colorVal,
          emissive: colorVal,
          emissiveIntensity: preset.emissiveIntensity || 1.2,
          roughness: preset.roughness,
          metalness: preset.metalness,
          side: THREE.DoubleSide,
        });
      case 'matte':
      default:
        return new THREE.MeshStandardMaterial({
          color: colorVal,
          roughness: preset.roughness,
          metalness: preset.metalness,
          side: THREE.DoubleSide,
        });
    }
  };

  // Robust Extruded Mesh Builder
  const buildExtrudedMesh = (body: Body3D) => {
    if (!body.points || body.points.length < 3) return null;

    // 1. Sanitize polygon points and enforce counter-clockwise winding
    const cleanedPts = cleanPolygonPoints(body.points);
    if (cleanedPts.length < 3) return null;
    const outerPts = ensureWinding(cleanedPts, false);

    const shape = new THREE.Shape();
    shape.moveTo(outerPts[0].x, outerPts[0].y);
    for (let i = 1; i < outerPts.length; i++) {
      shape.lineTo(outerPts[i].x, outerPts[i].y);
    }
    shape.closePath();

    // 2. Interior cutout holes
    if (body.holes && body.holes.length > 0) {
      body.holes.forEach((rawHolePts) => {
        const cleanedHole = cleanPolygonPoints(rawHolePts);
        if (cleanedHole.length >= 3) {
          const holePts = ensureWinding(cleanedHole, true);
          const holePath = new THREE.Path();
          holePath.moveTo(holePts[0].x, holePts[0].y);
          for (let h = 1; h < holePts.length; h++) {
            holePath.lineTo(holePts[h].x, holePts[h].y);
          }
          holePath.closePath();
          shape.holes.push(holePath);
        }
      });
    }

    const depth = Math.max(1, body.extrusionHeight || 20);
    const wantsBevel = body.bevelEnabled !== false;
    const bevelSize = Math.max(0.2, Math.min(10, body.bevelSize ?? 1));
    const bevelThickness = wantsBevel ? Math.max(0.5, bevelSize) : 0;
    const bevelSegments = body.bevelSegments ?? 3;

    let geometry: THREE.BufferGeometry;
    let actualBevelEnabled = wantsBevel;
    let actualBevelThickness = bevelThickness;

    try {
      if (wantsBevel) {
        geometry = new THREE.ExtrudeGeometry(shape, {
          steps: 1,
          depth,
          bevelEnabled: true,
          bevelThickness,
          bevelSize,
          bevelOffset: 0,
          bevelSegments,
        });
      } else {
        geometry = new THREE.ExtrudeGeometry(shape, {
          steps: 1,
          depth,
          bevelEnabled: false,
        });
      }
    } catch (err) {
      try {
        geometry = new THREE.ExtrudeGeometry(shape, {
          steps: 1,
          depth,
          bevelEnabled: false,
        });
        actualBevelEnabled = false;
        actualBevelThickness = 0;
      } catch (err2) {
        console.error(`Extrude fallback failed for body ${body.name}:`, err2);
        return null;
      }
    }

    geometry.computeBoundingBox();

    const material = createThreeMaterial(body);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { bodyId: body.id, isSolidBody: true };
    mesh.rotation.x = -Math.PI / 2;

    // Dedicated Top Face Mesh for reliable hit-testing
    try {
      const topShapeGeo = new THREE.ShapeGeometry(shape);
      const topFaceMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const topFaceMesh = new THREE.Mesh(topShapeGeo, topFaceMat);
      topFaceMesh.name = `topFace_${body.id}`;
      topFaceMesh.userData = {
        bodyId: body.id,
        isTopFace: true,
        faceType: 'top',
      };
      const topZ = depth + (actualBevelEnabled ? actualBevelThickness : 0) + 0.05;
      topFaceMesh.position.set(0, 0, topZ);
      mesh.add(topFaceMesh);
    } catch (err) {
      // ignore
    }

    mesh.updateMatrixWorld(true);

    // Selected edge contour outline
    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({
      color: '#00e5ff', // Luminous Electric Cyan
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const outlineHelper = new THREE.LineSegments(edgesGeo, edgesMat);
    outlineHelper.rotation.x = -Math.PI / 2;
    outlineHelper.visible = body.id === selectedBodyId || Boolean(selectedBodyIds && selectedBodyIds.includes(body.id));
    outlineHelper.renderOrder = 1000;

    return { mesh, outline: outlineHelper };
  };

  // Re-sync all meshes whenever bodies change
  useEffect(() => {
    if (!isSceneReady) return;
    const group = meshGroupRef.current;
    if (!group) return;

    meshesMapRef.current.forEach(({ mesh, outline }) => {
      group.remove(mesh);
      group.remove(outline);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
    });
    meshesMapRef.current.clear();

    bodies.forEach((body) => {
      if (!body.visible) return;
      const result = buildExtrudedMesh(body);
      if (result) {
        const { mesh, outline } = result;
        group.add(mesh);
        group.add(outline);
        mesh.updateMatrixWorld(true);
        outline.updateMatrixWorld(true);
        meshesMapRef.current.set(body.id, { mesh, outline });
      }
    });
  }, [bodies, selectedBodyId, selectedBodyIds, isSceneReady]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0f1d');
    scene.fog = new THREE.Fog('#0a0f1d', 800, 2600);
    sceneRef.current = scene;

    const isMobile = width < 640;
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    if (isMobile) {
      camera.position.set(220, 260, 290);
    } else {
      camera.position.set(160, 200, 240);
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.maxDistance = 1800;
    controls.minDistance = 30;
    controls.target.set(0, 15, 0);
    controlsRef.current = controls;

    // Professional Studio Lighting
    const hemiLight = new THREE.HemisphereLight('#f8fafc', '#0f172a', 0.85);
    hemiLight.position.set(0, 300, 0);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight('#ffffff', 1.25);
    dirLight1.position.set(200, 400, 250);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 50;
    dirLight1.shadow.camera.far = 1200;
    dirLight1.shadow.camera.left = -350;
    dirLight1.shadow.camera.right = 350;
    dirLight1.shadow.camera.top = 350;
    dirLight1.shadow.camera.bottom = -350;
    dirLight1.shadow.bias = -0.0004;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight('#38bdf8', 0.45);
    dirLight2.position.set(-250, 150, -200);
    scene.add(dirLight2);

    // Ground Grid & Workplane
    const workplaneGroup = new THREE.Group();
    scene.add(workplaneGroup);

    const gridHelper = new THREE.GridHelper(800, 40, '#0284c7', '#1e293b');
    gridHelper.position.y = -0.1;
    workplaneGroup.add(gridHelper);

    const fineGrid = new THREE.GridHelper(800, 200, '#0369a1', '#0f172a');
    fineGrid.position.y = -0.12;
    workplaneGroup.add(fineGrid);

    // Coordinate axis arrows
    const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 80, 0xef4444, 12, 6);
    workplaneGroup.add(xArrow);
    const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.05, 0), 80, 0x38bdf8, 12, 6);
    workplaneGroup.add(zArrow);

    // Mesh group & Dedicated Interactive Gizmo Group
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    const gizmoGroup = new THREE.Group();
    scene.add(gizmoGroup);
    gizmoGroupRef.current = gizmoGroup;

    const helperGroup = new THREE.Group();
    scene.add(helperGroup);
    helperGroupRef.current = helperGroup;

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let startX = 0;
    let startY = 0;

    // Shapr3D Hit Target Resolution (Priority: Gizmo Handle > Top Face Mesh > Solid Mesh > Edge)
    const resolveHitTarget = (clientX: number, clientY: number) => {
      if (!mountRef.current || !cameraRef.current) return null;
      const rect = mountRef.current.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      mouse.x = (px / rect.width) * 2 - 1;
      mouse.y = -(py / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current);

      // 1. HIGHEST PRIORITY: Interactive Shapr3D Gizmo Objects (Push-Pull arrow, handles, vertex balls)
      if (gizmoGroup.children.length > 0) {
        const gizmoHits = raycaster.intersectObjects(gizmoGroup.children, true);
        if (gizmoHits.length > 0) {
          const hit = gizmoHits[0];
          let obj: THREE.Object3D | null = hit.object;
          while (obj && !obj.userData?.isGizmo && obj.parent) {
            obj = obj.parent;
          }
          if (obj && obj.userData?.isGizmo) {
            return {
              type: 'gizmo' as const,
              gizmoType: obj.userData.gizmoType,
              bodyId: obj.userData.bodyId,
              index: obj.userData.index,
              startIndex: obj.userData.startIndex,
              endIndex: obj.userData.endIndex,
              faceType: obj.userData.faceType || 'top',
              hitPoint: hit.point.clone(),
            };
          }
        }
      }

      // 2. Solid Body Meshes & Dedicated Top Faces
      const intersects = raycaster.intersectObjects(meshGroup.children, true);
      if (intersects.length > 0) {
        // Priority 2A: Check top face hit
        for (const hit of intersects) {
          if (hit.object.userData?.isTopFace || hit.object.userData?.faceType === 'top') {
            const bodyId = hit.object.userData.bodyId;
            const body = bodiesRef.current.find((b) => b.id === bodyId);
            if (body) {
              return {
                type: 'face' as const,
                faceType: 'top' as const,
                bodyId,
                index: -1,
                startIndex: -1,
                endIndex: -1,
                hitPoint: hit.point.clone(),
              };
            }
          }
        }

        // Priority 2B: Inspect nearest hit on solid body
        const firstHit = intersects[0];
        let obj: THREE.Object3D | null = firstHit.object;
        while (obj && !obj.userData?.bodyId) {
          obj = obj.parent;
        }

        if (obj && obj.userData?.bodyId) {
          const bodyId = obj.userData.bodyId;
          const body = bodiesRef.current.find((b) => b.id === bodyId);
          if (body) {
            const worldNormal = firstHit.face
              ? firstHit.face.normal.clone().transformDirection(obj.matrixWorld)
              : new THREE.Vector3(0, 1, 0);

            const isTop = worldNormal.y > 0.35 || firstHit.point.y >= (body.extrusionHeight - 2);
            if (isTop) {
              return {
                type: 'face' as const,
                faceType: 'top' as const,
                bodyId,
                index: -1,
                startIndex: -1,
                endIndex: -1,
                hitPoint: firstHit.point.clone(),
              };
            }

            // Side wall hit -> find corresponding edge segment
            const hx = firstHit.point.x;
            const hy = -firstHit.point.z;
            let bestSideIdx = 0;
            let minSideDist = Infinity;
            const pts = body.points;
            const n = pts.length;

            for (let i = 0; i < n; i++) {
              const p1 = pts[i];
              const p2 = pts[(i + 1) % n];
              const d = getDistanceToSegment(hx, hy, p1.x, p1.y, p2.x, p2.y).distance;
              if (d < minSideDist) {
                minSideDist = d;
                bestSideIdx = i;
              }
            }

            return {
              type: 'edge' as const,
              faceType: 'side' as const,
              bodyId,
              index: -1,
              startIndex: bestSideIdx,
              endIndex: (bestSideIdx + 1) % n,
              hitPoint: firstHit.point.clone(),
            };
          }
        }
      }

      return null;
    };

    // Shapr3D Pointer Interaction Pipeline
    const handlePointerDown = (clientX: number, clientY: number, pointerId: number) => {
      startX = clientX;
      startY = clientY;

      // Handle Repeat Pattern Guideline Drawing
      if (repeatConfigRef.current?.isDrawingLine) {
        if (!mountRef.current || !cameraRef.current) return;
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, cameraRef.current);

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPt = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersectPt);

        let snapPt: Point2D = { x: Math.round(intersectPt.x), y: Math.round(-intersectPt.z) };
        bodiesRef.current.forEach((b) => {
          b.points.forEach((pt) => {
            if (Math.hypot(pt.x - snapPt.x, pt.y - snapPt.y) < 25) {
              snapPt = { x: pt.x, y: pt.y };
            }
          });
        });

        if (onUpdateRepeatConfigRef.current) {
          const cfg = repeatConfigRef.current;
          if (cfg.drawingStep === 'start') {
            onUpdateRepeatConfigRef.current((prev) => ({ ...prev, startPoint: snapPt, drawingStep: 'end' }));
          } else if (cfg.drawingStep === 'end') {
            if (cfg.type === 'curved') {
              onUpdateRepeatConfigRef.current((prev) => ({ ...prev, endPoint: snapPt, drawingStep: 'curve' }));
            } else {
              onUpdateRepeatConfigRef.current((prev) => ({ ...prev, endPoint: snapPt, isDrawingLine: false, drawingStep: 'done' }));
            }
          } else if (cfg.drawingStep === 'curve') {
            onUpdateRepeatConfigRef.current((prev) => ({ ...prev, controlPoint: snapPt, isDrawingLine: false, drawingStep: 'done' }));
          }
        }
        return;
      }

      const target = resolveHitTarget(clientX, clientY);
      if (target) {
        const bodyId = target.bodyId;
        const body = bodiesRef.current.find((b) => b.id === bodyId);
        if (!body) return;

        // Select the body immediately
        onSelectBodyRef.current(bodyId);

        // Lock camera rotation so OrbitControls never fights with push/pull or gizmo dragging
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }

        // Configure active edit part
        if (target.type === 'gizmo') {
          if (target.gizmoType === 'extrude-height') {
            setActiveEditPart({ bodyId, type: 'face', faceType: 'top' });
            dragSessionRef.current = {
              type: 'face-height',
              bodyId,
              pointerId,
              startClientX: clientX,
              startClientY: clientY,
              startPlaneIntersection: target.hitPoint || new THREE.Vector3(),
              initialPoints: body.points.map((p) => ({ ...p })),
              initialHeight: body.extrusionHeight,
              initialBevelSize: body.bevelSize ?? 1,
            };
          } else if (target.gizmoType === 'offset-wall') {
            setActiveEditPart({ bodyId, type: 'edge', startIndex: target.startIndex, endIndex: target.endIndex });
            const pts = body.points;
            const p1 = pts[target.startIndex!];
            const p2 = pts[target.endIndex!];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            dragSessionRef.current = {
              type: 'wall-offset',
              bodyId,
              pointerId,
              startClientX: clientX,
              startClientY: clientY,
              startPlaneIntersection: target.hitPoint || new THREE.Vector3(),
              initialPoints: body.points.map((p) => ({ ...p })),
              initialHeight: body.extrusionHeight,
              initialBevelSize: body.bevelSize ?? 1,
              partEdgeStartIndex: target.startIndex,
              partEdgeEndIndex: target.endIndex,
              normal2D: { x: -dy / len, y: dx / len },
            };
          } else if (target.gizmoType === 'fillet') {
            setActiveEditPart({ bodyId, type: 'edge', startIndex: target.startIndex, endIndex: target.endIndex });
            dragSessionRef.current = {
              type: 'fillet',
              bodyId,
              pointerId,
              startClientX: clientX,
              startClientY: clientY,
              startPlaneIntersection: target.hitPoint || new THREE.Vector3(),
              initialPoints: body.points.map((p) => ({ ...p })),
              initialHeight: body.extrusionHeight,
              initialBevelSize: body.bevelSize ?? 2,
              partEdgeStartIndex: target.startIndex,
              partEdgeEndIndex: target.endIndex,
            };
          } else if (target.gizmoType === 'vertex') {
            setActiveEditPart({ bodyId, type: 'corner', index: target.index });
            dragSessionRef.current = {
              type: 'vertex',
              bodyId,
              pointerId,
              startClientX: clientX,
              startClientY: clientY,
              startPlaneIntersection: target.hitPoint || new THREE.Vector3(),
              initialPoints: body.points.map((p) => ({ ...p })),
              initialHeight: body.extrusionHeight,
              initialBevelSize: body.bevelSize ?? 1,
              partCornerIndex: target.index,
            };
          }
        } else if (target.type === 'face' && target.faceType === 'top') {
          setActiveEditPart({ bodyId, type: 'face', faceType: 'top' });
          dragSessionRef.current = {
            type: 'face-height',
            bodyId,
            pointerId,
            startClientX: clientX,
            startClientY: clientY,
            startPlaneIntersection: target.hitPoint || new THREE.Vector3(),
            initialPoints: body.points.map((p) => ({ ...p })),
            initialHeight: body.extrusionHeight,
            initialBevelSize: body.bevelSize ?? 1,
          };
        } else if (target.type === 'edge') {
          setActiveEditPart({ bodyId, type: 'edge', startIndex: target.startIndex, endIndex: target.endIndex });
        }

        setIsDragging(true);
        setDragDelta(0);
      }
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
      const session = dragSessionRef.current;
      if (!session) {
        // Hover cursor styling
        const target = resolveHitTarget(clientX, clientY);
        if (renderer.domElement) {
          if (target?.type === 'gizmo') {
            renderer.domElement.style.cursor = 'ns-resize';
          } else if (target?.type === 'face') {
            renderer.domElement.style.cursor = 'ns-resize';
          } else if (target?.type === 'edge') {
            renderer.domElement.style.cursor = 'pointer';
          } else {
            renderer.domElement.style.cursor = 'default';
          }
        }
        return;
      }

      // Live Shapr3D Direct Modeling Actions
      if (session.type === 'face-height') {
        const deltaScreenY = (session.startClientY - clientY) * 0.75;
        // Snap to whole millimeter intervals
        const rawHeight = session.initialHeight + deltaScreenY;
        const snappedHeight = Math.max(2, Math.min(600, Math.round(rawHeight)));
        const delta = Math.round(snappedHeight - session.initialHeight);

        setDragDelta(delta);
        onUpdateBodyRef.current(session.bodyId, { extrusionHeight: snappedHeight });
      } else if (session.type === 'wall-offset' && session.normal2D && session.partEdgeStartIndex !== undefined && session.partEdgeEndIndex !== undefined) {
        const deltaDist = (session.startClientY - clientY) * 0.5;
        const snapDist = Math.round(deltaDist);
        setDragDelta(snapDist);

        const pts = [...session.initialPoints];
        const p1 = pts[session.partEdgeStartIndex];
        const p2 = pts[session.partEdgeEndIndex];
        const nx = session.normal2D.x;
        const ny = session.normal2D.y;

        pts[session.partEdgeStartIndex] = {
          x: Math.round(p1.x + nx * snapDist),
          y: Math.round(p1.y + ny * snapDist),
        };
        pts[session.partEdgeEndIndex] = {
          x: Math.round(p2.x + nx * snapDist),
          y: Math.round(p2.y + ny * snapDist),
        };
        onUpdateBodyRef.current(session.bodyId, { points: pts });
      } else if (session.type === 'fillet') {
        const deltaR = (session.startClientY - clientY) * 0.1;
        const newRadius = Math.max(0, Math.min(20, Math.round((session.initialBevelSize + deltaR) * 2) / 2));
        setDragDelta(Math.round((newRadius - session.initialBevelSize) * 10) / 10);
        onUpdateBodyRef.current(session.bodyId, { 
          bevelSize: newRadius, 
          bevelEnabled: newRadius > 0 
        });
      } else if (session.type === 'vertex' && session.partCornerIndex !== undefined && mountRef.current && cameraRef.current) {
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, cameraRef.current);

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPt = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersectPt);

        const snapX = Math.round(intersectPt.x / 5) * 5;
        const snapY = Math.round(-intersectPt.z / 5) * 5;

        const pts = session.initialPoints.map((p, idx) => {
          if (idx === session.partCornerIndex) {
            return { x: snapX, y: snapY };
          }
          return p;
        });
        onUpdateBodyRef.current(session.bodyId, { points: pts });
      }
    };

    const handlePointerUp = (clientX: number, clientY: number) => {
      const wasDragging = Boolean(dragSessionRef.current);
      dragSessionRef.current = null;
      setIsDragging(false);
      setDragDelta(0);

      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }

      const diff = Math.hypot(clientX - startX, clientY - startY);
      // Quick tap / click without drag (< 6px movement)
      if (diff < 6 && !wasDragging) {
        const target = resolveHitTarget(clientX, clientY);
        if (target) {
          onSelectBodyRef.current(target.bodyId);
          if (target.type === 'face') {
            setActiveEditPart({ bodyId: target.bodyId, type: 'face', faceType: 'top' });
          } else if (target.type === 'edge') {
            setActiveEditPart({ bodyId: target.bodyId, type: 'edge', startIndex: target.startIndex, endIndex: target.endIndex });
          } else if (target.type === 'gizmo' && target.gizmoType === 'vertex') {
            setActiveEditPart({ bodyId: target.bodyId, type: 'corner', index: target.index });
          }
        } else {
          // Clicked empty background
          onSelectBodyRef.current(null);
          setActiveEditPart(null);
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      handlePointerDown(e.clientX, e.clientY, 0);
    };

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const onMouseUp = (e: MouseEvent) => {
      handlePointerUp(e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        handlePointerDown(t.clientX, t.clientY, 0);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (dragSessionRef.current) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
        }
        const t = e.touches[0];
        handlePointerMove(t.clientX, t.clientY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        handlePointerUp(t.clientX, t.clientY);
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    // Resize Handler
    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Render Animation Loop
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);

      // Smooth Camera Glide Tween (for Shapr3D ViewCube & Preset Clicks)
      if (cameraTweenRef.current?.active && cameraRef.current && controlsRef.current) {
        const tween = cameraTweenRef.current;
        tween.progress += 0.055;
        const t = Math.min(1, tween.progress);
        const ease = 1 - Math.pow(1 - t, 3); // Cubic ease-out

        cameraRef.current.position.lerpVectors(tween.startPos, tween.targetPos, ease);
        controlsRef.current.target.lerpVectors(tween.startTarget, tween.targetLookAt, ease);
        controlsRef.current.update();

        if (t >= 1) {
          tween.active = false;
        }
      } else if (controlsRef.current) {
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();
    setIsSceneReady(true);

    return () => {
      setIsSceneReady(false);
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      if (rendererRef.current && container) {
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        renderer.domElement.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
        try {
          container.removeChild(renderer.domElement);
        } catch (_) {}
      }
    };
  }, []);

  // Update Dynamic Shapr3D Interactive 3D Gizmos & Helpers
  useEffect(() => {
    const gizmoGroup = gizmoGroupRef.current;
    const helperGroup = helperGroupRef.current;
    if (!gizmoGroup || !helperGroup) return;

    // Clear previous gizmos & helpers
    while (gizmoGroup.children.length > 0) {
      const obj = gizmoGroup.children[0];
      gizmoGroup.remove(obj);
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    }
    while (helperGroup.children.length > 0) {
      const obj = helperGroup.children[0];
      helperGroup.remove(obj);
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    }

    const selectedBody = bodies.find((b) => b.id === selectedBodyId);
    if (!selectedBody || !selectedBody.visible) return;

    const height = selectedBody.extrusionHeight;
    const points = selectedBody.points;
    const n = points.length;
    if (n < 3) return;

    const cx = points.reduce((acc, p) => acc + p.x, 0) / n;
    const cy = points.reduce((acc, p) => acc + p.y, 0) / n;
    const topY = height + 0.3;

    // 1. Interactive Vertex Spheres at all corners of selected body
    const vertexMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', depthTest: false, transparent: true, opacity: 0.85 });
    const vertexActiveMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', depthTest: false, transparent: true, opacity: 0.95 });
    const sphereGeo = new THREE.SphereGeometry(3.2, 14, 14);

    points.forEach((pt, i) => {
      const isCornerActive = activeEditPart?.type === 'corner' && activeEditPart.index === i;
      
      // Bottom corner node
      const bNode = new THREE.Mesh(sphereGeo, isCornerActive ? vertexActiveMat : vertexMat);
      bNode.position.set(pt.x, 0, -pt.y);
      bNode.renderOrder = 2000;
      bNode.userData = { isGizmo: true, gizmoType: 'vertex', bodyId: selectedBody.id, index: i };
      gizmoGroup.add(bNode);

      // Top corner node
      const tNode = new THREE.Mesh(sphereGeo, isCornerActive ? vertexActiveMat : vertexMat);
      tNode.position.set(pt.x, topY, -pt.y);
      tNode.renderOrder = 2000;
      tNode.userData = { isGizmo: true, gizmoType: 'vertex', bodyId: selectedBody.id, index: i };
      gizmoGroup.add(tNode);
    });

    const isTopFaceActive = !activeEditPart || activeEditPart.type === 'face' || activeEditPart.faceType === 'top';
    const isEdgeActive = activeEditPart?.type === 'edge' && activeEditPart.startIndex !== undefined;

    // 2. SHAPR3D SIGNATURE PUSH-PULL ARROW GIZMO (on Top Face)
    if (isTopFaceActive) {
      // Glow face overlay
      try {
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < n; i++) shape.lineTo(points[i].x, points[i].y);
        shape.closePath();

        const topGeo = new THREE.ShapeGeometry(shape);
        const topMat = new THREE.MeshBasicMaterial({
          color: '#00e5ff',
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const topMesh = new THREE.Mesh(topGeo, topMat);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = topY + 0.1;
        topMesh.renderOrder = 1990;
        helperGroup.add(topMesh);

        // Highlight border
        const borderPts = points.map((p) => new THREE.Vector3(p.x, topY + 0.15, -p.y));
        borderPts.push(borderPts[0]);
        const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
        const borderMat = new THREE.LineBasicMaterial({ color: '#38bdf8', linewidth: 3, depthTest: false });
        const borderLine = new THREE.Line(borderGeo, borderMat);
        borderLine.renderOrder = 1995;
        helperGroup.add(borderLine);
      } catch (_) {}

      // Interactive 3D Arrow Gizmo Object
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(cx, topY, -cy);
      arrowGroup.userData = { isGizmo: true, gizmoType: 'extrude-height', bodyId: selectedBody.id };

      // Base Pull Ring
      const ringGeo = new THREE.RingGeometry(4.5, 7.5, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#00e5ff', side: THREE.DoubleSide, depthTest: false });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.5;
      ringMesh.renderOrder = 2002;
      arrowGroup.add(ringMesh);

      // Arrow Shaft (Vertical Cylinder)
      const shaftGeo = new THREE.CylinderGeometry(1.6, 1.6, 26, 16);
      const arrowMat = new THREE.MeshBasicMaterial({ color: '#00e5ff', depthTest: false });
      const shaftMesh = new THREE.Mesh(shaftGeo, arrowMat);
      shaftMesh.position.y = 14;
      shaftMesh.renderOrder = 2005;
      arrowGroup.add(shaftMesh);

      // Primary Cone Arrowhead (Pointing Up)
      const coneGeo = new THREE.ConeGeometry(5, 10, 20);
      const coneMesh = new THREE.Mesh(coneGeo, arrowMat);
      coneMesh.position.y = 30;
      coneMesh.renderOrder = 2006;
      arrowGroup.add(coneMesh);

      // Secondary Downward Arrowhead (Bidirectional push-pull visual)
      const downConeGeo = new THREE.ConeGeometry(3.5, 6, 16);
      const downConeMesh = new THREE.Mesh(downConeGeo, arrowMat);
      downConeMesh.rotation.x = Math.PI;
      downConeMesh.position.y = 4;
      downConeMesh.renderOrder = 2006;
      arrowGroup.add(downConeMesh);

      // Invisible Thick Hitbox for super reliable grab
      const hitProxyGeo = new THREE.CylinderGeometry(14, 14, 42, 12);
      const hitProxyMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitProxyMesh = new THREE.Mesh(hitProxyGeo, hitProxyMat);
      hitProxyMesh.position.y = 16;
      hitProxyMesh.userData = { isGizmo: true, gizmoType: 'extrude-height', bodyId: selectedBody.id };
      arrowGroup.add(hitProxyMesh);

      gizmoGroup.add(arrowGroup);
    }

    // 3. SHAPR3D WALL OFFSET & FILLET/CHAMFER GIZMO (on Active Edge)
    if (isEdgeActive) {
      const idx1 = activeEditPart.startIndex!;
      const idx2 = activeEditPart.endIndex!;
      const pt1 = points[idx1];
      const pt2 = points[idx2];

      const midX = (pt1.x + pt2.x) / 2;
      const midY = (pt1.y + pt2.y) / 2;
      const edx = pt2.x - pt1.x;
      const edy = pt2.y - pt1.y;
      const elen = Math.hypot(edx, edy) || 1;
      const nx = -edy / elen;
      const ny = edx / elen;

      // Glow wall mesh
      const wallGeo = new THREE.BufferGeometry();
      const wallVerts = new Float32Array([
        pt1.x, 0, -pt1.y,
        pt2.x, 0, -pt2.y,
        pt2.x, height, -pt2.y,
        pt1.x, 0, -pt1.y,
        pt2.x, height, -pt2.y,
        pt1.x, height, -pt1.y,
      ]);
      wallGeo.setAttribute('position', new THREE.BufferAttribute(wallVerts, 3));
      const wallMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.renderOrder = 1990;
      helperGroup.add(wallMesh);

      // Edge line highlight
      const edgeLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pt1.x, height, -pt1.y),
        new THREE.Vector3(pt2.x, height, -pt2.y),
      ]);
      const edgeLineMat = new THREE.LineBasicMaterial({ color: '#fbbf24', linewidth: 4, depthTest: false });
      const edgeLine = new THREE.Line(edgeLineGeo, edgeLineMat);
      edgeLine.renderOrder = 2000;
      helperGroup.add(edgeLine);

      // Normal Push-Pull Arrow pointing perpendicular outward
      const wallArrowGroup = new THREE.Group();
      wallArrowGroup.position.set(midX, height / 2, -midY);
      wallArrowGroup.userData = { isGizmo: true, gizmoType: 'offset-wall', bodyId: selectedBody.id, startIndex: idx1, endIndex: idx2 };

      const dir = new THREE.Vector3(nx, 0, -ny).normalize();
      const arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 28, 0xf59e0b, 8, 4.5);
      arrowHelper.renderOrder = 2005;
      wallArrowGroup.add(arrowHelper);

      // Hitbox
      const wallHitbox = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
      wallHitbox.position.copy(dir.clone().multiplyScalar(14));
      wallHitbox.userData = { isGizmo: true, gizmoType: 'offset-wall', bodyId: selectedBody.id, startIndex: idx1, endIndex: idx2 };
      wallArrowGroup.add(wallHitbox);

      gizmoGroup.add(wallArrowGroup);

      // Fillet Curved Handle at top edge
      const filletHandleGroup = new THREE.Group();
      filletHandleGroup.position.set(midX, height + 1, -midY);
      filletHandleGroup.userData = { isGizmo: true, gizmoType: 'fillet', bodyId: selectedBody.id, startIndex: idx1, endIndex: idx2 };

      const filletTorusGeo = new THREE.TorusGeometry(5, 1.4, 8, 16, Math.PI);
      const filletMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', depthTest: false });
      const filletMesh = new THREE.Mesh(filletTorusGeo, filletMat);
      filletMesh.rotation.x = -Math.PI / 2;
      filletMesh.renderOrder = 2006;
      filletHandleGroup.add(filletMesh);

      const filletHitbox = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
      filletHitbox.userData = { isGizmo: true, gizmoType: 'fillet', bodyId: selectedBody.id, startIndex: idx1, endIndex: idx2 };
      filletHandleGroup.add(filletHitbox);

      gizmoGroup.add(filletHandleGroup);
    }

  }, [activeEditPart, bodies, selectedBodyId]);

  // Shapr3D Smooth Camera Navigation to preset angles & ViewCube faces
  const handleSelectCameraAngle = useCallback((face: CubeFace) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const mount = mountRef.current;
    if (!camera || !controls || !mount) return;

    const isSmall = mount.clientWidth < 640;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    let targetPos = new THREE.Vector3();
    let targetLookAt = new THREE.Vector3(0, 15, 0);

    switch (face) {
      case 'top':
        targetPos.set(0, isSmall ? 520 : 420, 0.1);
        targetLookAt.set(0, 0, 0);
        setActiveCameraAngle('top');
        break;
      case 'bottom':
        targetPos.set(0, -(isSmall ? 520 : 420), 0.1);
        targetLookAt.set(0, 0, 0);
        break;
      case 'front':
        targetPos.set(0, 60, isSmall ? 480 : 380);
        targetLookAt.set(0, 60, 0);
        setActiveCameraAngle('front');
        break;
      case 'back':
        targetPos.set(0, 60, -(isSmall ? 480 : 380));
        targetLookAt.set(0, 60, 0);
        break;
      case 'right':
        targetPos.set(isSmall ? 480 : 380, 60, 0);
        targetLookAt.set(0, 60, 0);
        break;
      case 'left':
        targetPos.set(-(isSmall ? 480 : 380), 60, 0);
        targetLookAt.set(0, 60, 0);
        break;
      case 'iso':
      default:
        if (isSmall) targetPos.set(220, 260, 290);
        else targetPos.set(160, 200, 240);
        targetLookAt.set(0, 15, 0);
        setActiveCameraAngle('iso');
        break;
    }

    // Activate smooth slerp tween
    cameraTweenRef.current = {
      active: true,
      startPos,
      targetPos,
      startTarget,
      targetLookAt,
      progress: 0,
    };
  }, []);

  const handleResetCamera = useCallback(() => {
    handleSelectCameraAngle('iso');
  }, [handleSelectCameraAngle]);

  const selectedBody = bodies.find((b) => b.id === selectedBodyId);

  return (
    <div className="relative w-full flex-1 min-h-[300px] h-full bg-[#0a0f1d] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl select-none flex flex-col touch-none">
      {/* Three canvas target mounting point */}
      <div ref={mountRef} className="w-full h-full flex-1 min-h-0 touch-none" id="three-model-mount" />

      {/* Shapr3D Interactive 3D ViewCube in Top Right */}
      <ViewCube
        camera={cameraRef.current}
        onSelectFace={handleSelectCameraAngle}
        onResetCamera={handleResetCamera}
      />

      {/* Shapr3D Floating Dimension Badge & Direct Input at Top Center */}
      {selectedBody && (
        <ShaprDimensionBadge
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

      {/* Floating 3D Navigation Tips bottom left */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 items-start bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/60 font-mono text-xs text-slate-300 pointer-events-none z-10 max-w-[280px] sm:max-w-none shadow-xl">
        <div className="text-cyan-400 font-semibold uppercase text-[10px] tracking-wider mb-0.5 flex items-center gap-1.5">
          <Layers size={11} /> Shapr3D Direct Modeling
        </div>
        <div className="text-slate-400 text-[10px] flex flex-col gap-0.5 leading-tight">
          <span>• <b className="text-white">Pull 3D Arrow:</b> Push-Pull face extrusion</span>
          <span>• <b className="text-white">Click Badge:</b> Type exact millimeter dimension</span>
          <span>• <b className="text-slate-200">Orbit:</b> 1 finger / Left drag • <b className="text-slate-200">Pan:</b> 2 fingers / Right drag</span>
        </div>
      </div>
    </div>
  );
}
