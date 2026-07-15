#!/usr/bin/env node
// Local dev server: serves the static frontend from public/ and mounts the
// exact same API core the Cloudflare Worker uses. Zero dependencies.
//
//   THESPORTSDB_KEY=yourkey node dev-server.js   (defaults to demo key "3")

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApi } from './worker/src/api.js';
import { createTheSportsDbAdapter } from './worker/src/adapters/thesportsdb.js';
import { createJolpicaAdapter } from './worker/src/adapters/jolpica.js';
import { MemoryCache } from './worker/src/cache.js';
import { SlidingWindowRateLimiter } from './worker/src/ratelimit.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8788);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Same CSP the deployed frontend declares via <meta>; here it's a real header.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const api = createApi({
  adapters: {
    thesportsdb: createTheSportsDbAdapter({ apiKey: process.env.THESPORTSDB_KEY || '3' }),
    jolpica: createJolpicaAdapter({}),
  },
  cache: new MemoryCache(),
  limiter: new SlidingWindowRateLimiter({ limit: 30, windowMs: 60_000 }),
});

async function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);
  // Path traversal guard: resolved file must stay inside public/.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const ip = req.socket.remoteAddress || 'unknown';
    try {
      const result = await api.handle(url.pathname, url.searchParams, ip);
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (result.retryAfterSeconds) headers['Retry-After'] = String(result.retryAfterSeconds);
      res.writeHead(result.status, headers);
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error('[dev-server] unhandled API error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  await serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`SportsWeek dev server → http://localhost:${PORT}`);
});
