# settings module

User preferences (MQTT broker, InfluxDB v2, UI theme) persisted in
AsyncStorage and validated with zod. This module owns broker/Influx/theme
persistence — even though the management screens that edit devices and
dashboards live inside the Settings tab, that data belongs to the `devices`
and `dashboard` modules, not here.

## Public API (`api/index.ts`)

- `SettingsService` — `load()`, `save(patch)`, `onChanged(cb)`; returns
  `Result` (never throws for expected failures). Declared next to its
  implementation (`internal/services/settingsService.ts`) and re-exported
  here — no barrel cycle (ISSUE-006 fixed).
- `defaultSettings()` — safe defaults for first run (theme `light`).
- Types: `AppSettings`, `SettingsSnapshot` (zod-parsed; theme is exactly
  `'light' | 'dark'`).
- `UiSettingsSchema`, `SettingsSchema`, `parseSettings` — the single
  authority on the persisted shape, including the legacy theme migration.

## Theme (explicit light | dark)

The runtime theme has exactly two explicit choices: `Sáng` (`'light'`) and
`Tối` (`'dark'`). `Hệ thống` (`'system'`) was removed
(settings-information-architecture plan): `UiSettingsSchema` accepts the
legacy persisted value and deterministically migrates it to `'light'` at
parse time, and the repository persists the normalized snapshot back
(best-effort) so valid MQTT/Influx credentials survive untouched. No runtime
path resolves or exposes `'system'`.

## Internal

- `data/settingsRepository.ts` — zod schema + AsyncStorage persistence +
  legacy-snapshot normalization write-through.
- `internal/services/settingsService.ts` — snapshot logic + change events.
- `internal/domain/mdnsDiscoveryContract.ts` — the pure mDNS contract
  half (`settings-mdns-discovery`): service-type constants
  (`_smarthome._tcp`), tolerant TXT parsing, and the
  `applyDiscoveredService(draft, service)` mapping that produces ONLY the
  non-secret fields (`mqtt.host/port/prefix`, `influx.url/org/bucket`).
- `internal/services/mdnsDiscoveryService.ts` — the ONLY place that
  touches `react-native-zeroconf` (web-safe lazy getter, typed errors,
  10 s honest-timeout scan session).
- `ui/SettingsScreen.tsx` — the summary/navigation ROOT: Giao diện (two
  explicit theme buttons, applied immediately), Quản lý (navigation rows to
  the Dashboard & Templates management entry — the Template → Room → Widget
  hierarchy hosted by the Settings tab's native stack — the devices manager
  and the advanced screen), demo-history toggle, and a failure-only
  connection warning (a concise, actionable row shown ONLY for a confirmed
  failure — no permanent status cards, no combined check button).
- `ui/AdvancedSettingsScreen.tsx` — the dedicated MQTT/InfluxDB
  configuration + diagnostics screen: each service gets a status dot
  (green=confirmed healthy, red=confirmed failure, amber=in progress,
  gray=not configured / not checked / stale after editing) and its OWN
  action. MQTT status reuses the REAL telemetry lifecycle (no parallel
  client); the Influx status describes only the LAST explicit probe against
  the raw history adapter — never a persistent connection and never the
  demo source. Field edits invalidate the prior result (gray). General
  outcomes show in the top-center `OperationBanner`; field errors stay
  inline; failed saves keep the form open. The screen also hosts the
  **Tìm máy chủ trong mạng** discovery block (native only — hidden on
  web).

## mDNS discovery contract (`_smarthome._tcp` — two-sided, app ↔ server)

First-run step 1 (`settings-mdns-discovery` plan): the user taps
**Tìm máy chủ trong mạng** on the advanced settings screen → the app
browses mDNS (`_smarthome._tcp`, domain `local.`) for 10 seconds → found
servers are listed (name + `host:port`) → tapping one autofills the
NON-secret connection fields (MQTT host/port/prefix + Influx
url/org/bucket). The user then types only the 2 secrets (MQTT password +
InfluxDB token) and presses Lưu. Nobody has to know an IP.

### Advertisement (server side)

- **Service type:** `_smarthome._tcp` (domain `local`)
- **Instance name:** free-form display name (e.g. `Smart Home Server`)
- **Port** = the **MQTT WebSocket port** (9001) — one advertisement
  carries everything; the rest lives in the TXT records.
- **TXT records (ALL optional — the app uses a default or keep-current
  when missing):**
  | TXT key | Fills | Missing / garbage → |
  | --- | --- | --- |
  | `prefix` | `mqtt.prefix` | keep the current field value |
  | `influx_port` | port of `influx.url` | default **8086** |
  | `influx_org` | `influx.org` | keep the current field value |
  | `influx_bucket` | `influx.bucket` | keep the current field value |

### Fill rule (app side)

- ONLY non-secret fields are ever written. `mqtt.username`,
  `mqtt.password` and `influx.token` are NEVER touched.
- NO auto-save: the fill goes through the form's store actions
  (`updateMqtt` / `updateInflux`); the user reviews and presses Lưu as
  usual. mDNS is unauthenticated — trust-on-first-use inside the LAN,
  user review is the last line of defense.
- The scan ends after 10 s; nothing found is an honest empty result
  (plus the same-WiFi / server-running / avahi-advertising hint), never
  an error.
- Web: the whole block is hidden (zeroconf is a native module; the lazy
  getter never constructs it on the web path).

### Server config (avahi — copy as `/etc/avahi/services/smarthome.service`)

```xml
<!-- /etc/avahi/services/smarthome.service -->
<service-group>
  <name replace-wildcards="yes">Smart Home Server</name>
  <service>
    <type>_smarthome._tcp</type>
    <port>9001</port>
    <txt-record>prefix=smarthome</txt-record>
    <txt-record>influx_port=8086</txt-record>
    <txt-record>influx_org=smarthome</txt-record>
    <txt-record>influx_bucket=smarthome</txt-record>
  </service>
</service-group>
```

Restart avahi after dropping the file (`systemctl restart avahi-daemon`).
The app-side constants live in
`internal/domain/mdnsDiscoveryContract.ts` (`MDNS_SERVICE_TYPE_FULL`,
`DEFAULT_INFLUX_PORT`).

## Notes

- No `.env`: broker + InfluxDB credentials live on-device only.
- `settings:changed` events reconfigure telemetry / relay / history in the
  composition root (App.tsx), not here.
