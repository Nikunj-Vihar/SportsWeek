// Jolpica-F1 adapter (§4). Free, no key required. Ergast-compatible API.
// Endpoint: https://api.jolpi.ca/ergast/f1/{season}/races/?format=json
// Race + session times are documented as UTC ("time": "04:00:00Z").

import { filterValidEvents } from '../schema.js';

const PROVIDER = 'jolpica';

const SESSION_FIELDS = [
  ['FirstPractice', 'First Practice'],
  ['SecondPractice', 'Second Practice'],
  ['ThirdPractice', 'Third Practice'],
  ['SprintQualifying', 'Sprint Qualifying'],
  ['Sprint', 'Sprint'],
  ['Qualifying', 'Qualifying'],
];

function sessionToIso(dateStr, timeStr) {
  if (typeof dateStr !== 'string' || dateStr === '') return null;
  const time = typeof timeStr === 'string' && timeStr !== '' ? timeStr : '00:00:00Z';
  const ms = Date.parse(`${dateStr}T${time.endsWith('Z') ? time : `${time}Z`}`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function raceToEvents(race, sport, logger) {
  if (race === null || typeof race !== 'object') return [];
  const raceName = typeof race.raceName === 'string' && race.raceName ? race.raceName : null;
  if (!raceName || typeof race.round !== 'string') {
    logger.warn(`[${PROVIDER}] skipping malformed race entry`);
    return [];
  }
  const season = typeof race.season === 'string' ? race.season : 'unknown';
  const events = [];
  const push = (sessionName, iso, suffix) => {
    if (iso === null) return;
    events.push({
      id: `${PROVIDER}-${season}-r${race.round}-${suffix}`,
      sport,
      competition: raceName,
      eventName: sessionName,
      startTimeUtc: iso,
      participants: [],
      sourceProvider: PROVIDER,
    });
  };

  for (const [field, label] of SESSION_FIELDS) {
    const session = race[field];
    if (session && typeof session === 'object') {
      push(label, sessionToIso(session.date, session.time), field.toLowerCase());
    }
  }
  push('Race', sessionToIso(race.date, race.time), 'race');
  return events;
}

/**
 * @param {object} opts
 * @param {Function} [opts.fetchImpl]  injectable fetch for tests
 * @param {object} [opts.logger]
 * @param {number} [opts.timeoutMs]
 */
export function createJolpicaAdapter({ fetchImpl = fetch, logger = console, timeoutMs = 15_000 } = {}) {
  async function fetchSeason(year) {
    const url = `https://api.jolpi.ca/ergast/f1/${year}/races/?format=json&limit=100`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Jolpica responded ${res.status} for season ${year}`);
    const data = await res.json();
    const races = data?.MRData?.RaceTable?.Races;
    if (!Array.isArray(races)) {
      logger.warn(`[${PROVIDER}] unexpected response shape for season ${year}`);
      return [];
    }
    return races;
  }

  return {
    name: PROVIDER,

    /** Fetch every F1 session (practice/quali/sprint/race) within [from, to]. */
    async fetchEvents({ sport, from, to }) {
      const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
      const seasons = await Promise.all(years.map((y) => fetchSeason(y)));

      const fromMs = Date.parse(`${from}T00:00:00Z`);
      const toMs = Date.parse(`${to}T23:59:59Z`);
      const events = [];
      for (const races of seasons) {
        for (const race of races) {
          for (const event of raceToEvents(race, sport, logger)) {
            const ms = Date.parse(event.startTimeUtc);
            if (ms >= fromMs && ms <= toMs) events.push(event);
          }
        }
      }
      events.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
      return filterValidEvents(events, logger);
    },
  };
}
