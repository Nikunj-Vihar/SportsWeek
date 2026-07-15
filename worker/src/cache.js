// Caching (§5). One interface, two backends:
//  - MemoryCache: plain Map, used by the local dev server, tests, and as the
//    Worker fallback when no KV namespace is bound.
//  - KvCache: Cloudflare Workers KV.
//
// Entries are stored as { storedAt: epochMs, value } and are NEVER expired at
// the storage layer within the retention window — freshness is decided by the
// reader so a stale entry can still be served when the provider is down.

export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // fixtures don't change minute to minute
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;    // hard upper bound on stale serving

export class MemoryCache {
  constructor() {
    this.map = new Map();
  }

  async get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    return entry;
  }

  async put(key, value, now = Date.now()) {
    this.map.set(key, { storedAt: now, value });
  }
}

export class KvCache {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
  }

  async get(key) {
    const raw = await this.kv.get(key, 'json');
    return raw ?? null;
  }

  async put(key, value, now = Date.now()) {
    await this.kv.put(key, JSON.stringify({ storedAt: now, value }), {
      expirationTtl: Math.floor(RETENTION_MS / 1000),
    });
  }
}

export function isFresh(entry, now = Date.now(), ttlMs = CACHE_TTL_MS) {
  return entry !== null && now - entry.storedAt < ttlMs;
}

export function isServable(entry, now = Date.now()) {
  return entry !== null && now - entry.storedAt < RETENTION_MS;
}
