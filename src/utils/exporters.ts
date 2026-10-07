/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { Body3D } from '../types';
import { buildBodyGeometry } from './bodyGeometry';
import { frameMatrix } from './frame';

const buildExportGroup = (bodies: Body3D[]) => {
  const group = new THREE.Group();
  bodies.forEach((body) => {
    if (!body.visible) return;
    const geometry = buildBodyGeometry(body);
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry);
    mesh.name = body.name.replace(/\s+/g, '_');
    if (body.frame) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(frameMatrix(body.frame));
    }
    group.add(mesh);
  });
  return group;
};

const stamp = () => new Date().toISOString().slice(0, 10);

const download = (data: BlobPart, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Returns false when there was nothing to export. */
export function exportSTL(bodies: Body3D[]): boolean {
  const group = buildExportGroup(bodies);
  if (group.children.length === 0) return false;
  // Z-up for slicers: our scene is Y-up.
  group.rotation.x = Math.PI / 2;
  group.updateMatrixWorld(true);
  const data = new STLExporter().parse(group, { binary: true });
  download(data, `craft3d-${stamp()}.stl`, 'model/stl');
  return true;
}

export function exportOBJ(bodies: Body3D[]): boolean {
  const group = buildExportGroup(bodies);
  if (group.children.length === 0) return false;
  download(new OBJExporter().parse(group), `craft3d-${stamp()}.obj`, 'text/plain');
  return true;
}

export function exportJSON(bodies: Body3D[]): void {
  download(JSON.stringify(bodies, null, 2), `craft3d-${stamp()}.json`, 'application/json');
}
