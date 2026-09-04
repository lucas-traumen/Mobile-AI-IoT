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
- `ui/SettingsScreen.tsx` — the summary/navigation ROOT: Giao diện (two
  explicit theme buttons, applied immediately), Quản lý (navigation rows to
  the devices manager, dashboard editor and the advanced screen), demo-
  history toggle, and a failure-only connection warning (a concise,
  actionable row shown ONLY for a confirmed failure — no permanent status
  cards, no combined check button).
- `ui/AdvancedSettingsScreen.tsx` — the dedicated MQTT/InfluxDB
  configuration + diagnostics screen: each service gets a status dot
  (green=confirmed healthy, red=confirmed failure, amber=in progress,
  gray=not configured / not checked / stale after editing) and its OWN
  action. MQTT status reuses the REAL telemetry lifecycle (no parallel
  client); the Influx status describes only the LAST explicit probe against
  the raw history adapter — never a persistent connection and never the
  demo source. Field edits invalidate the prior result (gray). General
  outcomes show in the top-center `OperationBanner`; field errors stay
  inline; failed saves keep the form open.

## Notes

- No `.env`: broker + InfluxDB credentials live on-device only.
- `settings:changed` events reconfigure telemetry / relay / history in the
  composition root (App.tsx), not here.
