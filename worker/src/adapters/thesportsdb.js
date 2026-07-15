// TheSportsDB adapter (§4). Free tier, key required (the public demo key "3"
// works for development; a real key must live in env / Worker secrets only).
//
// Endpoint used: /api/v1/json/{KEY}/eventsday.php?d=YYYY-MM-DD&s={sport}
// TheSportsDB documents dateEvent/strTime/strTimestamp as UTC.

import { filterValidEvents } from '../schema.js';
import { datesInRange } from '../validate.js';

const PROVIDER = 'thesportsdb';

function toUtcIso(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  // strTimestamp looks like "2026-07-18T09:30:00" (UTC, no zone marker).
  const candidate = /Z$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(candidate);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function normalizeEvent(rawEvent, sport, logger) {
  if (rawEvent === null || typeof rawEvent !== 'object') return null;
  const id = rawEvent.idEvent;
  if (typeof id !== 'string' || id === '') {
    logger.warn(`[${PROVIDER}] skipping event without idEvent`);
    return null;
  }

  const startTimeUtc =
    toUtcIso(rawEvent.strTimestamp) ??
    (typeof rawEvent.dateEvent === 'string'
      ? toUtcIso(`${rawEvent.dateEvent}T${rawEvent.strTime || '00:00:00'}`)
      : null);
  if (startTimeUtc === null) {
    logger.warn(`[${PROVIDER}] skipping event ${id}: no usable start time`);
    return null;
  }

  const participants = [rawEvent.strHomeTeam, rawEvent.strAwayTeam].filter(
    (p) => typeof p === 'string' && p !== ''
  );

  return {
    id: `${PROVIDER}-${id}`,
    sport,
    competition:
      (typeof rawEvent.strLeague === 'string' && rawEvent.strLeague) ||
      (typeof rawEvent.strEvent === 'string' && rawEvent.strEvent) ||
      'Unknown competition',
    eventName:
      (typeof rawEvent.strEvent === 'string' && rawEvent.strEvent) || 'Event',
    startTimeUtc,
    participants,
    sourceProvider: PROVIDER,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey     TheSportsDB API key (from env only)
 * @param {Function} [opts.fetchImpl]  injectable fetch for tests
 * @param {object} [opts.logger]
 * @param {number} [opts.timeoutMs]
 */
export function createTheSportsDbAdapter({ apiKey, fetchImpl = fetch, logger = console, timeoutMs = 15_000 }) {
  if (!apiKey) throw new Error('TheSportsDB adapter requires an API key');

  async function fetchDay(providerSportKey, date) {
    const url =
      `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(apiKey)}` +
      `/eventsday.php?d=${encodeURIComponent(date)}&s=${encodeURIComponent(providerSportKey)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`TheSportsDB responded ${res.status} for ${providerSportKey} ${date}`);
    const data = await res.json();
    // The API returns {"events": null} when a day has no events.
    if (data === null || typeof data !== 'object' || !Array.isArray(data.events)) return [];
    return data.events;
  }

  return {
    name: PROVIDER,

    /**
     * Fetch events for one sport across [from, to]. Malformed provider items
     * are logged and dropped, never thrown. A failed/timed-out HTTP call for
     * any day rejects, letting the caller fall back to cache (§5).
     */
    async fetchEvents({ sport, providerSportKey, from, to }) {
      const days = datesInRange(from, to);
      const perDay = await Promise.all(days.map((d) => fetchDay(providerSportKey, d)));
      const normalized = [];
      for (const rawEvents of perDay) {
        for (const rawEvent of rawEvents) {
          const event = normalizeEvent(rawEvent, sport, logger);
          if (event) normalized.push(event);
        }
      }
      return filterValidEvents(normalized, logger);
    },
  };
}
