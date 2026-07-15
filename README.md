# SportsWeek

Pick the sports you follow; see every match/event happening this week (or any
range up to 31 days), grouped by day, in **your** time zone. Sports with no
events in range are shown explicitly ("No Tennis events in this date range"),
never silently dropped.

No accounts, no cookies, no analytics. Your sport selection lives only in your
browser's `localStorage`.

## Architecture

```
[Static frontend]  public/ — vanilla HTML/CSS/JS, no framework, no build step
        |
        |  fetch('/api/schedule?sports=Cricket,Formula 1&from=...&to=...')
        v
[Serverless proxy] worker/ — Cloudflare Worker (free tier)
        - Holds provider API keys as secrets; never sent to the client
        - One adapter module per data source, all normalizing into one schema
        - 12h cache per (sport, date range); serves stale + `stale: true`
          when a provider is down instead of failing
        - Validates/clamps all query params; rejects unknown sports
        - Per-IP sliding-window rate limit (30 req/min)
        v
[Providers]
        - TheSportsDB  (18 sports, free tier, key required)
        - Jolpica-F1   (Formula 1, free, no key)
```

The same API core runs three ways with zero code changes:

| Where | Entry point | Cache |
|---|---|---|
| Cloudflare Workers | `worker/index.js` | KV (falls back to in-memory) |
| Local dev server | `dev-server.js` | in-memory |
| Tests | `test/*.test.js` | in-memory, mocked providers |

Every adapter returns events in one common shape (`worker/src/schema.js`):

```ts
type SportEvent = {
  id: string;              // "thesportsdb-2482724", "jolpica-2026-r13-race"
  sport: string;           // canonical name from the registry
  competition: string;     // "Lanka Premier League", "Belgian Grand Prix"
  eventName: string;       // "Dambulla Sixers vs Kandy Royals", "Qualifying"
  startTimeUtc: string;    // ISO 8601, UTC — frontend converts via Intl
  participants: string[];
  sourceProvider: string;  // debugging only
};
```

## Running locally

Requires Node ≥ 20. No dependencies to install.

```sh
node dev-server.js            # http://localhost:8788
npm test                      # full test suite (§9.1–9.7)
npm run verify:live           # §9.8: verify every registry sport against live providers
```

`THESPORTSDB_KEY` defaults to TheSportsDB's public demo key `3` for local
development.

## Deploying

**Proxy (Cloudflare Workers):**

```sh
wrangler kv namespace create SPORTSWEEK_KV     # then paste id into wrangler.toml
wrangler secret put THESPORTSDB_KEY            # optional but recommended (see below)
wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to your GitHub Pages origin.

**Frontend (GitHub Pages or any static host):** publish the `public/`
directory as-is, then set `API_BASE` in `public/config.js` to your Worker URL.
Tighten the `connect-src` in `index.html`'s CSP meta tag from
`https://*.workers.dev` to your exact Worker origin.

## Known free-tier limitations (verified 2026-07-15)

- **TheSportsDB demo key caps results at ~3 events per sport per day** and
  rate-limits around 30 requests/minute. The app works correctly but shows a
  subset of busy sports (e.g. Soccer). A supporter key (their Patreon tier)
  lifts both limits through the same endpoints — set it with
  `wrangler secret put THESPORTSDB_KEY` and nothing else changes.
- Sports probed live and found to have **no** reliable free fixture coverage
  are deliberately excluded from the registry: Boxing, Snooker, Table Tennis,
  Badminton, Athletics, Field Hockey.

## Adding a new sport

1. If TheSportsDB covers it: add one line to `worker/src/registry.js` with the
   canonical display name, `providerSportKey` (their `strSport` value), and a
   picker category. If it needs a new provider: add
   `worker/src/adapters/<provider>.js` exporting `fetchEvents({ sport,
   providerSportKey, from, to }) → SportEvent[]` (accept an injectable
   `fetchImpl` for tests), wire it in `worker/index.js` and `dev-server.js`,
   and add fixture-based tests mirroring `test/adapters.test.js`.
2. Run `npm test`.
3. Run `npm run verify:live` — **a sport ships only if this passes for it.**
   The script exits non-zero and names any sport that returned no real events.

## Rotating provider API keys

Keys exist in exactly one place per environment; nothing client-side ever sees
them.

1. Get the new key from the provider.
2. `wrangler secret put THESPORTSDB_KEY` (paste the new key), then
   `wrangler deploy`. Locally, update the env var you pass to `dev-server.js`.
3. Revoke the old key with the provider.
4. Paranoia pass: `npm test` includes a key-exposure check that scans every
   shipped frontend file for provider hosts and key-like strings, and — when
   `THESPORTSDB_KEY` is set in the environment — for the literal key value.

## Security & privacy summary

- Query params validated server-side: unknown sports → 400; malformed dates →
  400; ranges clamped to 31 days; dates more than a year out rejected.
- Per-IP sliding-window rate limit (30/min) on the proxy itself.
- CSP restricts scripts/styles/connections to own origin (+ the Worker origin
  for `connect-src`). No CDN assets are used, so no SRI is needed.
- No cookies, no analytics, no server-side storage of any user data. The one
  line of persisted state (sport selection) is in the user's own
  `localStorage`, and the page says so.
