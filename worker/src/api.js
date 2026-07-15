// Platform-neutral API layer shared by the Cloudflare Worker entry and the
// local Node dev server. Speaks in plain data ({ status, body }) so each host
// can wrap it in its own Response type.

import { listSports } from './registry.js';
import { validateQuery } from './validate.js';
import { getSchedule } from './schedule.js';

/**
 * @param {object} deps
 * @param {object} deps.adapters  adapter instances keyed by adapter name
 * @param {object} deps.cache     cache backend
 * @param {object} deps.limiter   SlidingWindowRateLimiter
 * @param {object} [deps.logger]
 */
export function createApi({ adapters, cache, limiter, logger = console }) {
  return {
    /**
     * @param {string} pathname       e.g. "/api/schedule"
     * @param {URLSearchParams} searchParams
     * @param {string} ip             client IP for rate limiting
     * @returns {Promise<{status: number, body: object, retryAfterSeconds?: number}>}
     */
    async handle(pathname, searchParams, ip) {
      const { allowed, retryAfterSeconds } = limiter.check(ip || 'unknown');
      if (!allowed) {
        return {
          status: 429,
          body: { error: 'Too many requests, slow down.' },
          retryAfterSeconds,
        };
      }

      if (pathname === '/api/sports') {
        return { status: 200, body: { sports: listSports() } };
      }

      if (pathname === '/api/schedule') {
        const validated = validateQuery({
          sports: searchParams.get('sports') ?? undefined,
          from: searchParams.get('from') ?? undefined,
          to: searchParams.get('to') ?? undefined,
        });
        if (!validated.ok) {
          return { status: validated.status, body: { error: validated.error } };
        }
        const body = await getSchedule({
          sports: validated.sports,
          from: validated.from,
          to: validated.to,
          adapters,
          cache,
          logger,
        });
        return { status: 200, body };
      }

      return { status: 404, body: { error: 'Not found' } };
    },
  };
}
