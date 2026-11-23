#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dirArg = process.argv[2];
const portArg = Number(process.argv[3] || 4391);

if (!dirArg || !Number.isInteger(portArg) || portArg < 1 || portArg > 65535) {
  console.error('Usage: serve-mockup.mjs <dir> <port>');
  process.exit(2);
}

const rootDir = path.resolve(dirArg);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/.verify-ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, mode: 'mockup', pid: process.pid, dir: rootDir }));
    return;
  }

  if (urlPath === '/') {
    res.writeHead(302, { Location: '/flipwise-mockup.html' });
    res.end();
    return;
  }

  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(rootDir, rel);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  console.error(`serve-mockup error: ${err.message}`);
  process.exit(1);
});

server.listen(portArg, '127.0.0.1', () => {
  console.log(`Flipwise mockup server listening on http://127.0.0.1:${portArg} (pid ${process.pid})`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
