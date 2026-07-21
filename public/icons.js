// One minimal line-icon per registry sport (24x24, stroke-based, currentColor)
// — same visual language as the search/checkmark/theme icons already in the
// app: ~1.7 stroke width, rounded caps, no fills except tiny accent dots.
// Keeping every glyph geometric and simple so it still reads at 14-16px.

export const SPORT_ICONS = {
  'Football (Soccer)': '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.6l3.2 2.35-1.22 3.8h-3.96l-1.22-3.8z"/>',
  'Cricket': '<path d="M8 19V8M12 19V7M16 19V8"/><path d="M7 8h2M11 7h2M15 8h2"/><circle cx="19.3" cy="16.3" r="1.3"/>',
  'Basketball': '<circle cx="12" cy="12" r="8.2"/><path d="M4 9.5c4.5 1.7 11.5 1.7 16 0M4 14.5c4.5-1.7 11.5-1.7 16 0"/><path d="M12 3.8c-2.2 2.2-2.2 14.2 0 16.4M12 3.8c2.2 2.2 2.2 14.2 0 16.4"/>',
  'Baseball': '<circle cx="12" cy="12" r="8.2"/><path d="M6.3 6.3c1.8 2.5 1.8 8.9 0 11.4M17.7 6.3c-1.8 2.5-1.8 8.9 0 11.4" fill="none"/>',
  'Ice Hockey': '<path d="M15 3L8 15.5L3.4 17.2"/><ellipse cx="4.4" cy="19" rx="2.3" ry="1"/>',
  'American Football': '<ellipse cx="12" cy="12" rx="4.6" ry="8.2"/><path d="M8 12h8M10.2 9.8v1M10.2 14.2v1M12 9.4v1M12 14.6v1M13.8 9.8v1M13.8 14.2v1"/>',
  'Rugby': '<ellipse cx="12" cy="12" rx="5" ry="8.2"/><path d="M12 4v16"/>',
  'Volleyball': '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8c3 2 4.6 5 4.3 8.2M4.2 10.5c3 1.6 7 1.6 11.4-1M8 20c0-3.4 1.3-6.6 3.6-8.7"/>',
  'Handball': '<circle cx="12" cy="12" r="8.2"/><path d="M6.5 7.5c2.7 1.6 8.3 1.6 11 0M6.5 16.5c2.7-1.6 8.3-1.6 11 0"/>',
  'Australian Football': '<ellipse cx="12" cy="12" rx="6.8" ry="7.6"/><path d="M8.4 6.2c2.1 2.1 2.1 9.5 0 11.6"/>',
  'Netball': '<path d="M12 3.5v11"/><ellipse cx="12" cy="14.5" rx="5.2" ry="2"/>',
  'Tennis': '<circle cx="12" cy="12" r="8.2"/><path d="M5.3 15.2c3-5.3 10.2-8.6 13.2-4.4"/>',
  'Formula 1': '<path d="M5 4v16"/><path d="M5 5h11l-2.2 3L16 11H5"/>',
  'Motorsport (other)': '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/>',
  'Cycling': '<circle cx="6" cy="16.5" r="3.5"/><circle cx="18" cy="16.5" r="3.5"/><path d="M6 16.5l4-9h3l3 5M10 7.5H8.3M13 12.5h5.5l-3-5"/>',
  'Golf': '<path d="M7 21h6M9 21V5.2"/><path d="M9 5.2l7 3.1-7 3.1z"/><ellipse cx="9" cy="21" rx="4.5" ry="1"/>',
  'MMA / Fighting': '<path d="M12 3l1.6 4.4L18 6l-2 4.3L20 12l-4 1.7L18 18l-4.4-1.6L12 21l-1.6-4.6L6 18l1.6-4.3L4 12l4.4-1.7L6 6l4.4 1.4z"/>',
  'Darts': '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.7"/>',
  'Esports': '<rect x="3.5" y="8.5" width="17" height="9" rx="4"/><path d="M8 11.3v3.4M6.3 13h3.4"/><circle cx="15.5" cy="11.8" r="0.9"/><circle cx="17.5" cy="13.8" r="0.9"/>',
};

const FALLBACK_ICON = '<circle cx="12" cy="12" r="8.2"/>';

/** Inline <svg> markup for a sport, or a plain circle if the sport is unknown. */
export function sportIconSvg(sportName) {
  const inner = SPORT_ICONS[sportName] || FALLBACK_ICON;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
