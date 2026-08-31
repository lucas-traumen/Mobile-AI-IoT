# history module

InfluxDB v2 history queries (read-only Flux) + series statistics.

## Public API (`api/index.ts`)

- `HistoryQuery` value object: `{ measurement, range, fields, deviceIds }`
  (CP-R5). Empty `fields` = default sensor fields; empty `deviceIds` = no
  device filter (used by the Settings `checkConnection` probe).
- `HistorySeries`: `{ deviceId: string | null, field, points }` — identity is
  `deviceId + field`. Rows written without a `deviceId` tag parse as
  `deviceId: null`; they are **excluded from room history** (never displayed
  — the app does not guess an owner for untagged data). Collector migration:
  write sensor rows with the `deviceId` tag so per-device history works.
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

- `domain/fluxQueryBuilder.ts` — Flux with `keep(columns: [..., "deviceId"])`
  - `group(columns: ["deviceId", "_field"])`; CSV parser keeps the `deviceId`
    column and tags each series.
- `domain/roomSensorFields.ts` — room → (deviceId, field) pairs. Room-level
  "Tất cả" pooling was removed (CP-R3): a `null` room yields `[]`, never a
  cross-room union.
- `data/influxV2Adapter.ts` — HTTP `POST {url}/api/v2/query?org={org}` with
  Bearer token; zod-validated CSV → `HistorySeries[]`.
- `data/historyStore.ts` — request-id guard + `range` UI state. The room
  selection is owned by the `dashboard` module (one shared active room);
  this store holds only query results.

## UI

- `ui/HistoryScreen.tsx` — room chips + 1H/24H/7D chips; content scrolls
  vertically with one card per series (`deviceId + field`), titled
  "device name · capability label", responsive chart width, Min/Max/Trung bình
  row. `null` room → "no rooms" hint; sensor-less room → dedicated hint (and
  stale cards from the previous room are hidden). Series without a device id
  (legacy untagged rows) are never rendered.
