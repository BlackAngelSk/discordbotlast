# Recode Plan — discordbotlast

Gradual modernization, done in small verified phases. Each phase must leave
`npm test` and `npm run build` green before committing.

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

## Phase 3 — ES module migration ✅ (batch 1; incremental approach proven)
- Node ≥22 supports `require(esm)`, so leaf modules can convert file-by-file
  without a flag day. Order: `utils/` leaves → managers → `commands/` →
  `events/` → `index.js` → `dashboard/server.js`.
- ✅ Batch 1: `utils/core/helpers.js` → `helpers.mjs` (7 named exports) with a
  CJS proxy at `utils/helpers.js`; consumers keep `require('./helpers')`.
- Proved the trap: extension-less `require('./x')` does NOT resolve `.mjs`
  (Node 26) — every `.mjs` conversion must update all importers in the same
  batch.
- `scripts/verify-build.js` now walks `.mjs`, parses via `node --check`, and
  resolves ESM import specifiers. `helpers.mjs.d.ts` declares the ESM leaf for
  the TS check gate.
- Remaining batches (helpers → managers → commands/events → index → server)
  can proceed the same way whenever a file is touched.

## Phase 4 — Split the monsters ✅
- `dashboard/server.js` (4384 → ~3680 lines): 13 standalone helpers extracted
  verbatim into `dashboard/serverHelpers.js` (scripted slice, zero
  transcription errors).
- `utils/steam/steamGameUpdatesManager.js` (2317 → ~2060 lines): fetch/parse
  utilities extracted into `utils/steam/steamUpdateUtils.js`.
- `index.js` (835 → ~585 lines): season leaderboard scheduler extracted into
  `utils/season/seasonLeaderboardScheduler.js`.
- Each extraction verified: build OK, tests 15/15, runtime smoke of exports.

## Phase 5 — TypeScript check gate for new code ✅
- `typescript@^7.0.2` devDep + `tsconfig.json` (strict, checkJs, noEmit; scoped
  `include`: setup.js + the new Phase 3/4 modules). `npm run typecheck`
  = `tsc --noEmit`.
- tsc on `slashCommands/admin/setup.js` found **two real runtime bugs**:
  `Colors.Danger`/`Colors.Secondary` don't exist in discord.js (fixed →
  `Colors.Red`/`Colors.Grey`), and the welcome sync used non-existent
  `welcomeMessageManager.setWelcome*` methods (fixed → real `setWelcomeConfig`
  via `client.welcomeMessageManager`). 110 errors → 0.
- All four checked files now pass `tsc --noEmit` with strict JSDoc annotations.
- Expand `tsconfig.json` `include` in future phases as more files get types.

## Rules
- Never modify another profile's or live runtime data (`data/*.json`) in a
  recode commit.
- Every phase: tests + build green, then one commit per logical change.
