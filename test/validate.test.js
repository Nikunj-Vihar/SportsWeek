// §9.4 — Input validation: reject or safely clamp hostile/invalid params
// before any provider call.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateQuery, datesInRange, MAX_RANGE_DAYS } from '../worker/src/validate.js';

const NOW = Date.parse('2026-07-15T10:00:00Z');

test('valid request passes through', () => {
  const r = validateQuery({ sports: 'Cricket,Formula 1', from: '2026-07-15', to: '2026-07-21' }, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.sports, ['Cricket', 'Formula 1']);
  assert.equal(r.from, '2026-07-15');
  assert.equal(r.to, '2026-07-21');
});

test('missing dates default to today → +6 days', () => {
  const r = validateQuery({ sports: 'Cricket' }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.from, '2026-07-15');
  assert.equal(r.to, '2026-07-21');
});

test('unknown sport keys are rejected', () => {
  const r = validateQuery({ sports: 'Cricket,Quidditch' }, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /Quidditch/);
});

test('injection-style strings are rejected as unknown sports', () => {
  for (const evil of [
    "Cricket'; DROP TABLE users;--",
    '{"$gt": ""}',
    '<script>alert(1)</script>',
    '../../etc/passwd',
  ]) {
    const r = validateQuery({ sports: evil }, NOW);
    assert.equal(r.ok, false, `should reject: ${evil}`);
    assert.equal(r.status, 400);
  }
});

test('injection-style and malformed dates are rejected', () => {
  for (const evil of ["2026-07-15' OR '1'='1", 'not-a-date', '2026-13-45', '2026-02-31', '20260715']) {
    const r = validateQuery({ sports: 'Cricket', from: evil, to: '2026-07-21' }, NOW);
    assert.equal(r.ok, false, `should reject from=${evil}`);
    assert.equal(r.status, 400);
  }
});

test('to before from is rejected', () => {
  const r = validateQuery({ sports: 'Cricket', from: '2026-07-21', to: '2026-07-15' }, NOW);
  assert.equal(r.ok, false);
});

test('absurdly large ranges are clamped to the cap, not rejected', () => {
  const r = validateQuery({ sports: 'Cricket', from: '2026-07-15', to: '2026-12-31' }, NOW);
  assert.equal(r.ok, true);
  const days = datesInRange(r.from, r.to).length;
  assert.equal(days, MAX_RANGE_DAYS);
});

test('dates unreasonably far from today are rejected', () => {
  assert.equal(validateQuery({ sports: 'Cricket', from: '2031-01-01', to: '2031-01-07' }, NOW).ok, false);
  assert.equal(validateQuery({ sports: 'Cricket', from: '1999-01-01', to: '1999-01-07' }, NOW).ok, false);
});

test('missing or empty sports parameter is rejected', () => {
  assert.equal(validateQuery({}, NOW).ok, false);
  assert.equal(validateQuery({ sports: '' }, NOW).ok, false);
  assert.equal(validateQuery({ sports: ',,,' }, NOW).ok, false);
});

test('duplicate sports are de-duplicated', () => {
  const r = validateQuery({ sports: 'Cricket,Cricket,Cricket' }, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.sports, ['Cricket']);
});

test('datesInRange is inclusive of both endpoints', () => {
  assert.deepEqual(datesInRange('2026-07-15', '2026-07-17'), ['2026-07-15', '2026-07-16', '2026-07-17']);
  assert.deepEqual(datesInRange('2026-07-15', '2026-07-15'), ['2026-07-15']);
});
