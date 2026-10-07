// Starts the real MCP and HTTP servers and talks to them like an agent runtime would.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const dir = mkdtempSync(join(tmpdir(), 'craft3d-'));

// MCP over stdio
{
  const file = join(dir, 'mcp-model.json');
  const transport = new StdioClientTransport({ command: 'node', args: ['dist-agent/mcp.mjs'], env: { ...process.env, CRAFT3D_DOC: file } });
  const client = new Client({ name: 'check', version: '1' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  check('MCP lists the tools', tools.length >= 25 && tools.some((t) => t.name === 'shape_add') && !tools.some((t) => t.name.startsWith('ui_')), `${tools.length} tools`);
  check('every tool has a JSON schema and a description', tools.every((t) => t.inputSchema?.type === 'object' && t.description.length > 10));
  const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  const added = await call('shape_add', { kind: 'hexagon', width: 50, height: 25 });
  check('MCP adds a shape', added.ok && added.shapes[0].size.height === 25);
  const bad = await client.callTool({ name: 'shape_set', arguments: { id: 'nope' } });
  check('MCP marks a failed call as an error and says why', bad.isError === true && /No shape/.test(bad.content[0].text));
  const stlPath = join(dir, 'out.stl');
  const exp = await call('export', { format: 'stl', path: stlPath });
  check('export can write a file for a slicer', exp.ok && existsSync(stlPath) && readFileSync(stlPath).length > 500, JSON.stringify(exp.result));
  await client.close();
  check('the model was saved to disk', existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).bodies.length === 1);

  // A second session picks up where the first stopped.
  const t2 = new StdioClientTransport({ command: 'node', args: ['dist-agent/mcp.mjs'], env: { ...process.env, CRAFT3D_DOC: file } });
  const c2 = new Client({ name: 'check2', version: '1' });
  await c2.connect(t2);
  const scene = JSON.parse((await c2.callTool({ name: 'scene_get', arguments: {} })).content[0].text);
  check('a new session reloads the saved model', scene.result.shapes.length === 1 && scene.result.shapes[0].size.height === 25);
  await c2.close();
}

// HTTP
{
  const file = join(dir, 'http-model.json');
  const port = 38000 + Math.floor(Math.random() * 1000);
  const child = spawn('node', ['dist-agent/http.mjs'], { env: { ...process.env, CRAFT3D_DOC: file, PORT: String(port), CRAFT3D_TOKEN: 'secret' }, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve) => child.stderr.on('data', (d) => String(d).includes('HTTP API') && resolve()));
  const url = `http://127.0.0.1:${port}`;
  const post = (body, token = 'secret') => fetch(`${url}/execute`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  check('HTTP refuses a missing token', (await fetch(`${url}/tools`)).status === 401);
  check('HTTP refuses a wrong token', (await post({ tool: 'scene_get' }, 'nope')).status === 401);
  const r = await (await post({ tool: 'shape_add', args: { kind: 'box', height: 10 } })).json();
  check('HTTP executes a tool', r.ok && r.shapes[0].size.height === 10);
  const stale = await post({ tool: 'shape_add', args: { kind: 'box' }, ifRevision: 0 });
  check('HTTP honours ifRevision', stale.status === 400 && /changed since/.test((await stale.json()).error));
  const stl = await fetch(`${url}/export.stl`, { headers: { authorization: 'Bearer secret' } });
  check('HTTP serves the STL', stl.status === 200 && (await stl.arrayBuffer()).byteLength > 500);
  const tools = await (await fetch(`${url}/tools`, { headers: { authorization: 'Bearer secret' } })).json();
  check('HTTP lists the tools', Array.isArray(tools) && tools.length >= 25);
  child.kill();
}

if (failures) {
  console.error(`\n${failures} server check(s) failed`);
  process.exit(1);
}
console.log('\nall server checks passed');
