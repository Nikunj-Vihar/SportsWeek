// §9.3 — Cache behavior: a hit must not call upstream; a provider failure
// with a cache present must serve stale instead of failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSchedule } from '../worker/src/schedule.js';
import { MemoryCache, CACHE_TTL_MS } from '../worker/src/cache.js';
import { silentLogger } from './helpers.js';

const EVENT = {
  id: 'thesportsdb-1',
  sport: 'Cricket',
  competition: 'Test League',
  eventName: 'A vs B',
  startTimeUtc: '2026-07-18T09:30:00Z',
  participants: ['A', 'B'],
  sourceProvider: 'thesportsdb',
};

function countingAdapter({ fail = false } = {}) {
  const adapter = {
    name: 'thesportsdb',
    calls: 0,
    async fetchEvents() {
      adapter.calls += 1;
      if (fail) throw new Error('provider down');
      return [EVENT];
    },
  };
  return adapter;
}

const baseArgs = { sports: ['Cricket'], from: '2026-07-15', to: '2026-07-21', logger: silentLogger };
const T0 = Date.parse('2026-07-15T08:00:00Z');

test('cache hit does not call the upstream provider', async () => {
  const cache = new MemoryCache();
  const adapter = countingAdapter();
  const adapters = { thesportsdb: adapter };

  const first = await getSchedule({ ...baseArgs, adapters, cache, now: T0 });
  assert.equal(adapter.calls, 1);
  assert.equal(first.sports.Cricket.stale, false);
  assert.equal(first.sports.Cricket.events.length, 1);

  const second = await getSchedule({ ...baseArgs, adapters, cache, now: T0 + 60_000 });
  assert.equal(adapter.calls, 1, 'second request within TTL must be served from cache');
  assert.deepEqual(second.sports.Cricket.events, first.sports.Cricket.events);
});

test('expired cache refetches from the provider', async () => {
  const cache = new MemoryCache();
  const adapter = countingAdapter();
  await getSchedule({ ...baseArgs, adapters: { thesportsdb: adapter }, cache, now: T0 });
  await getSchedule({ ...baseArgs, adapters: { thesportsdb: adapter }, cache, now: T0 + CACHE_TTL_MS + 1 });
  assert.equal(adapter.calls, 2);
});

test('provider failure with a cache present serves stale:true, not an error', async () => {
  const cache = new MemoryCache();
  await getSchedule({ ...baseArgs, adapters: { thesportsdb: countingAdapter() }, cache, now: T0 });

  const later = T0 + CACHE_TTL_MS + 1; // cache expired, provider now failing
  const result = await getSchedule({ ...baseArgs, adapters: { thesportsdb: countingAdapter({ fail: true }) }, cache, now: later });

  const cricket = result.sports.Cricket;
  assert.equal(cricket.stale, true);
  assert.equal(cricket.error, null);
  assert.equal(cricket.events.length, 1);
  assert.equal(cricket.lastUpdated, new Date(T0).toISOString());
});

test('provider failure with no cache reports a per-sport error, not a thrown one', async () => {
  const cache = new MemoryCache();
  const result = await getSchedule({ ...baseArgs, adapters: { thesportsdb: countingAdapter({ fail: true }) }, cache, now: T0 });
  const cricket = result.sports.Cricket;
  assert.equal(cricket.stale, false);
  assert.deepEqual(cricket.events, []);
  assert.ok(cricket.error);
});
