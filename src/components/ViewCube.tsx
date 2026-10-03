/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { RotateCcw, Compass, Maximize2 } from 'lucide-react';

export type CubeFace = 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left' | 'iso';

interface ViewCubeProps {
  camera: THREE.PerspectiveCamera | null;
  onSelectFace: (face: CubeFace) => void;
  onResetCamera: () => void;
}

export default function ViewCube({ camera, onSelectFace, onResetCamera }: ViewCubeProps) {
  const [transformStyle, setTransformStyle] = useState<string>('');
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);

  useEffect(() => {
    let animId: number;
    const tempMat = new THREE.Matrix4();
    const tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    const updateRotation = () => {
      if (camera) {
        // Extract camera rotation inverse so cube matches scene view
        tempMat.copy(camera.matrixWorldInverse);
        tempEuler.setFromRotationMatrix(tempMat, 'YXZ');
        
        // CSS 3D uses degrees; invert Pitch/Yaw to match screen orientation
        const rotX = THREE.MathUtils.radToDeg(tempEuler.x);
        const rotY = THREE.MathUtils.radToDeg(tempEuler.y);
        const rotZ = THREE.MathUtils.radToDeg(tempEuler.z);

        setTransformStyle(`rotateX(${-rotX}deg) rotateY(${rotY}deg) rotateZ(${-rotZ}deg)`);
      }
      animId = requestAnimationFrame(updateRotation);
    };

    updateRotation();
    return () => cancelAnimationFrame(animId);
  }, [camera]);

  const size = 68; // cube size in pixels
  const half = size / 2;

  const faceStyle = (
    translateZ: number,
    rotateX: number,
    rotateY: number,
    isHovered: boolean
  ): React.CSSProperties => ({
    position: 'absolute',
    width: `${size}px`,
    height: `${size}px`,
    transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translateZ(${translateZ}px)`,
    backfaceVisibility: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    backgroundColor: isHovered ? 'rgba(6, 182, 212, 0.45)' : 'rgba(15, 23, 42, 0.85)',
    color: isHovered ? '#ffffff' : '#94a3b8',
    cursor: 'pointer',
    userSelect: 'none',
    boxShadow: isHovered ? '0 0 12px rgba(6, 182, 212, 0.5)' : 'inset 0 0 8px rgba(0, 0, 0, 0.5)',
    transition: 'background-color 0.15s, color 0.15s, box-shadow 0.15s',
  });

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col items-center gap-1.5 pointer-events-auto">
      {/* 3D Interactive View Cube Container */}
      <div
        className="relative"
        style={{
          width: `${size + 24}px`,
          height: `${size + 24}px`,
          perspective: '450px',
        }}
        title="Shapr3D View Cube (Click face to orient)"
      >
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          style={{
            transformStyle: 'preserve-3d',
            transform: transformStyle,
            transition: 'transform 0.04s ease-out',
          }}
        >
          {/* TOP */}
          <div
            style={faceStyle(half, 90, 0, hoveredFace === 'top')}
            onMouseEnter={() => setHoveredFace('top')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('top')}
          >
            TOP
          </div>

          {/* BOTTOM */}
          <div
            style={faceStyle(half, -90, 0, hoveredFace === 'bottom')}
            onMouseEnter={() => setHoveredFace('bottom')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('bottom')}
          >
            BOTTOM
          </div>

          {/* FRONT */}
          <div
            style={faceStyle(half, 0, 0, hoveredFace === 'front')}
            onMouseEnter={() => setHoveredFace('front')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('front')}
          >
            FRONT
          </div>

          {/* BACK */}
          <div
            style={faceStyle(half, 0, 180, hoveredFace === 'back')}
            onMouseEnter={() => setHoveredFace('back')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('back')}
          >
            BACK
          </div>

          {/* RIGHT */}
          <div
            style={faceStyle(half, 0, 90, hoveredFace === 'right')}
            onMouseEnter={() => setHoveredFace('right')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('right')}
          >
            RIGHT
          </div>

          {/* LEFT */}
          <div
            style={faceStyle(half, 0, -90, hoveredFace === 'left')}
            onMouseEnter={() => setHoveredFace('left')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onSelectFace('left')}
          >
            LEFT
          </div>
        </div>
      </div>

      {/* Quick Navigation Control Strip */}
      <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md px-1.5 py-1 rounded-xl border border-slate-700/80 shadow-lg text-[10px] font-mono text-slate-300">
        <button
          onClick={() => onSelectFace('iso')}
          className="px-2 py-0.5 rounded hover:bg-cyan-500/20 hover:text-cyan-300 text-white/80 font-bold transition cursor-pointer"
          title="Isometric View"
        >
          ISO
        </button>
        <div className="h-3 w-[1px] bg-slate-700" />
        <button
          onClick={onResetCamera}
          className="p-1 rounded hover:bg-cyan-500/20 hover:text-cyan-300 text-white/80 transition cursor-pointer"
          title="Reset Camera & Center Plane"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
