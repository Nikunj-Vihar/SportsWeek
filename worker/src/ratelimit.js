// Per-IP sliding-window rate limiter (§7). In-memory: state lives per Worker
// isolate / per dev-server process, which is enough to stop a single source
// from hammering upstream providers through us.

export class SlidingWindowRateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.limit     max requests per window per key
   * @param {number} opts.windowMs  window length in milliseconds
   */
  constructor({ limit = 30, windowMs = 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> array of timestamps (ms)
  }

  /**
   * Record an attempt from `key`. Returns { allowed, retryAfterSeconds }.
   */
  check(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }
    // Drop entries that slid out of the window.
    while (timestamps.length > 0 && timestamps[0] <= cutoff) timestamps.shift();

    if (timestamps.length >= this.limit) {
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    timestamps.push(now);

    // Opportunistic cleanup so the map can't grow without bound.
    if (this.hits.size > 10_000) {
      for (const [k, ts] of this.hits) {
        if (ts.length === 0 || ts[ts.length - 1] <= cutoff) this.hits.delete(k);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
