# settings module

User preferences (MQTT broker, InfluxDB v2, UI theme) persisted in
AsyncStorage and validated with zod. This module owns broker/Influx/theme
persistence — even though the management screens that edit devices and
dashboards live inside the Settings tab, that data belongs to the `devices`
and `dashboard` modules, not here.

## Public API (`api/index.ts`)

- `SettingsService` — `load()`, `save(patch)`, `onChanged(cb)`; returns
  `Result` (never throws for expected failures).
- `defaultSettings()` — safe defaults for first run.
- Types: `AppSettings`, `SettingsSnapshot` (zod-parsed).

## Internal

- `data/settingsRepository.ts` — zod schema + AsyncStorage persistence.
- `internal/services/settingsService.ts` — snapshot logic + change events.
- `ui/SettingsScreen.tsx` — the reduced root Settings screen: Giao diện
  (theme), Quản lý (navigation rows to the devices/dashboard managers),
  Kết nối (MQTT + InfluxDB credentials, `checkConnection` probe), Nâng cao.
  Saving never closes the form on failure — the `Result` error is surfaced.

## Notes

- No `.env`: broker + InfluxDB credentials live on-device only.
- `settings:changed` events reconfigure telemetry / relay / history in the
  composition root (App.tsx), not here.
