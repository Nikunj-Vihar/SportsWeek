# Build Prompt for Claude Code: "SportsWeek" — Multi-Sport Schedule Aggregator

Paste everything below into Claude Code as your initial project prompt. Sections are ordered the way Claude Code should approach the build: architecture first, then backend, then frontend, then hardening.

---

## 1. Project Summary

Build a web tool called **SportsWeek**. A user selects the sports/leagues they follow from a list. The tool then shows them, grouped by day, every match/event happening in a chosen date range (default: today through the next 6 days — "this week") across only their selected sports. If a sport has no events in range, show it explicitly as "No [Sport] this week" rather than omitting it.

Example output for a user who follows Tennis, F1, and Cricket:
```
Fri 18 Jul
  F1 — Belgian Grand Prix (Qualifying), 3:00 PM IST
  Cricket — IND vs ENG, 3rd ODI, 2:00 PM IST

Sat 19 Jul
  F1 — Belgian Grand Prix (Race), 6:30 PM IST

This week: No Tennis matches for your followed tour(s).
```

## 2. Architecture

Do NOT build this as a pure static site calling third-party APIs directly from the browser. Sports data providers require API keys that must not be exposed client-side, and some enforce per-key rate limits that a shared public key would exhaust quickly if called browser-to-API. Use this shape instead:

```
[Static frontend: HTML/CSS/JS, no framework, no build step]
        |
        | fetch('/api/schedule?sports=...&from=...&to=...')
        v
[Serverless proxy: Cloudflare Worker or Vercel Edge Function — free tier]
        - Holds all provider API keys as environment secrets, never sent to client
        - Runs one "adapter" module per data source
        - Normalizes every provider's response into one common event schema
        - Caches responses (see §5) to stay within free-tier rate limits
        v
[External sports data providers]
        - TheSportsDB (broad multi-sport coverage, free tier, key required)
        - Jolpica-F1 (Formula 1, free, no key required)
        - Additional providers added later per-sport via new adapters
```

This keeps hosting cost at $0 (Cloudflare Workers / Vercel free tier limits are generous for this traffic level) while keeping keys server-side.

## 3. Common Event Schema

Every adapter must return events in this exact shape so the frontend never needs to know which provider an event came from:

```ts
type SportEvent = {
  id: string;              // provider-prefixed unique id, e.g. "thesportsdb-123456"
  sport: string;           // canonical sport name from our sport registry, e.g. "Cricket"
  competition: string;     // e.g. "IND vs ENG ODI Series", "Belgian Grand Prix"
  eventName: string;       // e.g. "3rd ODI", "Race"
  startTimeUtc: string;    // ISO 8601, UTC
  participants: string[];  // team/player names, best effort
  sourceProvider: string;  // for debugging/logging only, never shown to user as-is
};
```

## 4. Sport Registry & Adapters

Build a config-driven **sport registry** (a single JSON/TS file), not hardcoded logic per sport. Each entry maps a canonical sport name to which adapter(s) supply it:

```ts
{
  "Cricket": { adapter: "thesportsdb", providerSportKey: "Cricket" },
  "Formula 1": { adapter: "jolpica" },
  "Tennis": { adapter: "thesportsdb", providerSportKey: "Tennis" },
  // ...
}
```

Start with 15-20 sports that have confirmed reliable free-tier coverage (major football leagues, basketball, cricket, tennis, F1, a few others from TheSportsDB's catalogue). Do not claim coverage for a sport until you've manually verified TheSportsDB (or another adapter) actually returns real fixture data for it — some niche/regional sports (e.g. badminton) do not have reliable free coverage; leave them out of the registry rather than shipping a sport that silently returns nothing.

Each adapter module must:
- Accept a date range and return an array of `SportEvent`
- Handle and log (not crash on) malformed provider responses, timeouts, and empty results
- Be independently testable with a mocked provider response

## 5. Caching Strategy

- Cache per (sport, date-range) combination for a minimum of 12 hours, since fixture schedules don't change minute to minute.
- Use the serverless platform's built-in KV/edge caching if available (Cloudflare KV, Vercel Edge Config), or a simple in-memory + timestamp check if not.
- On cache miss, fetch fresh, store, and serve. On provider error with a valid cache present, serve the stale cache and flag it as `stale: true` in the response rather than failing the whole request.
- Never let a single user's request pattern be able to trigger unbounded upstream calls — always check cache before calling any provider.

## 6. Frontend Requirements

- Vanilla HTML/CSS/JS, no framework, no build step (matches the ResuTailor architecture).
- **Sport picker**: searchable multi-select checklist grouped loosely by category (Racket sports, Motorsport, Team sports, etc.). Store selection in `localStorage` only — no account, no server-side user data at all.
- **Date range control**: defaults to "This week" (today → +6 days). Provide simple alternate presets ("Next week", "Next 14 days") plus a manual date range picker.
- **Results view**: grouped by day, one row per event, in the user's local time zone (convert from `startTimeUtc` using the browser's `Intl` API — never ask the user to specify their time zone manually).
- Sports with zero events in range are still listed with an explicit "no events" line, not silently dropped.
- Loading and error states: if the proxy returns a `stale: true` flag for any sport, show a small non-alarming note like "Schedule last confirmed X hours ago" next to that sport's section.

## 7. Security Requirements

- All provider API keys live only as environment variables on the serverless platform. Grep the final codebase before shipping to confirm no key, token, or secret appears in any client-side file, build output, or git history.
- Add a Content-Security-Policy header restricting script/style sources to the site's own origin plus any CDN scripts actually used.
- If any CDN-hosted script/style is used, add Subresource Integrity (SRI) hashes.
- Sanitize and validate all query parameters the proxy accepts (`sports`, `from`, `to`) — reject or clamp malformed dates, unknown sport keys, and unreasonably large date ranges (e.g. cap at 31 days) before calling any upstream provider.
- Rate-limit the proxy endpoint itself per IP (a simple sliding window is enough) so the tool can't be used to hammer upstream providers or exhaust free-tier quotas via scripted abuse.
- No user accounts, no server-side storage of any personal data. The only persisted state is the user's own sport selection, in their own browser's `localStorage`.

## 8. Privacy Requirements

- No analytics or tracking scripts beyond, at most, simple privacy-respecting page-view counting if you choose to add it later — not part of this build.
- No cookies required for core functionality.
- Clearly state on the page, in one line, that sport preferences are stored locally in the browser only and are not sent to or stored on any server.

## 9. Testing & Integrity Checks (required before calling this "done")

Ask Claude Code to write and run:

1. **Adapter unit tests** — for each adapter, test against a saved mock provider response (not a live call) to confirm correct normalization into the common `SportEvent` schema, including edge cases: empty results, malformed fields, missing fields.
2. **Schema validation test** — a single test that runs every adapter's mocked output through a schema validator to guarantee no adapter can ever return a malformed event to the frontend.
3. **Cache behavior test** — confirm a cache hit doesn't call the upstream provider, and a provider failure with existing cache returns `stale: true` instead of a hard error.
4. **Input validation test** — confirm the proxy endpoint rejects or safely clamps invalid `sports`, `from`, `to` parameters (SQL/NoSQL-injection-style strings, absurd date ranges, unknown sport keys).
5. **Rate limit test** — confirm the proxy actually blocks or throttles a rapid burst of requests from one source.
6. **Key exposure check** — an explicit final step: search the entire built/deployed frontend bundle (not just source) for any provider API key string. This must return zero matches before shipping.
7. **Time zone correctness test** — confirm a known UTC timestamp renders correctly across at least two different browser time zones (simulate by overriding `Intl` locale/timezone in the test).
8. **Manual verification pass** — for every sport in the registry, manually confirm at least one real event returns correctly from the live (non-mocked) provider before including that sport in the shipped registry.

## 10. Definition of Done

- Frontend + proxy deployed on free-tier infrastructure (GitHub Pages for frontend, Cloudflare Workers or Vercel for the proxy).
- 15-20 sports live in the registry, each manually verified per §9.8.
- All tests in §9 passing.
- No secrets present anywhere in the deployed frontend bundle.
- README documenting: architecture, how to add a new sport/adapter, and how to rotate provider API keys.
