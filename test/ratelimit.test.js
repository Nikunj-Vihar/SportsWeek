// §9.5 — Rate limit: a rapid burst from one source is throttled; other
// sources are unaffected; the window actually slides.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SlidingWindowRateLimiter } from '../worker/src/ratelimit.js';
import { createApi } from '../worker/src/api.js';
import { MemoryCache } from '../worker/src/cache.js';
import { silentLogger } from './helpers.js';

test('burst beyond the limit is blocked, then allowed after the window slides', () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 60_000 });
  const t = 1_000_000;

  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.check('1.2.3.4', t + i).allowed, true);
  }
  const blocked = limiter.check('1.2.3.4', t + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  // A different source is not affected.
  assert.equal(limiter.check('5.6.7.8', t + 10).allowed, true);

  // Once the earliest hits slide out of the window, requests flow again.
  assert.equal(limiter.check('1.2.3.4', t + 60_001).allowed, true);
});

test('API returns 429 with Retry-After for a burst from one IP', async () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 60_000 });
  const api = createApi({
    adapters: {},
    cache: new MemoryCache(),
    limiter,
    logger: silentLogger,
  });

  const params = new URLSearchParams();
  let last;
  for (let i = 0; i < 5; i++) {
    last = await api.handle('/api/sports', params, '9.9.9.9');
  }
  assert.equal(last.status, 429);
  assert.ok(last.retryAfterSeconds >= 1);
  assert.match(last.body.error, /too many/i);

  // Another IP still gets through.
  const other = await api.handle('/api/sports', params, '8.8.8.8');
  assert.equal(other.status, 200);
});
