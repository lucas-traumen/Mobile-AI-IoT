# history module

InfluxDB v2 history queries (read-only Flux) + series statistics.

## Public API (`api/index.ts`)

- `HistoryQuery` value object: `{ measurement, range, fields, roomId }`
  (approved room-sensor rework). Empty `fields` = default sensor fields;
  `roomId: null` = no room filter (used by the Settings raw Influx probe).
- `HistorySeries`: `{ roomId: string | null, field, points }` — identity is
  `roomId + field`. Rows written without a `roomId` tag parse as
  `roomId: null` and are never guessed into a room (not displayed).
  Collector migration: write sensor rows with the `roomId` tag.
- `buildFluxQuery(bucket, query)`, `parseFluxCsv(csv)` — pure functions.
- `HistoryService` port + `historyQueryForRoom(devices, capabilities, roomId,
range)` — builds the room's exact query or `null` when the room has no
  telemetry sensor device.
- `computeSeriesStats(points)` — min/max/avg.
- `historyStore` — zustand store with a **stale-request guard**: `beginRequest()`
  returns an id; `setSeriesIfCurrent(id, ...)` / `setErrorIfCurrent(id, ...)`
  drop results from superseded requests, so a slow older response can never
  overwrite a newer room/range result.

## Internal

- `domain/fluxQueryBuilder.ts` — Flux with `keep(columns: [..., "roomId"])`
  and `group(columns: ["roomId", "_field"])`; CSV parser keeps the `roomId`
  column and tags each series.
- `domain/roomSensorFields.ts` — room → registered sensor fields, derived
  from the pure sensor projection (`{roomId, field}` registrations). Room-level
  "Tất cả" pooling was removed (CP-R3): a `null` room yields `[]`, never a
  cross-room union.
- `data/influxV2Adapter.ts` — HTTP `POST {url}/api/v2/query?org={org}` with
  Bearer token; zod-validated CSV → `HistorySeries[]`.
- `data/demoHistorySource.ts` — `DemoHistoryDataSource`: deterministic
  (seeded) fake series per requested `room × field` for the Settings
  "Dữ liệu demo (lịch sử)" toggle — no network, no persistence; unit-less
  capability fields are produced like any other field, so the demo toggle
  exercises every registered room out of the box.
- `data/historySourceSelector.ts` — `SelectableHistoryDataSource`: the UI
  front door (same port). OFF (default) → Influx; ON → demo. The flag is
  in-memory only (resets to OFF on restart); `configure` always reaches the
  Influx adapter and the Settings connection probe keeps probing Influx
  directly, so demo mode can never fake a connectivity check.
- `data/historyStore.ts` — request-id guard + `range` UI state. The room
  selection is owned by the `dashboard` module (one shared active room);
  this store holds only query results.

## UI

- `ui/HistoryScreen.tsx` — the gel layout (Dashboard visual language):
  - `LinearGradient` screen background from `tokens.gradient` (scoped to
    this screen);
  - room navigation reuses the Dashboard's controlled `RoomSelector` (☰
    expand + non-wrapping text-only quick strip + centered full-list
    modal), imported through the dashboard module's public facade
    (`@modules/dashboard/api` — cross-module UI may only cross via `api/`,
    per the boundaries rules in `.eslintrc.js`);
  - centered 1H/24H/7D range chips; the ACTIVE chip is a gel pill
    (`tokens.chipActiveBg` translucent tint + bold label, never solid
    `primary`);
  - content scrolls vertically with one gel card per REGISTERED room sensor
    (`roomId + field`, borderRadius 20, borderless, translucent inner
    edge from `tokens.cardInnerEdge`), pastel tinted like the Dashboard
    cards via a small pure field → token mapping
    (`cardTintForField`: temperature/humidity tints, `surfaceGlass`
    fallback) — history cards are not widgets, so `resolveCardTint` is
    deliberately NOT called with a fake config. Card header = capability
    label only (15pt semibold, series accent color; NO device name, NO
    header average), responsive chart width, fixed chart height 240,
    Min/Max/Trung bình row (labels 13pt / values 17pt; the Trung bình
    value keeps the accent color).
  - `null` room → "no rooms" hint; sensor-less room → dedicated hint (and
    stale cards from the previous room are hidden). Series without a device
    id (legacy untagged rows) are never rendered.
  - All gel colors are theme tokens — two new tokens back this screen:
    `cardInnerEdge` and `chipActiveBg` (both themes).
- **Charts must pass native SVG primitives as EXPLICIT props** — React 19
  removed function-component `defaultProps`, so victory-native@36's native
  overrides (`groupComponent`, `containerComponent`, `backgroundComponent`,
  `axisComponent`/`tickComponent`/`gridComponent`, `tickLabelComponent`/
  `axisLabelComponent`, `dataComponent`, `labelComponent` — see
  `HistoryScreen.tsx`) are silently dropped; without them victory-core's web
  SVG defaults render and crash on device ("View config getter callback for
  component 'line' must be a function").
