// Sport registry (§4). Config-driven: every canonical sport maps to the
// adapter that supplies it. Nothing else in the codebase hardcodes sports.
//
// Every entry here has been verified against the live provider via
// `npm run verify:live` (§9.8) — see README "Adding a new sport".
// Sports without confirmed free-tier fixture coverage are deliberately absent
// (checked 2026-07-15 and found empty: Boxing, Snooker, Table Tennis,
// Badminton, Athletics, Field Hockey).

export const REGISTRY = {
  'Football (Soccer)':  { adapter: 'thesportsdb', providerSportKey: 'Soccer',             category: 'Team sports' },
  'Cricket':            { adapter: 'thesportsdb', providerSportKey: 'Cricket',            category: 'Team sports' },
  'Basketball':         { adapter: 'thesportsdb', providerSportKey: 'Basketball',         category: 'Team sports' },
  'Baseball':           { adapter: 'thesportsdb', providerSportKey: 'Baseball',           category: 'Team sports' },
  'Ice Hockey':         { adapter: 'thesportsdb', providerSportKey: 'Ice Hockey',         category: 'Team sports' },
  'American Football':  { adapter: 'thesportsdb', providerSportKey: 'American Football',  category: 'Team sports' },
  'Rugby':              { adapter: 'thesportsdb', providerSportKey: 'Rugby',              category: 'Team sports' },
  'Volleyball':         { adapter: 'thesportsdb', providerSportKey: 'Volleyball',         category: 'Team sports' },
  'Handball':           { adapter: 'thesportsdb', providerSportKey: 'Handball',           category: 'Team sports' },
  'Australian Football':{ adapter: 'thesportsdb', providerSportKey: 'Australian Football',category: 'Team sports' },
  'Netball':            { adapter: 'thesportsdb', providerSportKey: 'Netball',            category: 'Team sports' },
  'Tennis':             { adapter: 'thesportsdb', providerSportKey: 'Tennis',             category: 'Racket sports' },
  'Formula 1':          { adapter: 'jolpica',                                             category: 'Motorsport' },
  'Motorsport (other)': { adapter: 'thesportsdb', providerSportKey: 'Motorsport',         category: 'Motorsport' },
  'Cycling':            { adapter: 'thesportsdb', providerSportKey: 'Cycling',            category: 'Individual sports' },
  'Golf':               { adapter: 'thesportsdb', providerSportKey: 'Golf',               category: 'Individual sports' },
  'MMA / Fighting':     { adapter: 'thesportsdb', providerSportKey: 'Fighting',           category: 'Combat sports' },
  'Darts':              { adapter: 'thesportsdb', providerSportKey: 'Darts',              category: 'Individual sports' },
  'Esports':            { adapter: 'thesportsdb', providerSportKey: 'Esports',            category: 'Esports' },
};

export function isKnownSport(name) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name);
}

export function listSports() {
  return Object.entries(REGISTRY).map(([name, entry]) => ({
    name,
    category: entry.category,
  }));
}
