// Common event schema (§3). Every adapter must return events in exactly this
// shape so the frontend never needs to know which provider an event came from.
//
// type SportEvent = {
//   id: string;              // provider-prefixed unique id, e.g. "thesportsdb-123456"
//   sport: string;           // canonical sport name from the sport registry
//   competition: string;     // e.g. "IND vs ENG ODI Series", "Belgian Grand Prix"
//   eventName: string;       // e.g. "3rd ODI", "Race"
//   startTimeUtc: string;    // ISO 8601, UTC
//   participants: string[];  // team/player names, best effort
//   sourceProvider: string;  // for debugging/logging only
// };

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Validate a single SportEvent. Returns a list of problems (empty = valid).
 */
export function validateSportEvent(event) {
  const problems = [];
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return ['event is not an object'];
  }
  const requireString = (field) => {
    if (typeof event[field] !== 'string' || event[field].length === 0) {
      problems.push(`${field} must be a non-empty string`);
    }
  };
  requireString('id');
  requireString('sport');
  requireString('competition');
  requireString('eventName');
  requireString('sourceProvider');

  if (typeof event.startTimeUtc !== 'string' || !ISO_UTC_RE.test(event.startTimeUtc)) {
    problems.push('startTimeUtc must be an ISO 8601 UTC string like 2026-07-18T14:30:00Z');
  } else if (Number.isNaN(Date.parse(event.startTimeUtc))) {
    problems.push('startTimeUtc does not parse to a valid date');
  }

  if (!Array.isArray(event.participants) || event.participants.some((p) => typeof p !== 'string')) {
    problems.push('participants must be an array of strings');
  }

  const allowed = new Set(['id', 'sport', 'competition', 'eventName', 'startTimeUtc', 'participants', 'sourceProvider']);
  for (const key of Object.keys(event)) {
    if (!allowed.has(key)) problems.push(`unexpected field: ${key}`);
  }
  return problems;
}

export function isValidSportEvent(event) {
  return validateSportEvent(event).length === 0;
}

/**
 * Keep only valid events; report dropped ones through the logger instead of
 * crashing or letting malformed events reach the frontend.
 */
export function filterValidEvents(events, logger = console) {
  if (!Array.isArray(events)) return [];
  const valid = [];
  for (const event of events) {
    const problems = validateSportEvent(event);
    if (problems.length === 0) {
      valid.push(event);
    } else {
      logger.warn(`[schema] dropping malformed event: ${problems.join('; ')}`);
    }
  }
  return valid;
}
