const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = __dirname;
const outDir = path.join(__dirname, 'out');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function safeRead(p) {
  try { return fs.readFileSync(p); } catch (e) { return null; }
}

function listOutFiles() {
  try {
    const files = fs.readdirSync(outDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files;
  } catch (e) {
    return [];
  }
}

function latestOutFile() {
  const files = listOutFiles();
  return files.length ? files[0].name : null;
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  const pathname = u.pathname || '/';

  if (pathname === '/' || pathname === '/dashboard.html') {
    const p = path.join(root, 'dashboard.html');
    const b = safeRead(p);
    if (!b) return send(res, 404, 'dashboard.html no encontrado');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(b);
  }

  if (pathname === '/api/list') {
    return sendJson(res, { files: listOutFiles() });
  }

  if (pathname === '/api/latest') {
    const f = latestOutFile();
    if (!f) return sendJson(res, { file: null, data: null });
    const p = path.join(outDir, f);
    const b = safeRead(p);
    if (!b) return sendJson(res, { file: f, data: null });
    try {
      const data = JSON.parse(b.toString('utf8'));
      return sendJson(res, { file: f, data });
    } catch (e) {
      return sendJson(res, { file: f, data: null, error: 'JSON inválido' }, 500);
    }
  }

  if (pathname.startsWith('/out/')) {
    const name = pathname.replace(/^\/out\//, '');
    const p = path.join(outDir, name);
    const b = safeRead(p);
    if (!b) return send(res, 404, 'Archivo no encontrado');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(b);
  }

  return send(res, 404, 'Not found');
});

const port = 4173;
server.listen(port, () => {
  process.stdout.write(`http://localhost:${port}/\n`);
});

