// One minimal line-icon per sport *category* (24x24, stroke-based,
// currentColor) — same visual language as the search/checkmark/theme icons
// already in the app: ~1.7 stroke width, rounded caps. Categories come
// straight from the registry's category field (worker/src/registry.js), so
// this stays a 6-icon set no matter how many sports get added later.

export const CATEGORY_ICONS = {
  'Team sports': '<path d="M9 4L6 6.5v3l2-1v10.5h8V8.5l2 1v-3L14 4l-2 1.6z"/>',
  'Racket sports': '<ellipse cx="12" cy="7.5" rx="4.3" ry="5.5"/><path d="M12 3v9M8.3 7.5h7.4"/><path d="M10.1 12.7l1.1 2.3M13.9 12.7l-1.1 2.3"/><path d="M12 15V21"/><path d="M10 21h4"/>',
  'Motorsport': '<path d="M5 4v16"/><path d="M5 5h11l-2.2 3L16 11H5"/>',
  'Individual sports': '<circle cx="12" cy="13" r="7.3"/><path d="M12 13V8.7"/><path d="M10 3.5h4"/><path d="M12 3.5V5.7"/>',
  'Combat sports': '<path d="M12 3l1.6 4.4L18 6l-2 4.3L20 12l-4 1.7L18 18l-4.4-1.6L12 21l-1.6-4.6L6 18l1.6-4.3L4 12l4.4-1.7L6 6l4.4 1.4z"/>',
  'Esports': '<rect x="3.5" y="8.5" width="17" height="9" rx="4"/><path d="M8 11.3v3.4M6.3 13h3.4"/><circle cx="15.5" cy="11.8" r="0.9"/><circle cx="17.5" cy="13.8" r="0.9"/>',
};

const FALLBACK_ICON = '<circle cx="12" cy="12" r="8.2"/>';

/** Inline <svg> markup for a category, or a plain circle if unrecognized. */
export function categoryIconSvg(categoryName) {
  const inner = CATEGORY_ICONS[categoryName] || FALLBACK_ICON;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
