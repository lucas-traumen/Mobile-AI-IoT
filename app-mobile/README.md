# IoT Dashboard (app-mobile)

Expo (SDK 57) + TypeScript mobile app (Android-first) for a customizable IoT
dashboard: realtime temperature/humidity over MQTT (WebSocket), relay control
(3 relays ON/OFF), sensor history charts from InfluxDB v2, a Room/Device/
Capability model, a widget-based dashboard engine (multiple dashboards, edit
mode, grid layout) and settings for broker/InfluxDB/theme. UI is Vietnamese
with light/dark/system themes.

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
      widgets/               # WidgetRegistry + WidgetContext + 5 built-in widgets
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
4. Relay commands are validated (index 1..3, state ON/OFF) before publishing;
   UI is optimistic, corrected by `stat/relay/<n>` feedback when the device
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
- Widget registry: `sensor-value`, `switch`, `history-chart`,
  `room-device-list` (the `connection` widget was retired in Phase 1 — the
  global MQTT status lives in the Dashboard header and Settings; legacy
  persisted connection widgets are removed on load); each definition declares
  `supportedSizes` and `suggestForCapabilities` filters by the selected
  device's capabilities. Widgets receive runtime services (live state,
  series, commands, history queries) through React context
  (`WidgetServicesProvider`) — never module internals.
- **Reactive widget state (CP-R1):** widgets subscribe to the device state
  store through `subscribeDeviceState` + `useSyncExternalStore`
  (`useCapabilityState`/`useCapabilitySeries`). Snapshots are per-key, so a
  widget only re-renders when _its_ `deviceId:capability` value changes —
  unrelated store writes notify but skip the render (identity stability).

### Single active room (V2)

- The app has **one shared active room** (`dashboardStore.activeRoomId`):
  Dashboard and History both read it. First run / deleted room falls back to
  the first ordered room; `null` = no rooms yet (directed to Settings).
- Capability labels shown in UI are the catalog's `label` (e.g. "Nhiệt độ"),
  while bindings, MQTT topics, InfluxDB fields and the history query carry
  the machine key (`temperature`). The catalog form edits both: a machine
  key is fixed at creation and the label stays editable.

### Theme system (`core/theme`)

- `ThemeTokens` (light + dark) are the only color source; screens call
  `useTheme()` and never hard-code colors (fixed per-field chart accents are
  the documented exception).
- Capability accents (sensor tiles, history cards, device list values) go
  through the centralized `resolveCapabilityAccent(field, def, tokens)`:
  built-in temperature/humidity resolve from the active theme tokens, custom
  capabilities use the catalog color. Built-in widgets never hard-code
  per-field colors.
- `ThemeProvider` receives the persisted mode (`system|light|dark`) from the
  settings store (`ui.theme`); `'system'` follows the device color scheme.
  Toggle it in Settings → Giao diện (Hệ thống/Tối/Sáng) + Lưu cài đặt.
- `app.json` sets `userInterfaceStyle: "automatic"` so native chrome follows
  the device scheme; the Expo `StatusBar` is themed per active tokens.

## MQTT topic contract

Prefix is configurable in Settings (default `home`).

| Topic                           | Payload                                                                     | Direction               |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| `<prefix>/tele/sensor`          | `{"temperature": 25.6, "humidity": 60.2, "ts": 1756300000}` (`ts` optional) | device → app            |
| `<prefix>/cmnd/relay/<1\|2\|3>` | `"ON"` / `"OFF"`                                                            | app → device            |
| `<prefix>/stat/relay/<1\|2\|3>` | `"ON"` / `"OFF"`                                                            | device → app (optional) |

The app connects over **WebSocket** (`ws://host:port`, default port 9001).

> Note: since V2 widgets bind to `deviceId + capability` (devices module), not
> to topics — the topic contract above stays the wire format; the
> telemetry-sensor/relay bindings map capabilities onto it.

### mosquitto WebSocket listener

Add to `mosquitto.conf`:

```ini
listener 9001
protocol websocket
allow_anonymous true        # or configure auth + set username/password in the app
```

Then (re)start mosquitto. The app connects to `ws://<broker-host>:9001` with
the settings entered in the Settings screen. For a quick test:

```bash
mosquitto_pub -t 'home/tele/sensor' -m '{"temperature": 25.6, "humidity": 60.2}'
mosquitto_pub -t 'home/cmnd/relay/1' -m 'ON'
```

## InfluxDB v2 setup (read-only)

1. Create an organization + bucket (e.g. `iot` / `sensors`).
2. Create an **API token with read access** (`Data → API Tokens → Generate`).
3. Enter url / org / bucket / token in the app Settings screen.

The token is stored **on the device only** (AsyncStorage) and never committed.
The app issues `POST {url}/api/v2/query?org={org}` with `Authorization: Token
…` and `Accept: application/csv`, then maps the CSV to chart series.

### Writing sensor data into InfluxDB

Any Telegraf/collector can write the same readings the MQTT stream carries,
e.g. with `measurement = sensors`, `field = temperature` / `field = humidity`,
`value = 25.6` / `60.2`, and **a `deviceId` tag** per device:

```influx
# line protocol example
sensors,deviceId=sensor-01 temperature=25.6,humidity=60.2
```

The app queries a single measurement, filters by the room's device ids and
keeps the `deviceId` tag so each series stays device-separated:

```flux
from(bucket: "sensors")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "sensors")
  |> filter(fn: (r) => r._field == "temperature" or r._field == "humidity")
  |> filter(fn: (r) => contains(value: r.deviceId, set: ["sensor-01"]))
  |> keep(columns: ["_time", "_field", "_value", "deviceId"])
  |> group(columns: ["deviceId", "_field"])
```

> **deviceId-tagged contract (CP-R5):** history series are identified by
> `deviceId + field` and rendered as separate cards per device. **Legacy-data
> limitation:** rows written WITHOUT a `deviceId` tag cannot be attributed to
> a device and are **excluded from room history** (the room query filters on
> the device ids, and any `deviceId: null` series returned is never
> displayed — the app does not guess an owner). To see legacy fields in
> per-device history, migrate the collector to add the `deviceId` tag (e.g.
> backfill or re-publish with `sensors,deviceId=sensor-01 …`).

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
