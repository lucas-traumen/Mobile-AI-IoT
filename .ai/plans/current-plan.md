# Current Task Plan

Status: APPROVED — IMPLEMENTATION AUTHORIZED (2026-09-07, "ok triển khai đi ok")

## Orchestrator decisions on open questions (user approved without specifics — disclosed)

1. `FilterDropdown` placed in `src/modules/history/ui/` (module-local; promote to core later if another module needs it).
2. Header Menu button opens the same `RoomListModal` the Dashboard menu opens (functional, consistent; import via `@modules/dashboard/api` — add the export there if not already public).
3. Tooltip: victory-native tooltip (voronoi container), smart-token styled, hidden on mount.
4. Icons: Ionicons `thermometer-outline` (temperature), `water-outline` (humidity), fallback `analytics-outline` for other capabilities.
5. New token `smart.typography.statsValue: 22` (both themes; within the spec 20–24 band).
6. Card order: temperature first, humidity second, then any other registered fields (registration-derived contract preserved — "two cards" in the spec reflects the typical temp+humidity room; a registered sensor without points still renders its `Chưa có dữ liệu` card).

## Task ID

history-smart-home-redesign

## Task type

Feature (UI redesign — History tab)

## Parent milestone

M2 — Room-based customizable dashboard + template UI (post‑redesign polish)

## Goal

Redesign the History tab to the "Smart Home" design language, fully synced with the Dashboard tab's visual system. Replace the legacy gel aesthetic (gradient, pastel tints, chip strips) with the smart token block (ambient wash, white cards, hairline borders, teal/amber accents). Introduce dropdown-based room + time-range filters, a two-card stacked chart layout (Temperature then Humidity), and per-card statistics, while preserving all data logic, MQTT wiring, and module boundaries.

## Current state (repository evidence)

- `HistoryScreen.tsx` uses the **legacy gel language**: `LinearGradient` with `tokens.gradient`, pastel `cardTintTemperature/Humidity`, `cardInnerEdge`, `chipActiveBg` range chips, and the `RoomSelector` quick-strip + modal.
- `RoomSelector` is imported from `@modules/dashboard/api` and renders a horizontal chip strip + expandable full list modal. The spec requires **dropdowns**, not chips.
- Range selection uses `HISTORY_RANGES` chips (`1H`/`24H`/`7D`) centered below the room selector. The spec requires a **dropdown** with labels `1 giờ`/`24 giờ`/`7 ngày`.
- Charts use `victory-native` `VictoryLine` with `strokeWidth: 2`, no area fill, and a stats row below (Min/Max/Trung bình) with hard-coded font sizes.
- Stats values use `stats.min/max/avg.toFixed(1)` with `—` fallback; no units shown.
- The screen does **not** show the actual date range (e.g., "07/09 14:00 – 08/09 14:00").
- No sensor icons beside card titles.
- No tooltip on charts.
- Header is a simple `Text` title (`Lịch sử`) with no menu button.
- Dark/light themes: legacy gel tokens exist for both, but the smart block (`tokens.smart`) is already populated and used by Dashboard.

## Target state

1. **Visual language**: History adopts the shared `smart` token block (`colors`, `spacing`, `typography`, `radius`, `cardShadow`) for background, cards, text, and accents. The legacy gel tokens remain for Settings management surfaces until their own redesign.
2. **Background**: ambient diagonal wash (`tealTint → page → amberTint`, opacity 3–5%, blur large) — same as Dashboard.
3. **Header**: Menu button (☰) + screen title **Lịch sử** (font size 26–28). No connection chip on History (Dashboard-only per current spec).
4. **Filters**: two white dropdowns below the header:
   - Room selector (dropdown, replaces chip strip).
   - Time range selector (dropdown, replaces chips: `1 giờ` / `24 giờ` / `7 ngày`).
   - Below the dropdowns: the actual date range text (e.g., `07/09 14:00 – 08/09 14:00`), wraps on narrow screens.
5. **Charts**: two cards stacked vertically on all form factors:
   - Card 1: **Nhiệt độ (°C)** — teal accent (`smart.colors.teal`), thermometer icon.
   - Card 2: **Độ ẩm (%)** — blue accent (`humidity` token, already `#3B7FC4`/`#6AA9E0`), water-drop icon.
   - Each card: icon + title + stats (Thấp nhất / Cao nhất / Trung bình with units).
   - Stats layout: tablet — right of title; phone — below title as a separate row.
   - Chart: line thickness 2, area fill same color at 4–6% opacity, light gray grid (`smart.colors.cardBorder`), 24h time labels, date added when crossing midnight, reduced tick count on narrow screens.
   - Tooltip: shows time + value on touch/hover; hidden on mount and on interaction end.
   - Chart height: 160–200 phone, 200–240 tablet.
6. **Bottom navigation**: reuse the Dashboard's `RootTabs` (3 tabs: Dashboard grid icon, History clock outline active teal, Settings gear outline). No Sensors tab. No underline (per amendment 3).
7. **States**: loading, error, no-data (distinct from zero), no-room, no-sensor — all preserved and restyled to the smart language.
8. **Data integrity**: stats computed from the same points as the chart; no mockup numbers copied.

## Scope

### In scope

- `app-mobile/src/modules/history/ui/HistoryScreen.tsx` — full restyle + layout rework.
- `app-mobile/src/core/i18n/strings.ts` — new strings for dropdown labels, stats labels with units, date range format.
- `app-mobile/src/core/theme/tokens.ts` — potentially extend `smart.typography` with `statsValue` (20–24) if not already covered; document any additions.
- New shared component(s) if needed:
  - `Dropdown` or `FilterDropdown` (white background, smart border, radius, chevron icon) — reusable for room + range.
  - `ChartCard` (smart-styled card with icon, title, stats row, victory chart, tooltip).
- Tests: `HistoryScreen.test.tsx` (new or updated), component tests for new dropdown/chart card, integration with existing history store.
- RootTabs: verify History tab icon is `time-outline` (clock) and active state matches Dashboard amendment 3 (teal + semibold + subtle bg tint, no underline).

### Out of scope

- MQTT/relay/telemetry logic.
- InfluxDB adapter, flux query builder, history store — data layer untouched.
- Dashboard tab (already redesigned).
- Settings tab (except shared token consumption).
- RootTabs structure changes (icon swap only if needed).
- No new dependencies.

## Architecture decisions

1. **Token consumption**: History reads `tokens.smart.*` for all smart-language properties; legacy gel tokens are no longer consumed by History after this task.
2. **Dropdown component**: a controlled, presentational `FilterDropdown` component is introduced (or an existing one is reused if it already exists in the codebase). It must be theme-aware, support Vietnamese labels, and meet the 44×44 touch target.
3. **Chart card component**: a `HistoryChartCard` component encapsulates icon + title + stats + chart + tooltip. It is pure/presentational: receives `field`, `label`, `unit`, `points`, `color`, `tokens`, `width`, and `range` (for tick formatting).
4. **Tooltip**: victory-native's `VictoryTooltip` or a custom SVG overlay; must not render on initial mount.
5. **Date range display**: computed from the active `HistoryRange` and current time; formatted as `DD/MM HH:mm – DD/MM HH:mm` (24h). On narrow screens it wraps to two lines.
6. **Stats placement**: responsive via `useWindowDimensions` + the same `wide` breakpoint pattern used by Dashboard (`>= 768` or the existing stacked breakpoint).
7. **Iconography**: thermometer icon for temperature, water-drop for humidity. Use `@expo/vector-icons` Ionicons (already installed) — no new icon library.
8. **Grid/tick formatting**: shared utility for time-axis tick formatting (24h, date-on-midnight-crossing, reduced count on narrow) to keep both charts aligned.

## Relevant files/modules/symbols

- `app-mobile/src/modules/history/ui/HistoryScreen.tsx` — main screen.
- `app-mobile/src/modules/history/api/index.ts` — public facade (types + `computeSeriesStats`).
- `app-mobile/src/modules/history/internal/domain/seriesStats.ts` — stats computation (pure).
- `app-mobile/src/modules/history/internal/domain/fluxQueryBuilder.ts` — range/duration mapping.
- `app-mobile/src/modules/dashboard/api/index.ts` — `RoomSelector` (to be replaced by dropdown) and potentially shared grid metrics.
- `app-mobile/src/core/theme/tokens.ts` — smart token block.
- `app-mobile/src/core/i18n/strings.ts` — Vietnamese strings.
- `app-mobile/src/app/shell/RootTabs.tsx` — tab bar icons (verify History icon).
- `app-mobile/src/modules/history/README.md` — update architecture notes.

## Implementation steps

1. **Audit existing components**: check if a reusable dropdown already exists in `src/core` or `src/modules/*/ui`. If not, create `FilterDropdown.tsx` in `src/modules/history/ui/` (or `src/core/ui/` if intended for reuse).
2. **Add/verify strings**: add `history.range1h`, `history.range24h`, `history.range7d`, `history.statsMin`, `history.statsMax`, `history.statsAvg`, `history.dateRange` format keys to `STRINGS`.
3. **Create `HistoryChartCard` component**:
   - Props: `field`, `label`, `unit`, `points`, `color`, `tokens`, `width`, `range`, `isTablet`.
   - Renders smart card (white bg, hairline border, radius 14–16, shadow).
   - Header: icon (22–24) + title (16–18) + stats row (phone: below, tablet: right).
   - Stats: three columns with label + value + unit; value font 20–24.
   - Chart: victory-native `VictoryLine` + `VictoryArea` (fill 4–6% opacity) + `VictoryAxis` (24h ticks, date on midnight crossing, reduced count on narrow).
   - Tooltip: `VictoryTooltip` or custom; hidden on mount.
4. **Rework `HistoryScreen`**:
   - Replace `LinearGradient` gel with smart ambient wash.
   - Add header: Menu button + `Lịch sử` title (26–28).
   - Replace `RoomSelector` + range chips with two `FilterDropdown`s side-by-side (or stacked on very narrow screens).
   - Add date-range text below filters.
   - Replace `ChartCard` with `HistoryChartCard` for temperature and humidity.
   - Preserve all state branches (loading, error, no rooms, no sensors, no data).
5. **Update RootTabs** (if needed): verify History tab uses `time-outline` and active styling matches Dashboard (teal + semibold + subtle bg tint, no underline). If the icon is wrong, swap it.
6. **Add tests**:
   - `HistoryScreen.test.tsx`: renders dropdowns, date range, two chart cards, stats values, no-data state, error state, loading state.
   - `HistoryChartCard.test.tsx`: stats correctness, tooltip hidden on mount, chart renders with correct color.
   - `FilterDropdown.test.tsx`: opens/closes, selects value, meets touch target.
   - Update existing history tests if they assert gel-specific styles.
7. **Update documentation**: `app-mobile/src/modules/history/README.md` — remove gel references, document smart language adoption and new components.
8. **Run gates**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` (source only; android/ generated failures are ISSUE-007).

## Constraints

- TS strict, no `any`, no `console.*` outside core/logger.
- Prettier, ESLint boundaries (history imports only `core` + other modules' `api/`).
- No new dependency.
- Use existing `victory-native` for charts.
- Use existing `@expo/vector-icons` for icons.
- Zod validates all external data (unchanged).
- Manual DI wiring only in composition root (`app/`).

## Acceptance criteria

1. History tab visually matches the Dashboard Smart Home language (background, cards, text, accents).
2. Header shows Menu + **Lịch sử**; below are two white dropdowns (room, time range) and the actual date range text.
3. Time range dropdown offers exactly `1 giờ` / `24 giờ` / `7 ngày`; no chip row exists below.
4. Two chart cards stack vertically: Nhiệt độ (teal, thermometer) then Độ ẩm (blue, water-drop).
5. Each card shows stats (Thấp nhất / Cao nhất / Trung bình) with correct units; values match the chart data.
6. Chart line thickness 2, area fill 4–6% opacity, light gray grid, 24h time labels, date added when crossing midnight, reduced ticks on narrow screens.
7. Tooltip appears on touch/hover and hides on interaction end; no tooltip on mount.
8. Stats layout: tablet right of title; phone below title.
9. Chart height: 160–200 phone, 200–240 tablet.
10. Bottom navigation has exactly 3 tabs; History active state is teal + semibold + subtle bg tint (no underline).
11. Loading, error, no-data, no-room, and no-sensor states render correctly and are styled to the smart language.
12. No-data state shows `Chưa có dữ liệu`, never `0`.
13. All existing tests pass; new tests cover the redesigned components.
14. `typecheck`, `lint`, `test`, `format:check` (source) all pass.
15. User provides phone + tablet screenshots for visual acceptance.

## Required tests / verification

### Automated

- `HistoryScreen.test.tsx`: dropdown rendering, date range text, card order, state branches.
- `HistoryChartCard.test.tsx`: stats computation, tooltip behavior, chart props.
- `FilterDropdown.test.tsx`: interaction, accessibility, touch target.
- `RootTabs.appearance.test.tsx`: verify History icon + active state (if changed).
- Updated: any test asserting gel styles on History.

### Manual (user-driven)

- On device: open History tab, verify visual sync with Dashboard.
- Change room and range via dropdowns; verify date range text updates.
- Touch chart; verify tooltip shows time + value; release; verify tooltip hides.
- Rotate to landscape / use tablet; verify stats move to right of title and chart height increases.
- Trigger loading, error, no-data, no-sensor states; verify styling.
- Verify bottom nav: 3 tabs, History active teal + semibold, no underline.

## Risks / open questions

- **Dropdown reusability**: if no dropdown exists, creating one adds a new component. Mitigation: keep it minimal and theme-driven.
- **Tooltip on victory-native**: `VictoryTooltip` may need explicit native SVG primitives (same React 19 workaround as the existing charts). Mitigation: follow the existing `NATIVE_CHART_*` pattern.
- **Tick alignment between two charts**: both charts must share the same x-axis domain and tick formatting. Mitigation: compute a shared `tickValues`/`tickFormat` utility in the screen and pass it down.
- **Date range text wrapping**: on very narrow screens the range string may be long. Mitigation: allow wrap, use `flexShrink: 1`, and test on small widths.
- **Dark theme**: verify the smart dark palette (already approved) works for History; no new dark tokens needed.

## User approval

- Pending.
