// Core orchestration: registry lookup → cache check → adapter fetch → cache
// store, with stale-cache fallback on provider failure (§5).
//
// Platform-agnostic: runs unchanged in Cloudflare Workers, the local Node dev
// server, and tests. All I/O (adapters, cache, clock) is injected.

import { REGISTRY } from './registry.js';
import { CACHE_TTL_MS, isFresh, isServable } from './cache.js';

const CACHE_VERSION = 'v1';

export function cacheKey(sport, from, to) {
  return `${CACHE_VERSION}:${sport}:${from}:${to}`;
}

/**
 * Build the /api/schedule response body.
 *
 * @param {object} opts
 * @param {string[]} opts.sports   validated canonical sport names
 * @param {string} opts.from       YYYY-MM-DD (validated)
 * @param {string} opts.to         YYYY-MM-DD (validated)
 * @param {object} opts.adapters   { thesportsdb, jolpica, ... } adapter instances
 * @param {object} opts.cache      MemoryCache | KvCache
 * @param {object} [opts.logger]
 * @param {number} [opts.now]      epoch ms, injectable for tests
 * @param {number} [opts.ttlMs]
 */
export async function getSchedule({ sports, from, to, adapters, cache, logger = console, now = Date.now(), ttlMs = CACHE_TTL_MS }) {
  const results = await Promise.all(
    sports.map((sport) => getSportSchedule({ sport, from, to, adapters, cache, logger, now, ttlMs }))
  );
  const bySport = {};
  for (const result of results) bySport[result.sport] = result.body;
  return { range: { from, to }, sports: bySport };
}

async function getSportSchedule({ sport, from, to, adapters, cache, logger, now, ttlMs }) {
  const entryConfig = REGISTRY[sport];
  const adapter = entryConfig && adapters[entryConfig.adapter];
  if (!adapter) {
    // Registry/adapter wiring bug — surface as an error for this sport only.
    logger.error(`[schedule] no adapter wired for sport "${sport}"`);
    return { sport, body: { events: [], stale: false, error: 'No data source configured', lastUpdated: null } };
  }

  const key = cacheKey(sport, from, to);
  const cached = await cache.get(key);

  // Always check cache before calling any provider (§5).
  if (isFresh(cached, now, ttlMs)) {
    return {
      sport,
      body: { events: cached.value, stale: false, error: null, lastUpdated: new Date(cached.storedAt).toISOString() },
    };
  }

  try {
    const events = await adapter.fetchEvents({
      sport,
      providerSportKey: entryConfig.providerSportKey,
      from,
      to,
    });
    events.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
    await cache.put(key, events, now);
    return {
      sport,
      body: { events, stale: false, error: null, lastUpdated: new Date(now).toISOString() },
    };
  } catch (err) {
    logger.error(`[schedule] provider error for ${sport}: ${err.message}`);
    // Provider down but we have an older copy: serve it, flagged stale (§5).
    if (isServable(cached, now)) {
      return {
        sport,
        body: { events: cached.value, stale: true, error: null, lastUpdated: new Date(cached.storedAt).toISOString() },
      };
    }
    return {
      sport,
      body: { events: [], stale: false, error: 'Schedule temporarily unavailable', lastUpdated: null },
    };
  }
}
