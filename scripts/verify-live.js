#!/usr/bin/env node
// §9.8 — Manual verification pass: for every sport in the registry, confirm
// at least one real event returns correctly from the LIVE provider (no
// mocks), normalized through the real adapters and validated against the
// SportEvent schema. Run before shipping any registry change:
//
//   npm run verify:live
//
// Throttled to stay under TheSportsDB's free-tier rate limit (~30 req/min).
// Off-season sports are retried on a few future sample dates before being
// reported as unverified.

import { REGISTRY } from '../worker/src/registry.js';
import { createTheSportsDbAdapter } from '../worker/src/adapters/thesportsdb.js';
import { createJolpicaAdapter } from '../worker/src/adapters/jolpica.js';
import { validateSportEvent } from '../worker/src/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (offset) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

// Near window first (this week), then future sample windows for off-season
// sports. Each window is a [from, to] pair.
const WINDOWS = [
  [day(0), day(6)],
  [day(10), day(12)],
  [day(16), day(18)],
  [day(23), day(25)],
  [day(30), day(32)],
  [day(65), day(67)],
  [day(90), day(93)],
  [day(120), day(123)],
  [day(150), day(153)],
];

const adapters = {
  thesportsdb: createTheSportsDbAdapter({ apiKey: process.env.THESPORTSDB_KEY || '3' }),
  jolpica: createJolpicaAdapter({}),
};

// TheSportsDB free tier: ~30 requests/minute. Each (sport, window) costs
// windowDays requests, so pace them.
const THROTTLE_MS = 2500;

let failures = 0;

for (const [sport, config] of Object.entries(REGISTRY)) {
  const adapter = adapters[config.adapter];
  let verified = null;
  let lastError = null;

  for (const [from, to] of WINDOWS) {
    try {
      const events = await adapter.fetchEvents({ sport, providerSportKey: config.providerSportKey, from, to });
      if (config.adapter === 'thesportsdb') {
        const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
        await sleep(THROTTLE_MS * days);
      } else {
        await sleep(500);
      }
      if (events.length > 0) {
        const problems = validateSportEvent(events[0]);
        if (problems.length > 0) {
          lastError = `schema problems: ${problems.join('; ')}`;
          continue;
        }
        verified = { from, to, event: events[0], count: events.length };
        break;
      }
    } catch (err) {
      lastError = err.message;
      await sleep(THROTTLE_MS);
    }
  }

  if (verified) {
    const { event } = verified;
    console.log(`PASS  ${sport.padEnd(20)} ${verified.from}..${verified.to}  ${String(verified.count).padStart(3)} events  e.g. "${event.eventName}" (${event.competition}) at ${event.startTimeUtc}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${sport.padEnd(20)} no live events found${lastError ? ` — last error: ${lastError}` : ''}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} sport(s) failed live verification. Remove them from the registry or investigate before shipping.`);
  process.exit(1);
}
console.log('\nAll registry sports verified against live providers.');
