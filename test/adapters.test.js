// §9.1 — Adapter unit tests against saved mock provider responses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTheSportsDbAdapter } from '../worker/src/adapters/thesportsdb.js';
import { createJolpicaAdapter } from '../worker/src/adapters/jolpica.js';
import { loadFixture, fetchStub, silentLogger } from './helpers.js';

// ---------- TheSportsDB ----------

test('thesportsdb: normalizes a normal response into SportEvents', async () => {
  const fixture = await loadFixture('thesportsdb-normal.json');
  const adapter = createTheSportsDbAdapter({ apiKey: 'testkey', fetchImpl: fetchStub(fixture), logger: silentLogger });

  const events = await adapter.fetchEvents({ sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-18', to: '2026-07-18' });

  assert.equal(events.length, 3);
  const [first] = events;
  assert.equal(first.id, 'thesportsdb-2482724');
  assert.equal(first.sport, 'Cricket');
  assert.equal(first.competition, 'Lanka Premier League');
  assert.equal(first.eventName, 'Dambulla Sixers vs Kandy Royals');
  assert.equal(first.startTimeUtc, '2026-07-18T09:30:00Z');
  assert.deepEqual(first.participants, ['Dambulla Sixers', 'Kandy Royals']);
  assert.equal(first.sourceProvider, 'thesportsdb');

  // Third event has strTimestamp:null → falls back to dateEvent + strTime.
  const fallback = events.find((e) => e.id === 'thesportsdb-2490001');
  assert.equal(fallback.startTimeUtc, '2026-07-18T10:30:00Z');
});

test('thesportsdb: empty response ({"events":null}) yields []', async () => {
  const fixture = await loadFixture('thesportsdb-empty.json');
  const adapter = createTheSportsDbAdapter({ apiKey: 'testkey', fetchImpl: fetchStub(fixture), logger: silentLogger });
  const events = await adapter.fetchEvents({ sport: 'Tennis', providerSportKey: 'Tennis', from: '2026-07-18', to: '2026-07-18' });
  assert.deepEqual(events, []);
});

test('thesportsdb: malformed items are dropped without crashing, valid ones kept', async () => {
  const fixture = await loadFixture('thesportsdb-malformed.json');
  const adapter = createTheSportsDbAdapter({ apiKey: 'testkey', fetchImpl: fetchStub(fixture), logger: silentLogger });
  const events = await adapter.fetchEvents({ sport: 'Football (Soccer)', providerSportKey: 'Soccer', from: '2026-07-18', to: '2026-07-18' });

  // Fixture contains 1 fully valid event, 1 missing id, 1 with no usable
  // time, 1 with null/number fields (still salvageable: has id+date+time),
  // plus null and a bare string.
  const ids = events.map((e) => e.id);
  assert.ok(ids.includes('thesportsdb-3000001'));
  assert.ok(!ids.some((id) => id.includes('3000003')), 'event without usable time must be dropped');
  for (const event of events) {
    assert.equal(typeof event.startTimeUtc, 'string');
    assert.ok(!Number.isNaN(Date.parse(event.startTimeUtc)));
  }
});

test('thesportsdb: one fetch per day in range', async () => {
  const fixture = await loadFixture('thesportsdb-empty.json');
  const fetchImpl = fetchStub(fixture);
  const adapter = createTheSportsDbAdapter({ apiKey: 'testkey', fetchImpl, logger: silentLogger });
  await adapter.fetchEvents({ sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-15', to: '2026-07-21' });
  assert.equal(fetchImpl.calls, 7);
});

test('thesportsdb: HTTP error rejects (so the caller can serve stale cache)', async () => {
  const adapter = createTheSportsDbAdapter({ apiKey: 'testkey', fetchImpl: fetchStub({}, { status: 429 }), logger: silentLogger });
  await assert.rejects(
    adapter.fetchEvents({ sport: 'Cricket', providerSportKey: 'Cricket', from: '2026-07-18', to: '2026-07-18' }),
    /429/
  );
});

// ---------- Jolpica ----------

test('jolpica: expands races into per-session SportEvents within range', async () => {
  const fixture = await loadFixture('jolpica-normal.json');
  const adapter = createJolpicaAdapter({ fetchImpl: fetchStub(fixture), logger: silentLogger });

  const events = await adapter.fetchEvents({ sport: 'Formula 1', from: '2026-07-17', to: '2026-07-19' });

  // Belgian GP: FP1, FP2 (Jul 17), FP3, Quali (Jul 18), Race (Jul 19).
  // Hungarian GP sessions are outside the range and must be excluded.
  assert.equal(events.length, 5);
  assert.ok(events.every((e) => e.competition === 'Belgian Grand Prix'));
  const race = events.find((e) => e.eventName === 'Race');
  assert.equal(race.id, 'jolpica-2026-r13-race');
  assert.equal(race.startTimeUtc, '2026-07-19T13:00:00Z');
  assert.equal(race.sourceProvider, 'jolpica');
  // Sorted chronologically.
  const times = events.map((e) => e.startTimeUtc);
  assert.deepEqual(times, [...times].sort());
});

test('jolpica: empty season yields []', async () => {
  const fixture = await loadFixture('jolpica-empty.json');
  const adapter = createJolpicaAdapter({ fetchImpl: fetchStub(fixture), logger: silentLogger });
  const events = await adapter.fetchEvents({ sport: 'Formula 1', from: '2026-07-17', to: '2026-07-19' });
  assert.deepEqual(events, []);
});

test('jolpica: malformed races/sessions are dropped without crashing', async () => {
  const fixture = await loadFixture('jolpica-malformed.json');
  const adapter = createJolpicaAdapter({ fetchImpl: fetchStub(fixture), logger: silentLogger });
  const events = await adapter.fetchEvents({ sport: 'Formula 1', from: '2026-07-17', to: '2026-07-19' });

  // Only the Belgian GP race (valid date) and the Dutch GP qualifying (valid
  // session inside a race with a null race date) should survive.
  const ids = events.map((e) => e.id).sort();
  assert.deepEqual(ids, ['jolpica-2026-r13-race', 'jolpica-2026-r15-qualifying']);
});

test('jolpica: HTTP error rejects', async () => {
  const adapter = createJolpicaAdapter({ fetchImpl: fetchStub({}, { status: 500 }), logger: silentLogger });
  await assert.rejects(adapter.fetchEvents({ sport: 'Formula 1', from: '2026-07-17', to: '2026-07-19' }), /500/);
});
