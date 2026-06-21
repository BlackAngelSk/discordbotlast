# Dashboard Full Visual Rebuild

## Goal
Redo the whole Discord bot dashboard to look its best, with minimal risk of breaking the ~30 functional EJS views (forms, IDs, JS hooks).

## Key Insight
The dashboard's appearance is driven almost entirely by a single file: `dashboard/public/style.css` (~976 lines). All views share the same class vocabulary (`card`, `stat-card`, `page-header`, `badge`, `btn`, `form-*`, `table`, `sidebar`, `topbar`, `server-card`, etc. — verified via grep across all `.ejs` views). Therefore, **rewriting `style.css` upgrades every page at once with zero markup breakage**, as long as every existing class name is preserved.

## Scope (confirmed by user: "Full rebuild")
1. **Full rewrite of `dashboard/public/style.css`** — fresh premium design system. Preserve ALL existing class names and IDs used by views and `dashboard-common.js` (`#sidebar`, `#sidebarOverlay`, `#mobileMenuBtn`, `#themeToggle`, `#toasts`, `.toast-*`, `.open`, `.active`, `is-active`, `data-theme`).
2. **Light refresh of shared partials** — `views/partials/dashboard-topbar.ejs`, `views/partials/dashboard-sidebar.ejs` (markup polish only; no ID/JS-hook changes).
3. **Refresh of landing + server-picker** — `views/index.ejs`, `views/dashboard.ejs` (preserve all `data-*`, `id`, inline `<script>` logic).

## New Design Direction
- **Palette:** Deep slate-violet base (`#0a0e1a`), electric indigo brand (`#6366f1`→`#8b5cf6` gradient), cyan + fuchsia accents. Distinct from current teal/amber.
- **Typography:** Keep `Plus Jakarta Sans` (UI) + `Space Grotesk` (display) via Google Fonts import. Tighter tracking, larger display sizes.
- **Depth:** Layered glassmorphism (blur + subtle borders), soft multi-layer shadows, animated aurora/gradient blobs in background, fine grid overlay.
- **Components:** Refined cards with hover lift, gradient stat icons, pill buttons with glow, premium toggle switches, redesigned tables with hover rows, modern badges, glass modals/toasts.
- **Motion:** Smooth `cubic-bezier` transitions, fade/slide-in for toasts/modals, animated counters (already in JS), hover micro-interactions.
- **Themes:** Dark (default) + refined light theme via `[data-theme="light"]`.
- **Responsive:** Preserve the existing breakpoints (900px, 520px) and mobile sidebar behavior.

## Design System to Define (CSS variables)
- Color tokens: base, card, surface, hover, elevated, brand(+dark/glow/soft), accent, status (green/red/yellow/blue/purple/orange) + `-bg` variants.
- Text: text-1/2/3. Borders: border/border-2.
- Layout: `--sidebar-w`, `--topbar-h`.
- Radius: xs/sm/lg/xl. Shadows + transitions.

## Constraints / Must-Preserve
- All class names currently in use (verified by grep — see list in chat).
- All IDs/JS hooks: `themeToggle`, `mobileMenuBtn`, `sidebar`, `sidebarOverlay`, `toasts`, `serverSearch`, `serverGrid`, `serverEmptyState`, `serverResultsLabel`, `.server-filter-btn`/`is-active`, `data-filter`, `data-name`, `data-type`, `data-count`, `data-rate`, `cmdChart`, `activityChart`.
- Chart.js hex colors are inline in view `<script>` — leave views alone unless refreshing landing/server-picker.
- Inline `style="..."` attributes in views (e.g. feature icon backgrounds) use existing variables (`var(--brand-glow)` etc.) — keep those variable names defined.

## Files to Change
| File | Change |
|------|--------|
| `dashboard/public/style.css` | **Full rewrite** (foundation — affects all views) |
| `dashboard/views/partials/dashboard-topbar.ejs` | Light markup polish |
| `dashboard/views/partials/dashboard-sidebar.ejs` | Light markup polish |
| `dashboard/views/index.ejs` | Refresh hero/features markup |
| `dashboard/views/dashboard.ejs` | Refresh server-picker markup |

## Out of Scope (not touched)
- The ~25 feature pages (analytics, economy, live-alerts, etc.) — they inherit the new look via CSS automatically. Risk of breaking form `name`/JS hooks is too high for marginal gain.
- `server.js`, `routes.js`, `dashboard-common.js`, `dashboard-common-scripts.ejs` — no logic changes.
- Backend/data.

## Verification
- Grep new `style.css` against the full list of class tokens extracted from views to ensure none are missing.
- Check the dashboard starts / no EJS syntax errors introduced in the 4 edited EJS files (visual inspection + `node -c` not applicable to EJS; rely on careful edits preserving tags).
- Cross-check IDs used by `dashboard-common.js` and inline scripts still exist.
- Note: cannot fully run the bot (needs env/tokens), so verification is static + class-coverage check.

## Risk
Low-to-moderate. CSS rewrite is safe (visual only). EJS edits limited to 4 files with careful preservation of tags/IDs. If anything looks off, the feature pages can be individually refined afterward.
