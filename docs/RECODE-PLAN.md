# Recode Plan — discordbotlast

Gradual modernization, done in small verified phases. Each phase must leave
`npm test` (23/23) and `npm run build` green before committing.

## Phase 1 — Dependency cleanup ✅
- Removed 6 unused/broken deps: `@discordjs/opus` (native build broken — fails
  to load; `opusscript` is the working opus backend), `@distube/ytdl-core`,
  `ytdl-core`, `youtube-dl-exec`, `socket.io`, `@snazzah/davey`.
- Kept `libsodium-wrappers` + `sodium-native` (voice encryption backends —
  redundant but harmless; revisit later), `ejs` (dashboard view engine),
  `cloudscraper` (used once — candidate for removal in a later phase).

## Phase 2 — Music stack consolidation ✅
- Single retrieval path: `utils/music/youtubeSearch.js` now resolves search,
  video info, playlists and SoundCloud **all through yt-dlp** (removed the ytsr
  fallback and the play-dl scrapers).
- Dropped deps: `ytsr`, `play-dl`. `cloudscraper` was replaced with an undici
  retry in `utils/steam/steamFreeGamesAlertsManager.js`.
- Also committed the in-Discord `/setup` command (slashCommands/admin/setup.js)
  that was pending from earlier work; it now requires the correct
  `utils/moderationManager` path.
- Verified: build OK (419 files), tests 15/15, live yt-dlp smoke test.

## Phase 3 — ES module migration (incremental)
- Node ≥22 supports `require(esm)`, so leaf modules can convert file-by-file
  without a flag day. Order: `utils/` leaves → managers → `commands/` →
  `events/` → `index.js` → `dashboard/server.js`.
- Only convert files that are already touched by other work, or in stable
  batches with a build check after each batch.

## Phase 4 — Split the monsters
- `dashboard/server.js` (4384 lines) → route modules per section.
- `utils/steam/steamGameUpdatesManager.js` (2317 lines) → smaller units.
- `index.js` (835 lines) → loader/bootstrap only.

## Phase 5 — TypeScript for new code
- No big-bang TS rewrite. New/refactored modules get `.ts` or strict JSDoc
  types, compiled via `tsc --checkJs` gradually tightened.

## Rules
- Never modify another profile's or live runtime data (`data/*.json`) in a
  recode commit.
- Every phase: tests + build green, then one commit per logical change.
