// Date/time formatting via the browser's Intl API — the user's time zone is
// detected automatically, never asked for (§6). `timeZone`/`locale` are
// overridable so tests can verify rendering across zones (§9.7).

/** Local calendar day key (YYYY-MM-DD) for grouping events by day. */
export function localDayKey(isoUtc, { timeZone, locale = 'en-CA' } = {}) {
  // en-CA formats as YYYY-MM-DD, which sorts correctly as a string.
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(isoUtc));
}

/** Day heading like "Fri 18 Jul". */
export function formatDayHeading(isoUtc, { timeZone, locale } = {}) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(isoUtc));
}

/** Event time like "3:00 PM GMT+5:30" / locale equivalent. */
export function formatEventTime(isoUtc, { timeZone, locale } = {}) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(isoUtc));
}

/** "2 hours ago"-style age string for stale-cache notes. */
export function hoursAgo(isoTimestamp, nowMs = Date.now()) {
  const ageMs = nowMs - Date.parse(isoTimestamp);
  const hours = Math.max(0, Math.round(ageMs / 3_600_000));
  if (hours === 0) return 'less than an hour ago';
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}
