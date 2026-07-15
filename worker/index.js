// Cloudflare Worker entry point. Deploy with `wrangler deploy` (see README).
//
// Secrets/bindings expected:
//   THESPORTSDB_KEY  (secret)        — falls back to the public demo key "3"
//   SPORTSWEEK_KV    (KV namespace)  — optional; in-memory cache used if absent
//   ALLOWED_ORIGIN   (var)           — origin allowed for CORS, e.g. the
//                                      GitHub Pages URL. "*" only for dev.

import { createApi } from './src/api.js';
import { createTheSportsDbAdapter } from './src/adapters/thesportsdb.js';
import { createJolpicaAdapter } from './src/adapters/jolpica.js';
import { MemoryCache, KvCache } from './src/cache.js';
import { SlidingWindowRateLimiter } from './src/ratelimit.js';

// Module scope survives across requests within an isolate — good enough for
// the rate limiter and the fallback cache.
const limiter = new SlidingWindowRateLimiter({ limit: 30, windowMs: 60_000 });
const memoryCache = new MemoryCache();
let api = null;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(env),
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    if (api === null) {
      const cache = env.SPORTSWEEK_KV ? new KvCache(env.SPORTSWEEK_KV) : memoryCache;
      api = createApi({
        adapters: {
          thesportsdb: createTheSportsDbAdapter({ apiKey: env.THESPORTSDB_KEY || '3' }),
          jolpica: createJolpicaAdapter({}),
        },
        cache,
        limiter,
      });
    }

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const result = await api.handle(url.pathname, url.searchParams, ip);

    if (result.retryAfterSeconds) headers['Retry-After'] = String(result.retryAfterSeconds);
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  },
};
