// A small HTTP API for webhooks, schedulers and scripts.
//   CRAFT3D_TOKEN=secret CRAFT3D_DOC=model.json node dist-agent/http.mjs     (PORT, HOST optional)
//   POST /execute  { "tool": "shape_add", "args": { "kind": "box" }, "ifRevision": 3 }  ->  the tool's response
//   GET  /tools    the tool specs         GET /doc    the document
//   GET  /export.stl | /export.obj        the model as a file
// Binds to 127.0.0.1 unless HOST says otherwise, and then insists on a token.
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { headlessTools, openModel } from './shared';

const model = openModel();
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3737);
const token = process.env.CRAFT3D_TOKEN ?? '';
if (host !== '127.0.0.1' && host !== 'localhost' && !token) {
  console.error('Refusing to listen on a public address without CRAFT3D_TOKEN set.');
  process.exit(1);
}

const authorised = (req: IncomingMessage) => {
  if (!token) return true;
  const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

createServer(async (req, res) => {
  try {
    if (!authorised(req)) return send(res, 401, { ok: false, error: 'Missing or wrong bearer token.' });
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/tools') return send(res, 200, headlessTools());
    if (req.method === 'GET' && url.pathname === '/doc') return send(res, 200, model.engine.toJSON());
    if (req.method === 'GET' && (url.pathname === '/export.stl' || url.pathname === '/export.obj')) {
      const format = url.pathname.endsWith('stl') ? 'stl' : 'obj';
      const r = await model.engine.execute('export', { format });
      if (!r.ok) return send(res, 400, r);
      const out = r.result as { data?: string; text?: string };
      return send(res, 200, format === 'stl' ? Buffer.from(out.data!, 'base64') : out.text!, format === 'stl' ? 'model/stl' : 'text/plain');
    }
    if (req.method === 'POST' && url.pathname === '/execute') {
      const body = JSON.parse((await readBody(req)) || '{}') as { tool?: string; args?: unknown; ifRevision?: number };
      if (!body.tool) return send(res, 400, { ok: false, error: 'Send { "tool": name, "args": {...} }.' });
      const r = await model.call(body.tool, body.args ?? {}, body.ifRevision);
      return send(res, r.ok ? 200 : 400, r);
    }
    send(res, 404, { ok: false, error: 'POST /execute, GET /tools, GET /doc, GET /export.stl' });
  } catch (e) {
    send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}).listen(port, host, () => console.error(`craft3d HTTP API on http://${host}:${port} · model file ${model.file}`));
