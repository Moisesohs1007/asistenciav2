import http from 'node:http';
import { URL } from 'node:url';

const sessionId = 'storage-rls-upload';
const startPort = 7777;
const logs = [];
const startedAt = Date.now();

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

function makeServer(port) {
  return http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, { ok: false, error: 'missing url' });
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  const u = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === 'GET' && u.pathname === '/health') {
    return send(res, 200, { ok: true, sessionId, uptimeSec: Math.round((Date.now() - startedAt) / 1000), count: logs.length });
  }

  if (u.pathname === '/logs') {
    if (req.method === 'GET') {
      const last = Number(u.searchParams.get('last') || '0');
      const out = last > 0 ? logs.slice(-last) : logs;
      return send(res, 200, { ok: true, sessionId, logs: out });
    }
    if (req.method === 'DELETE') {
      logs.length = 0;
      return send(res, 200, { ok: true, sessionId, cleared: true });
    }
  }

  if (req.method === 'POST' && u.pathname === '/event') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      let evt = null;
      try { evt = JSON.parse(raw || '{}'); } catch { evt = { parseError: true, raw }; }
      logs.push({ t: new Date().toISOString(), ...evt });
      return send(res, 200, { ok: true, sessionId });
    });
    return;
  }

  return send(res, 404, { ok: false, error: 'not found' });
  });
}

async function listenWithProbe() {
  for (let p = startPort; p < startPort + 10; p++) {
    const server = makeServer(p);
    const ok = await new Promise(resolve => {
      server.once('error', err => {
        if (err && err.code === 'EADDRINUSE') resolve(false);
        else resolve(false);
      });
      server.listen(p, '127.0.0.1', () => resolve(true));
    });
    if (ok) {
      process.stdout.write(`debug-server session=${sessionId} url=http://127.0.0.1:${p}/event\n`);
      return;
    }
  }
  process.stderr.write('debug-server: no free port found\n');
  process.exit(1);
}

listenWithProbe();
