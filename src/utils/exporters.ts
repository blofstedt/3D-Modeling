/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Body3D } from '../types';
import { objText, stlBytes } from './serialize';

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
  const data = stlBytes(bodies);
  if (!data) return false;
  download(data as BlobPart, `craft3d-${stamp()}.stl`, 'model/stl');
  return true;
}

export function exportOBJ(bodies: Body3D[]): boolean {
  const data = objText(bodies);
  if (!data) return false;
  download(data, `craft3d-${stamp()}.obj`, 'text/plain');
  return true;
}

export function exportJSON(bodies: Body3D[]): void {
  download(JSON.stringify(bodies, null, 2), `craft3d-${stamp()}.json`, 'application/json');
}
