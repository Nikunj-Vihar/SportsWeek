// Query parameter validation for the proxy (§7). Reject or clamp everything
// before any upstream provider is contacted.

import { isKnownSport } from './registry.js';

export const MAX_RANGE_DAYS = 31;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Reject dates like 2026-02-31 that Date.parse silently rolls over.
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  return roundTrip === value ? ms : null;
}

function toDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Validate and normalize the /api/schedule query parameters.
 * Returns { ok: true, sports, from, to } or { ok: false, status, error }.
 *
 * Rules:
 * - `sports`: comma-separated canonical names; every name must exist in the
 *   registry, otherwise the request is rejected (no silent dropping).
 * - `from`/`to`: YYYY-MM-DD; default to today → today+6 (UTC) when absent.
 * - `to` < `from` is rejected; ranges longer than MAX_RANGE_DAYS are clamped.
 * - Dates outside [today - 366d, today + 366d] are rejected as unreasonable.
 */
export function validateQuery({ sports, from, to }, now = Date.now()) {
  if (typeof sports !== 'string' || sports.trim() === '') {
    return { ok: false, status: 400, error: 'Missing required parameter: sports' };
  }
  const names = [...new Set(sports.split(',').map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) {
    return { ok: false, status: 400, error: 'No sports specified' };
  }
  if (names.length > 50) {
    return { ok: false, status: 400, error: 'Too many sports requested' };
  }
  const unknown = names.filter((name) => !isKnownSport(name));
  if (unknown.length > 0) {
    return { ok: false, status: 400, error: `Unknown sport(s): ${unknown.join(', ')}` };
  }

  const todayMs = Math.floor(now / DAY_MS) * DAY_MS;
  let fromMs;
  let toMs;

  if (from === undefined || from === null || from === '') {
    fromMs = todayMs;
  } else {
    fromMs = parseDateOnly(from);
    if (fromMs === null) return { ok: false, status: 400, error: `Invalid from date: expected YYYY-MM-DD` };
  }
  if (to === undefined || to === null || to === '') {
    toMs = fromMs + 6 * DAY_MS;
  } else {
    toMs = parseDateOnly(to);
    if (toMs === null) return { ok: false, status: 400, error: `Invalid to date: expected YYYY-MM-DD` };
  }

  if (toMs < fromMs) {
    return { ok: false, status: 400, error: '`to` must not be before `from`' };
  }
  const yearMs = 366 * DAY_MS;
  if (fromMs < todayMs - yearMs || fromMs > todayMs + yearMs) {
    return { ok: false, status: 400, error: '`from` is unreasonably far from today' };
  }
  // Clamp (not reject) oversized ranges, per spec.
  if (toMs - fromMs > (MAX_RANGE_DAYS - 1) * DAY_MS) {
    toMs = fromMs + (MAX_RANGE_DAYS - 1) * DAY_MS;
  }

  return { ok: true, sports: names, from: toDateString(fromMs), to: toDateString(toMs) };
}

/** List of YYYY-MM-DD strings covering [from, to] inclusive. */
export function datesInRange(from, to) {
  const out = [];
  let ms = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (ms === null || end === null) return out;
  for (; ms <= end; ms += DAY_MS) out.push(toDateString(ms));
  return out;
}
