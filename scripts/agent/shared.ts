// Shared by the MCP and HTTP servers: one model, kept on disk, with every tool the app's agent bridge has (minus the screen ones).
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { Engine, ToolResponse, parseDoc, starterDoc, emptyDoc } from '../../src/core';

export interface Model {
  engine: Engine;
  file: string;
  /** Run a tool; changes are saved to disk before this returns. */
  call(name: string, args: unknown, ifRevision?: number): Promise<ToolResponse>;
}

/** Opens (or starts) the model file. CRAFT3D_DOC picks the path; CRAFT3D_START=starter begins a new file with the starter block, else it begins empty. */
export function openModel(): Model {
  const file = resolve(process.env.CRAFT3D_DOC ?? 'craft3d-model.json');
  let doc = process.env.CRAFT3D_START === 'starter' ? starterDoc() : emptyDoc();
  if (existsSync(file)) {
    const parsed = parseDoc(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed) throw new Error(`${file} is not a Craft3D document.`);
    doc = parsed;
  }
  const engine = new Engine(doc);
  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(engine.toJSON()));
    renameSync(tmp, file); // never leave a half-written file behind
  };
  engine.subscribe(save);

  return {
    engine,
    file,
    async call(name, args, ifRevision) {
      // `export` may name a file to write, so a scheduled job can hand the STL straight to a slicer.
      const a = (args && typeof args === 'object' ? { ...(args as Record<string, unknown>) } : {}) as Record<string, any>;
      const path = name === 'export' && typeof a.path === 'string' ? resolve(a.path) : null;
      delete a.path;
      const res = await engine.execute(name, a, { ifRevision });
      if (path && res.ok) {
        const r = res.result as { encoding?: string; data?: string; text?: string };
        writeFileSync(path, r.encoding === 'base64' ? Buffer.from(r.data ?? '', 'base64') : r.text ?? '');
        res.result = { format: a.format, path, bytes: r.encoding === 'base64' ? Buffer.from(r.data ?? '', 'base64').length : (r.text ?? '').length };
      }
      return res;
    },
  };
}

/** The tool list with the file-writing option of `export` added (it only exists headless). */
export function headlessTools() {
  return Engine.tools.map((t) =>
    t.name === 'export'
      ? { ...t, description: `${t.description} Pass "path" to write the file to disk instead of returning it.`, inputSchema: { ...t.inputSchema, properties: { ...(t.inputSchema as any).properties, path: { type: 'string' } } } }
      : t
  );
}
