import { API_BASE } from './config.js';
import { localDayKey, formatDayHeading, formatTimeShort, hoursAgo } from './format.js';
import { categoryIconSvg } from './icons.js';

const STORAGE_KEY = 'sportsweek:selectedSports';
const THEME_KEY = 'sportsweek:theme';

// The sport picker exists once (instantiated from <template>) and lives in
// the sidebar on wide screens or inside the bottom sheet on phones.
const picker = document.getElementById('picker-template').content.firstElementChild.cloneNode(true);
document.getElementById('picker-home-desktop').appendChild(picker);

const el = {
  search: picker.querySelector('#sport-search'),
  groups: picker.querySelector('#sport-groups'),
  selectedCount: picker.querySelector('#selected-count'),
  clearSports: picker.querySelector('#clear-sports'),
  presets: document.querySelectorAll('.preset'),
  from: document.getElementById('date-from'),
  to: document.getElementById('date-to'),
  apply: document.getElementById('apply-range'),
  summary: document.getElementById('summary'),
  notes: document.getElementById('notes'),
  results: document.getElementById('results'),
  tzPill: document.getElementById('tz-pill'),
  themeToggle: document.getElementById('theme-toggle'),
  themeColorMeta: document.getElementById('theme-color-meta'),
  pickerHomeDesktop: document.getElementById('picker-home-desktop'),
  pickerHomeMobile: document.getElementById('picker-home-mobile'),
  openSports: document.getElementById('open-sports'),
  bottombarCount: document.getElementById('bottombar-count'),
  sheet: document.getElementById('sport-sheet'),
  sheetScrim: document.getElementById('sheet-scrim'),
  sheetDone: document.getElementById('sheet-done'),
};

const state = {
  allSports: [],                       // [{name, category}]
  categoryBySport: new Map(),
  selected: loadSelection(),
  from: null,                          // YYYY-MM-DD (local)
  to: null,
  requestSeq: 0,
};

// ---------- Theme (incl. native status-bar color via theme-color) ----------

const THEME_COLORS = { light: '#fafafa', dark: '#0b0b0c' };

function currentThemeIsDark() {
  const override = document.documentElement.dataset.theme;
  if (override) return override === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncThemeColor() {
  el.themeColorMeta.content = THEME_COLORS[currentThemeIsDark() ? 'dark' : 'light'];
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  syncThemeColor();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
  el.themeToggle.addEventListener('click', () => {
    const next = currentThemeIsDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    syncThemeColor();
  });
}

// ---------- Bottom sheet (mobile sport picker) ----------

const mobileLayout = window.matchMedia('(max-width: 900px)');

function placePicker() {
  const home = mobileLayout.matches ? el.pickerHomeMobile : el.pickerHomeDesktop;
  if (picker.parentElement !== home) home.appendChild(picker);
  if (!mobileLayout.matches) closeSheet({ instant: true });
}

function openSheet() {
  el.sheet.hidden = false;
  document.body.classList.add('sheet-open');
  // Next frame so the entrance transition actually plays.
  requestAnimationFrame(() => el.sheet.classList.add('open'));
  el.sheetDone.focus({ preventScroll: true });
}

function closeSheet({ instant = false } = {}) {
  if (el.sheet.hidden) return;
  document.body.classList.remove('sheet-open');
  if (instant) {
    el.sheet.classList.remove('open');
    el.sheet.hidden = true;
    return;
  }
  el.sheet.classList.remove('open');
  const panel = el.sheet.querySelector('.sheet-panel');
  const onEnd = (event) => {
    if (event.target !== panel) return;
    panel.removeEventListener('transitionend', onEnd);
    el.sheet.hidden = true;
  };
  panel.addEventListener('transitionend', onEnd);
  // Fallback if transitionend never fires (e.g. reduced motion).
  setTimeout(() => { if (!el.sheet.classList.contains('open')) el.sheet.hidden = true; }, 500);
}

function initSheet() {
  placePicker();
  mobileLayout.addEventListener('change', placePicker);
  el.openSports.addEventListener('click', openSheet);
  el.sheetDone.addEventListener('click', () => closeSheet());
  el.sheetScrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });
}

// ---------- Selection persistence ----------

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

// ---------- Dates ----------

/** Local (not UTC) YYYY-MM-DD, so "today" matches the user's calendar. */
function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add calendar days in local time (DST-safe, unlike millisecond math). */
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday of the week containing `date` (weeks run Monday → Sunday). */
function startOfWeek(date) {
  const copy = new Date(date);
  const sinceMonday = (copy.getDay() + 6) % 7; // Mon=0 … Sun=6
  copy.setDate(copy.getDate() - sinceMonday);
  return copy;
}

function setRange(fromDate, toDate) {
  state.from = localDateString(fromDate);
  state.to = localDateString(toDate);
  el.from.value = state.from;
  el.to.value = state.to;
}

function applyPreset(name) {
  const today = new Date();
  const monday = startOfWeek(today);
  if (name === 'week') setRange(monday, addDays(monday, 6));
  if (name === 'nextweek') setRange(addDays(monday, 7), addDays(monday, 13));
  if (name === 'fortnight') setRange(today, addDays(today, 13));
  el.presets.forEach((b) => b.classList.toggle('active', b.dataset.preset === name));
}

// ---------- Sport picker ----------

const CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function loadSports() {
  try {
    const res = await fetch(`${API_BASE}/api/sports`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.allSports = data.sports;
    state.categoryBySport = new Map(data.sports.map((s) => [s.name, s.category]));
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
    updatePickerMeta();
    return;
  }
  for (const [category, names] of byCategory) {
    const section = document.createElement('div');
    section.className = 'sport-category';
    const label = document.createElement('p');
    label.className = 'category-label';
    const labelIcon = document.createElement('span');
    labelIcon.className = 'category-icon';
    labelIcon.innerHTML = categoryIconSvg(category);
    label.append(labelIcon, document.createTextNode(category));
    section.appendChild(label);

    const row = document.createElement('div');
    row.className = 'chip-row';
    for (const name of names) {
      const chip = document.createElement('label');
      chip.className = 'chip';
      if (state.selected.has(name)) chip.classList.add('on');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = name;
      checkbox.checked = state.selected.has(name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(name);
        else state.selected.delete(name);
        chip.classList.toggle('on', checkbox.checked);
        saveSelection();
        updatePickerMeta();
        scheduleRefresh();
      });

      const check = document.createElement('span');
      check.className = 'chip-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = CHECK_SVG;

      chip.append(checkbox, check, document.createTextNode(name));
      row.appendChild(chip);
    }
    section.appendChild(row);
    el.groups.appendChild(section);
  }
  updatePickerMeta();
}

function updatePickerMeta() {
  const n = state.selected.size;
  el.selectedCount.hidden = n === 0;
  el.clearSports.hidden = n === 0;
  el.selectedCount.textContent = n === 1 ? '1 selected' : `${n} selected`;
  el.bottombarCount.hidden = n === 0;
  el.bottombarCount.textContent = String(n);
}

// ---------- Results ----------

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 350);
}

function renderSkeleton() {
  el.results.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    for (const w of ['w40', 'w70', 'w55', 'w70']) {
      const line = document.createElement('div');
      line.className = `skeleton-line ${w}`;
      card.appendChild(line);
    }
    el.results.appendChild(card);
  }
}

async function refresh() {
  el.notes.innerHTML = '';
  el.summary.innerHTML = '';
  if (state.selected.size === 0) {
    el.results.innerHTML = '';
    const hero = document.createElement('div');
    hero.className = 'hero-empty';
    const title = document.createElement('p');
    title.className = 'hero-empty-title';
    title.textContent = 'Pick your sports to get started';
    const sub = document.createElement('p');
    sub.className = 'muted';
    sub.textContent = 'Choose the sports and leagues you follow — every match in your range shows up here, in your own time zone.';
    hero.append(title, sub);
    el.results.appendChild(hero);
    return;
  }

  const seq = ++state.requestSeq;
  renderSkeleton();

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

  renderSummary(data, allEvents.length);

  allEvents.sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  const byDay = new Map();
  for (const event of allEvents) {
    const key = localDayKey(event.startTimeUtc);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }

  const todayKey = localDayKey(new Date().toISOString());
  const tomorrowKey = localDayKey(addDays(new Date(), 1).toISOString());

  let dayIndex = 0;
  for (const [dayKey, events] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const card = document.createElement('section');
    card.className = 'day-card';
    card.style.setProperty('--i', dayIndex++); // staggered entrance

    const head = document.createElement('div');
    head.className = 'day-head';
    const heading = document.createElement('h3');
    heading.textContent = formatDayHeading(events[0].startTimeUtc);
    head.appendChild(heading);
    if (dayKey === todayKey || dayKey === tomorrowKey) {
      const badge = document.createElement('span');
      badge.className = 'day-badge';
      badge.textContent = dayKey === todayKey ? 'Today' : 'Tomorrow';
      head.appendChild(badge);
    }
    const count = document.createElement('span');
    count.className = 'day-count';
    count.textContent = events.length === 1 ? '1 event' : `${events.length} events`;
    head.appendChild(count);
    card.appendChild(head);

    const list = document.createElement('ul');
    for (const event of events) {
      const item = document.createElement('li');
      item.className = 'event';

      const time = document.createElement('span');
      time.className = 'event-time';
      time.textContent = formatTimeShort(event.startTimeUtc);

      const main = document.createElement('div');
      main.className = 'event-main';

      const sportTag = document.createElement('span');
      sportTag.className = 'sport-tag';
      const tagIcon = document.createElement('span');
      tagIcon.className = 'sport-tag-icon';
      tagIcon.innerHTML = categoryIconSvg(state.categoryBySport.get(event.sport));
      sportTag.append(tagIcon, document.createTextNode(event.sport));

      // Matches read best as "A vs B" with the league as a subtitle;
      // single-entity events as "Grand Prix name — Race".
      const title = document.createElement('span');
      title.className = 'event-title';
      const isMatch = event.participants.length >= 2;
      title.textContent = isMatch
        ? event.eventName
        : (event.eventName && event.eventName !== event.competition
            ? `${event.competition} — ${event.eventName}`
            : event.competition);

      main.append(sportTag, title);

      const sub = document.createElement('span');
      sub.className = 'event-sub';
      sub.textContent = isMatch ? event.competition : '';

      item.append(time, main);
      if (sub.textContent) item.append(sub);
      list.appendChild(item);
    }
    card.appendChild(list);
    el.results.appendChild(card);
  }

  if (byDay.size === 0 && emptySports.length === 0 && erroredSports.length > 0) {
    el.results.appendChild(msg('No schedule data available right now.'));
  }

  // Sports with zero events are listed explicitly, never silently dropped.
  if (emptySports.length > 0) {
    const card = document.createElement('div');
    card.className = 'empty-card';
    const title = document.createElement('p');
    title.className = 'empty-title';
    title.textContent = 'Nothing scheduled in this range';
    card.appendChild(title);
    for (const sport of emptySports) {
      const line = document.createElement('p');
      line.textContent = `No ${sport} events between ${rangeLabel()}.`;
      card.appendChild(line);
    }
    el.results.appendChild(card);
  }
}

function rangeLabel() {
  const opts = { day: 'numeric', month: 'short' };
  const from = new Date(`${state.from}T12:00:00`);
  const to = new Date(`${state.to}T12:00:00`);
  return `${from.toLocaleDateString(undefined, opts)} and ${to.toLocaleDateString(undefined, opts)}`;
}

function renderSummary(data, eventCount) {
  el.summary.innerHTML = '';
  const main = document.createElement('span');
  main.className = 'summary-main';
  const sportCount = Object.keys(data.sports).length;
  main.textContent = `${eventCount} ${eventCount === 1 ? 'event' : 'events'} across ${sportCount} ${sportCount === 1 ? 'sport' : 'sports'}`;
  const sub = document.createElement('span');
  sub.className = 'summary-sub';
  sub.textContent = `${rangeLabel()} · times in your local zone`;
  el.summary.append(main, sub);
}

function msg(text, kind = 'muted') {
  const p = document.createElement('p');
  p.className = kind === 'muted' ? 'muted' : `note ${kind}`;
  p.textContent = text;
  return p;
}

// ---------- Wire up ----------

initTheme();
initSheet();
el.tzPill.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');

el.search.addEventListener('input', renderPicker);
el.clearSports.addEventListener('click', () => {
  state.selected.clear();
  saveSelection();
  renderPicker();
  scheduleRefresh();
});
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
