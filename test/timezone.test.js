// §9.7 — Time zone correctness: a known UTC timestamp must render correctly
// in at least two different time zones via the same Intl code paths the
// frontend uses (public/format.js is imported directly — no build step).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localDayKey, formatDayHeading, formatEventTime } from '../public/format.js';

// 2026-07-18 09:30 UTC = 15:00 IST (UTC+5:30) = 05:30 EDT (UTC-4).
const ISO = '2026-07-18T09:30:00Z';

test('event time renders correctly in Asia/Kolkata', () => {
  const rendered = formatEventTime(ISO, { timeZone: 'Asia/Kolkata', locale: 'en-US' });
  assert.match(rendered, /3:00 PM|3:00 PM/, `got: ${rendered}`);
});

test('event time renders correctly in America/New_York', () => {
  const rendered = formatEventTime(ISO, { timeZone: 'America/New_York', locale: 'en-US' });
  assert.match(rendered, /5:30 AM|5:30 AM/, `got: ${rendered}`);
});

test('an evening UTC event lands on different local days across zones', () => {
  const eveningUtc = '2026-07-18T20:00:00Z'; // 01:30 Jul 19 IST, 16:00 Jul 18 EDT
  assert.equal(localDayKey(eveningUtc, { timeZone: 'Asia/Kolkata' }), '2026-07-19');
  assert.equal(localDayKey(eveningUtc, { timeZone: 'America/New_York' }), '2026-07-18');
});

test('day headings follow the local calendar day', () => {
  const eveningUtc = '2026-07-18T20:00:00Z';
  assert.equal(formatDayHeading(eveningUtc, { timeZone: 'Asia/Kolkata', locale: 'en-GB' }), 'Sun 19 Jul');
  assert.equal(formatDayHeading(eveningUtc, { timeZone: 'America/New_York', locale: 'en-GB' }), 'Sat 18 Jul');
});
