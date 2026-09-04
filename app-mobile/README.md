# IoT Dashboard (app-mobile)

Expo (SDK 57) + TypeScript mobile app (Android-first) for a customizable IoT
dashboard: realtime temperature/humidity over MQTT (WebSocket), room-scoped
relay control (`{roomId, slot}` identity, slots 1..10 per room), sensor
history charts from InfluxDB v2, a Room/Device/Capability model, a
widget-based dashboard engine (multiple dashboards, edit mode, grid layout)
and settings for broker/InfluxDB/theme. UI is Vietnamese with two explicit
themes (Sáng/Tối — light/dark).

Architecture: **Modular Monolith + Hexagonal** — see [Architecture](#architecture).

## Requirements

- Node `>= 22.11.0`
- Expo SDK 57 toolchain (`npx expo` commands below)

## Setup

```bash
cd app-mobile
npm install
npm start            # Metro dev server
npm run android      # build & launch on emulator/device (Expo Go or dev build)
```

First Android build may need `expo run:android` for native modules
(`react-native-svg` etc. are Expo-compatible and work in Expo Go).

## Commands

| Command                           | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `npm start`                       | Start Metro                               |
| `npm run android` / `npm run ios` | Launch on device/emulator                 |
| `npm test`                        | Jest (jest-expo preset)                   |
| `npx tsc --noEmit`                | Typecheck (strict)                        |
| `npm run lint`                    | ESLint (incl. `eslint-plugin-boundaries`) |
| `npm run format:check`            | Prettier check                            |

## Architecture

```
app-mobile/
  App.tsx                    # root: composition root bootstrap + lifecycle
  src/
    core/                    # no business logic — shared infrastructure
      eventbus/              # typed EventBus (Observer), EventMap
      di/                    # manual DI Container
      errors/                # Result<T, AppError>, error taxonomy
      time/                  # Clock abstraction (SystemClock/FakeClock)
      logger/                # structured logger (only place using console)
      theme/                 # ThemeTokens (light/dark) + ThemeProvider/useTheme
      i18n/                  # STRINGS — every Vietnamese UI label
      constants.ts           # centralized constants (no magic numbers)
      events.ts              # shared event payload types
      topics.ts              # MQTT topic builders
    modules/                 # each module has api/index.ts facade + internal/
      settings/              # broker + InfluxDB + ui.theme settings (zod → AsyncStorage)
      telemetry/             # MQTT client port/adapter, payload validation, store
      relay/                 # relay command builders + optimistic store
      history/               # HistoryQuery + FluxQueryBuilder + InfluxDB v2 adapter + series stats
      devices/               # rooms/devices registry, capability model, state sync
      widgets/               # WidgetRegistry + WidgetContext + 3 built-in widgets (sensor-value / switch / room-device-list)
      dashboard/             # room-aware grid layout engine, repository, service, dashboards UI
    app/
      wiring/container.ts    # composition root (manual DI wiring)
      shell/TabShell.tsx     # 3-tab shell: Dashboard / Lịch sử / Cài đặt
      settings/              # SettingsCoordinator: Settings tab navigation (root → management screens)
```

### Dependency rules (enforced by `eslint-plugin-boundaries`)

- Modules import **`core`** and **other modules' `api/` facade** only.
- A module must **never** import another module's `internal/`.
- `app/` (composition root + shell) may import anything; `core` imports only
  `core`; external packages are unrestricted.
- Domain logic lives in `internal/domain/` as **pure functions**; side effects
  (MQTT, HTTP, storage) only in `internal/data/` adapters; UI state in zustand
  stores (thin ViewModels, no business logic).

### Data flow

1. Settings are persisted via AsyncStorage and validated with zod.
2. `settings:changed` events reconfigure telemetry / relay / history.
3. MQTT messages arrive on the shared client; telemetry payloads are
   zod-validated; invalid payloads are dropped with a warn log (never crash).
4. Relay commands are validated (room-scoped `{roomId, index 1..10}`, state
   ON/OFF) before publishing to `<prefix>/room/<roomId>/cmnd/relay/<1..10>`;
   UI is optimistic, corrected by
   `<prefix>/room/<roomId>/stat/relay/<1..10>` feedback when the device
   reports.
5. History queries InfluxDB v2 (Flux, read-only) with a Bearer token and maps
   CSV responses to chart points.
6. Devices layer (incremental bridge): widgets never know MQTT topics. A widget
   binds `deviceId + capability`; `DeviceStateSync` mirrors `telemetry:received`
   / `relay:*` bus events into the capability state store, and `switch`
   commands are delegated to the relay service. Deleting a device cascades via
   `devices:changed` → `removeWidgetsForDevice` across all dashboards.

### Dashboard engine (`dashboard` + `widgets` modules)

- Grid: 2 columns; widget sizes `1x1 | 2x1 | 1x2 | 2x2`; pure layout engine
  (find free slot, move/resize with bounds+overlap rejection, vertical
  compaction).
- **Responsive rendering:** the grid canvas width is measured with
  `onLayout` (window width only until the first layout event) and fed to the
  pure `gridMetrics` helpers — card rects and drag snapping always share the
  same metrics. Row height tracks the cell width 1:1, clamped to
  `[160, 176]`; invalid/unmeasured widths fall back to a documented default
  canvas so cells are never negative/NaN.
- **Safe area:** `SafeAreaProvider` mounts at the app root; `TabShell` owns
  the runtime insets exactly once (content top inset + tab-bar bottom inset,
  whose surface fills the inset). Absolute surfaces (Add Widget flow) pad
  their footer by the runtime bottom inset via `@core/safeArea` helpers.
- **Room-scoped layout (V2):** a slot is free only within the same room — a
  widget added in room A never pushes widgets in room B, and vertical
  compaction runs per room (the room-level "Tất cả" was removed).
- **View-only dashboard, editing under Settings:** the Dashboard tab renders
  chips + the grid only. All mutations (add/move/resize/rebind/remove,
  dashboard create/delete) live in Cài đặt → Quản lý → "Chỉnh sửa bảng điều
  khiển" (`DashboardLayoutEditor`).
- Draft editing: the editor mutates a draft copy of the layout; the live grid
  stays untouched until "Lưu". Lưu errors (validation, persistence) surface
  in the editor and keep the form open; "Hủy" discards the draft. Switching
  the editor's room mid-session updates the room view without resetting the
  draft. Removing a device rebinds its widgets via a draft rebind picker.
- Multiple dashboards: create/delete (last dashboard is protected; switching
  and renaming live in Settings); layouts persist across restarts.
- Widget registry: `sensor-value`, `switch`,
  `room-device-list`. RETIRED types (never registered again; legacy
  persisted instances are removed on load): `connection` (Phase 1 — the
  global MQTT status lives in the Dashboard header and Settings) and
  `history-chart` (approved room-sensor rework — History is a derived tab,
  never a Dashboard widget); each definition declares `supportedSizes` and
  `suggestForCapabilities` filters by the selected device's capabilities. Widgets receive runtime services (live state,
  series, commands, history queries) through React context
  (`WidgetServicesProvider`) — never module internals.
- **Reactive widget state (CP-R1):** widgets subscribe to the device state
  store through `subscribeDeviceState` + `useSyncExternalStore`
  (`useCapabilityState`/`useCapabilitySeries`). Snapshots are per-key, so a
  widget only re-renders when _its_ `deviceId:capability` value changes —
  unrelated store writes notify but skip the render (identity stability).
- **Add-widget flow (room-authoritative):** while editing a room the flow
  lists only that room's compatible devices, skips the redundant room step
  and always persists `roomId = editorRoomId` — the unbound room-overview
  widget (`room-device-list`) inherits the editor room the same way.
- **Per-room device capacity:** each concrete room holds at most 10
  telemetry-sensor and 10 relay devices (relay slots are room-scoped 1..10,
  duplicate slots rejected per room). The registry service is authoritative;
  the device-management UI mirrors the caps with counters/filters and shows
  general operation feedback in a top-center banner (field errors stay
  inline; destructive actions keep their confirmation dialogs).

### Single active room (V2)

- The app has **one shared active room** (`dashboardStore.activeRoomId`):
  Dashboard and History both read it. First run / deleted room falls back to
  the first ordered room; `null` = no rooms yet (directed to Settings).
- Capability labels shown in UI are the catalog's `label` (e.g. "Nhiệt độ"),
  while bindings, MQTT topics, InfluxDB `_field` values and the history query
  carry the machine key (`temperature`). The catalog form labels the machine
  key "Mã trường dữ liệu (MQTT/InfluxDB)" — it is fixed at creation (strict
  ASCII format for new keys), the label stays editable, and curated
  icon/preset suggestions prefill key/label/unit (selecting an icon alone
  never overwrites typed text).

### Theme system (`core/theme`)

- `ThemeTokens` (light + dark) are the only color source; screens call
  `useTheme()` and never hard-code colors (fixed per-field chart accents are
  the documented exception).
- Capability accents (sensor tiles, history cards, device list values) go
  through the centralized `resolveCapabilityAccent(field, def, tokens)`:
  built-in temperature/humidity resolve from the active theme tokens, custom
  capabilities use the catalog color. Built-in widgets never hard-code
  per-field colors.
- `ThemeProvider` receives the persisted mode (`light | dark`) from the
  settings store (`ui.theme`); the user picks Light/Dark explicitly —
  `Hệ thống` (`'system'`) was removed and persisted legacy values migrate
  deterministically to Light while valid MQTT/Influx credentials survive.
  Toggle it in Settings → Giao diện (Sáng/Tối) — it applies immediately.
- `app.json` still sets `userInterfaceStyle: "automatic"` (native OS chrome
  follows the device scheme); the in-app UI no longer does — the Expo
  `StatusBar` is themed per the explicitly selected tokens. Aligning the
  native chrome with the explicit choice is a possible follow-up.

## MQTT topic contract

Prefix is configurable in Settings (default `home`).

| Topic                                       | Payload                         | Direction               |
| ------------------------------------------- | ------------------------------- | ----------------------- |
| `<prefix>/room/<roomId>/sensor/<field>`     | one finite number (e.g. `25.6`) | device → app            |
| `<prefix>/room/<roomId>/cmnd/relay/<1..10>` | `"ON"` / `"OFF"`                | app → device            |
| `<prefix>/room/<roomId>/stat/relay/<1..10>` | `"ON"` / `"OFF"`                | device → app (optional) |

Room-scoped per-field sensor telemetry (approved
room-sensor-derived-history-layout-rework plan): each topic carries EXACTLY
ONE finite numeric metric and the topic itself carries the source identity
`{roomId, field}` — for example `home/room/room-living/sensor/temperature →
25.6` and `home/room/room-living/sensor/humidity → 60`. The app subscribes
the wildcard `<prefix>/room/+/sensor/+` and dispatches exactly by room AND
field: a room-A temperature message updates only room A's temperature
registration; rooms and fields never cross-contaminate. Malformed topics
(wrong prefix/shape, empty or wildcard-like segments) and non-finite
payloads are dropped with a warn log.

The legacy global JSON topic `<prefix>/tele/sensor` is RETIRED (breaking
change, not dual-read): without source identity a shared payload cannot be
attributed to a room. Collectors must migrate to the per-field room-scoped
topics above.

Relay topics are **room-scoped** (settings-information-architecture plan):
the relay identity is `{ roomId, slot }` with slots 1..10 per room, so the
same slot number can be used independently in different rooms (each concrete
room holds at most 10 sensor METRICS and 10 relays — one visible sensor =
one metric, so a board publishing temperature + humidity consumes two
slots). Persisted legacy relay devices that already carry `roomId` + slot
1..3 remain valid and naturally use the new route; the relay topics are a
breaking change for old firmware/automation still listening on the legacy
global `<prefix>/cmnd|stat/relay/<n>` topics. The app subscribes the feedback
wildcard `<prefix>/room/+/stat/relay/+` and regex-escapes the configured
prefix when matching.

The app connects over **WebSocket** (`ws://host:port`, default port 9001).

> Note: since V2 widgets bind to `deviceId + capability` (devices module), not
> to topics — the topic contract above stays the wire format; the
> telemetry-sensor/relay bindings map capabilities onto it. History uses the
> room-scoped `{roomId, field}` identity directly (see InfluxDB below).

### mosquitto WebSocket listener

Add to `mosquitto.conf`:

```ini
listener 9001
protocol websocket
allow_anonymous true        # or configure auth + set username/password in the app
```

Then (re)start mosquitto. The app connects to `ws://<broker-host>:9001` with
the settings entered in Settings → Cấu hình nâng cao. For a quick test:

```bash
mosquitto_pub -t 'home/room/room-living/sensor/temperature' -m '25.6'
mosquitto_pub -t 'home/room/room-living/sensor/humidity' -m '60'
mosquitto_pub -t 'home/room/room-living/cmnd/relay/1' -m 'ON'
mosquitto_pub -t 'home/room/room-living/stat/relay/1' -m 'ON'
```

## InfluxDB v2 setup (read-only)

1. Create an organization + bucket (e.g. `iot` / `sensors`).
2. Create an **API token with read access** (`Data → API Tokens → Generate`).
3. Enter url / org / bucket / token in the app Settings screen.

The token is stored **on the device only** (AsyncStorage) and never committed.
The app issues `POST {url}/api/v2/query?org={org}` with `Authorization: Token
…` and `Accept: application/csv`, then maps the CSV to chart series.

### Writing sensor data into InfluxDB

The History identity is `{roomId, field}` (approved room-sensor rework): the
collector must write the `sensors` measurement with **a `roomId` tag** and
the sensor field as the Influx field key:

```influx
# line protocol example (one point per metric is fine — fields may be batched)
sensors,roomId=room-living temperature=25.6
sensors,roomId=room-living humidity=60
```

The app queries a single measurement, filters the room's `roomId` tag and the
room's registered sensor fields, and keeps/groups `roomId, _field` so every
series stays room+field-separated and untagged rows are never guessed into a
room:

```flux
from(bucket: "sensors")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "sensors")
  |> filter(fn: (r) => r._field == "temperature" or r._field == "humidity")
  |> filter(fn: (r) => r.roomId == "room-living")
  |> keep(columns: ["_time", "_field", "_value", "roomId"])
  |> group(columns: ["roomId", "_field"])
```

> **roomId-tagged contract (approved room-sensor rework):** history series
> are identified by `roomId + field` — one History card per REGISTERED room
> sensor, automatically (no chart configuration exists anywhere in the app).
> A registered sensor with no points in the range renders a
> `Chưa có dữ liệu` card instead of disappearing. Rows written WITHOUT the
> `roomId` tag cannot be attributed to a room and are never guessed into one
> (the query filters on the `roomId` tag; `roomId: null` series returned by
> legacy CSVs are not displayed). Migrate the collector to write the
> `roomId` tag (e.g. `sensors,roomId=room-living temperature=25.6`).

## Key libraries

| Library                                     | Purpose                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `mqtt` (v5)                                 | Pure-JS MQTT over WebSocket (RN's built-in WebSocket)                   |
| `zustand`                                   | Thin ViewModel stores                                                   |
| `zod`                                       | Validation of all external data (MQTT payloads, InfluxDB CSV, settings) |
| `@react-native-async-storage/async-storage` | Settings / devices / dashboards persistence                             |
| `victory-native` (v36) + `react-native-svg` | Charts + sparklines                                                     |
| `@expo/vector-icons`                        | Tab bar + widget icons                                                  |

> **Note on fallbacks:** the plan named `react-native-mqtt-expo` (primary) and
> `sp-react-native-mqtt` (fallback). `react-native-mqtt-expo` does not exist on
> npm; `sp-react-native-mqtt` is a native TCP-only module that would break the
> WebSocket/no-dev-client design. Chosen instead: `mqtt` v5 (pure JS,
> WebSocket, ships RN types). Charting chose `victory-native` v36 (works with
> plain `react-native-svg`, no Skia) over v40 (requires Skia + reanimated +
> gesture-handler).

## Module READMEs

- [`src/modules/settings/README.md`](src/modules/settings/README.md)
- [`src/modules/telemetry/README.md`](src/modules/telemetry/README.md)
- [`src/modules/relay/README.md`](src/modules/relay/README.md)
- [`src/modules/history/README.md`](src/modules/history/README.md)
- [`src/modules/devices/README.md`](src/modules/devices/README.md)
- [`src/modules/widgets/README.md`](src/modules/widgets/README.md)
- [`src/modules/dashboard/README.md`](src/modules/dashboard/README.md)

## Security notes

- No `.env`, no secrets in the repo. The InfluxDB token lives in device
  storage only.
- MQTT credentials are optional and stored on-device as well.
