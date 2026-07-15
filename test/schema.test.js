// §9.2 — Schema validation: every adapter's mocked output must pass the
// SportEvent validator, so no adapter can ever hand the frontend a malformed
// event.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSportEvent } from '../worker/src/schema.js';
import { createTheSportsDbAdapter } from '../worker/src/adapters/thesportsdb.js';
import { createJolpicaAdapter } from '../worker/src/adapters/jolpica.js';
import { loadFixture, fetchStub, silentLogger } from './helpers.js';

test('every adapter output event validates against the SportEvent schema', async () => {
  const cases = [
    ['thesportsdb-normal.json', (f) => createTheSportsDbAdapter({ apiKey: 'k', fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-18', to: '2026-07-18' }],
    ['thesportsdb-malformed.json', (f) => createTheSportsDbAdapter({ apiKey: 'k', fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-18', to: '2026-07-18' }],
    ['thesportsdb-empty.json', (f) => createTheSportsDbAdapter({ apiKey: 'k', fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-18', to: '2026-07-18' }],
    ['jolpica-normal.json', (f) => createJolpicaAdapter({ fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Formula 1', from: '2026-07-01', to: '2026-07-31' }],
    ['jolpica-malformed.json', (f) => createJolpicaAdapter({ fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Formula 1', from: '2026-07-01', to: '2026-07-31' }],
    ['jolpica-empty.json', (f) => createJolpicaAdapter({ fetchImpl: fetchStub(f), logger: silentLogger }), { sport: 'Formula 1', from: '2026-07-01', to: '2026-07-31' }],
  ];

  for (const [fixtureName, makeAdapter, args] of cases) {
    const fixture = await loadFixture(fixtureName);
    const events = await makeAdapter(fixture).fetchEvents(args);
    for (const event of events) {
      const problems = validateSportEvent(event);
      assert.deepEqual(problems, [], `${fixtureName}: event ${event?.id} invalid: ${problems.join('; ')}`);
    }
  }
});

test('validator rejects malformed events', () => {
  assert.ok(validateSportEvent(null).length > 0);
  assert.ok(validateSportEvent({}).length > 0);
  assert.ok(validateSportEvent({
    id: 'x-1', sport: 'Cricket', competition: 'C', eventName: 'E',
    startTimeUtc: '2026-07-18 09:30', // not ISO UTC
    participants: [], sourceProvider: 'x',
  }).length > 0);
  assert.ok(validateSportEvent({
    id: 'x-1', sport: 'Cricket', competition: 'C', eventName: 'E',
    startTimeUtc: '2026-07-18T09:30:00Z',
    participants: [42], // non-string participant
    sourceProvider: 'x',
  }).length > 0);
  assert.ok(validateSportEvent({
    id: 'x-1', sport: 'Cricket', competition: 'C', eventName: 'E',
    startTimeUtc: '2026-07-18T09:30:00Z',
    participants: [], sourceProvider: 'x',
    surprise: true, // unexpected field
  }).length > 0);
});

test('validator accepts a canonical event', () => {
  assert.deepEqual(validateSportEvent({
    id: 'thesportsdb-123456',
    sport: 'Cricket',
    competition: 'IND vs ENG ODI Series',
    eventName: '3rd ODI',
    startTimeUtc: '2026-07-18T14:30:00Z',
    participants: ['India', 'England'],
    sourceProvider: 'thesportsdb',
  }), []);
});
