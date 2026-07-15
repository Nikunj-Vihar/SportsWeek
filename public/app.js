import { API_BASE } from './config.js';
import { localDayKey, formatDayHeading, formatEventTime, hoursAgo } from './format.js';

const STORAGE_KEY = 'sportsweek:selectedSports';

const el = {
  search: document.getElementById('sport-search'),
  groups: document.getElementById('sport-groups'),
  presets: document.querySelectorAll('.preset'),
  from: document.getElementById('date-from'),
  to: document.getElementById('date-to'),
  apply: document.getElementById('apply-range'),
  notes: document.getElementById('notes'),
  results: document.getElementById('results'),
};

const state = {
  allSports: [],                       // [{name, category}]
  selected: loadSelection(),
  from: null,                          // YYYY-MM-DD (local)
  to: null,
  requestSeq: 0,
};

function loadSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return new Set(Array.isArray(raw) ? raw.filter((s) => typeof s === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSelection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected]));
}

/** Local (not UTC) YYYY-MM-DD, so "today" matches the user's calendar. */
function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setRange(fromDate, toDate) {
  state.from = localDateString(fromDate);
  state.to = localDateString(toDate);
  el.from.value = state.from;
  el.to.value = state.to;
}

/** Add calendar days in local time (DST-safe, unlike millisecond math). */
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function applyPreset(name) {
  const today = new Date();
  if (name === 'week') setRange(today, addDays(today, 6));
  if (name === 'nextweek') setRange(addDays(today, 7), addDays(today, 13));
  if (name === 'fortnight') setRange(today, addDays(today, 13));
  el.presets.forEach((b) => b.classList.toggle('active', b.dataset.preset === name));
}

// ---------- Sport picker ----------

async function loadSports() {
  try {
    const res = await fetch(`${API_BASE}/api/sports`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.allSports = data.sports;
    renderPicker();
  } catch (err) {
    el.groups.innerHTML = '';
    el.groups.appendChild(msg('Could not load the sport list. Is the API reachable?', 'error'));
    console.error(err);
  }
}

function renderPicker() {
  const query = el.search.value.trim().toLowerCase();
  const byCategory = new Map();
  for (const sport of state.allSports) {
    if (query && !sport.name.toLowerCase().includes(query)) continue;
    if (!byCategory.has(sport.category)) byCategory.set(sport.category, []);
    byCategory.get(sport.category).push(sport.name);
  }

  el.groups.innerHTML = '';
  if (byCategory.size === 0) {
    el.groups.appendChild(msg('No sports match your search.'));
    return;
  }
  for (const [category, names] of byCategory) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = category;
    fieldset.appendChild(legend);
    for (const name of names) {
      const label = document.createElement('label');
      label.className = 'sport-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = name;
      checkbox.checked = state.selected.has(name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(name);
        else state.selected.delete(name);
        saveSelection();
        scheduleRefresh();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${name}`));
      fieldset.appendChild(label);
    }
    el.groups.appendChild(fieldset);
  }
}

// ---------- Results ----------

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 350);
}

async function refresh() {
  el.notes.innerHTML = '';
  if (state.selected.size === 0) {
    el.results.innerHTML = '';
    el.results.appendChild(msg('Select at least one sport to see its schedule.'));
    return;
  }

  const seq = ++state.requestSeq;
  el.results.innerHTML = '';
  el.results.appendChild(msg('Loading schedule…'));

  const params = new URLSearchParams({
    sports: [...state.selected].join(','),
    from: state.from,
    to: state.to,
  });

  let data;
  try {
    const res = await fetch(`${API_BASE}/api/schedule?${params}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    if (seq !== state.requestSeq) return;
    el.results.innerHTML = '';
    el.results.appendChild(msg(`Could not load the schedule: ${err.message}`, 'error'));
    return;
  }
  if (seq !== state.requestSeq) return; // a newer request superseded this one
  renderResults(data);
}

function renderResults(data) {
  el.results.innerHTML = '';
  el.notes.innerHTML = '';

  const allEvents = [];
  const emptySports = [];
  const staleSports = [];
  const erroredSports = [];

  for (const [sport, entry] of Object.entries(data.sports)) {
    if (entry.error) erroredSports.push(sport);
    else if (entry.events.length === 0) emptySports.push(sport);
    else allEvents.push(...entry.events);
    if (entry.stale && entry.lastUpdated) staleSports.push({ sport, lastUpdated: entry.lastUpdated });
  }

  for (const { sport, lastUpdated } of staleSports) {
    el.notes.appendChild(msg(`${sport}: schedule last confirmed ${hoursAgo(lastUpdated)}.`, 'stale'));
  }
  for (const sport of erroredSports) {
    el.notes.appendChild(msg(`${sport}: schedule temporarily unavailable — try again in a bit.`, 'error'));
  }

  allEvents.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  const byDay = new Map();
  for (const event of allEvents) {
    const key = localDayKey(event.startTimeUtc);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }

  for (const [, events] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const section = document.createElement('section');
    section.className = 'day';
    const heading = document.createElement('h3');
    heading.textContent = formatDayHeading(events[0].startTimeUtc);
    section.appendChild(heading);
    const list = document.createElement('ul');
    for (const event of events) {
      const item = document.createElement('li');
      item.className = 'event';

      const sportTag = document.createElement('span');
      sportTag.className = 'sport-tag';
      sportTag.textContent = event.sport;

      // Matches read best as "A vs B (League)"; single-entity events as
      // "Grand Prix name (Race)".
      const title = document.createElement('span');
      title.className = 'event-title';
      const detail = event.participants.length >= 2
        ? `${event.eventName} · ${event.competition}`
        : (event.eventName && event.eventName !== event.competition
            ? `${event.competition} (${event.eventName})`
            : event.competition);
      title.textContent = detail;

      const time = document.createElement('span');
      time.className = 'event-time';
      time.textContent = formatEventTime(event.startTimeUtc);

      item.append(sportTag, title, time);
      list.appendChild(item);
    }
    section.appendChild(list);
    el.results.appendChild(section);
  }

  if (byDay.size === 0 && emptySports.length === 0 && erroredSports.length > 0) {
    el.results.appendChild(msg('No schedule data available right now.'));
  }

  // Sports with zero events are listed explicitly, never silently dropped (§6).
  for (const sport of emptySports) {
    el.results.appendChild(msg(`No ${sport} events in this date range.`, 'empty'));
  }
}

function msg(text, kind = 'muted') {
  const p = document.createElement('p');
  p.className = kind === 'muted' ? 'muted' : `note ${kind}`;
  p.textContent = text;
  return p;
}

// ---------- Wire up ----------

el.search.addEventListener('input', renderPicker);
el.presets.forEach((button) =>
  button.addEventListener('click', () => {
    applyPreset(button.dataset.preset);
    scheduleRefresh();
  })
);
el.apply.addEventListener('click', () => {
  if (!el.from.value || !el.to.value) return;
  state.from = el.from.value;
  state.to = el.to.value;
  el.presets.forEach((b) => b.classList.remove('active'));
  scheduleRefresh();
});

applyPreset('week');
loadSports().then(refresh);
