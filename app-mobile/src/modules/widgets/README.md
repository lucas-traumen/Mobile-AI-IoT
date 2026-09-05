# widgets module

Widget registry + runtime context + built-in widget components.

## Public API (`api/index.ts`)

- `createWidgetRegistry()` — widget definitions: `sensor-value`,
  `switch`; each with
  category, `defaultSize`, `supportedSizes` and `suggestForCapabilities`
  (filters by the selected device's capabilities). RETIRED types (never
  registered again; legacy persisted instances are removed on dashboard
  load): `connection` (Phase 1), `history-chart` (approved room-sensor
  rework — History is a derived tab, never a Dashboard widget) and
  `room-device-list` (device-acceptance rework — the per-room overview
  card; devices are reachable through the room selector and History).
- `validateWidgetBinding(def, binding)` — enforce one binding per widget.
- `effectiveCapabilities(def, binding)` — merged capability list.
- `resolveCapabilityAccent(field, def, tokens)` — **the** accent resolver
  (CP-R6): built-in temperature/humidity → theme tokens, custom → catalog
  color, unknown → primary. Built-in widgets never hard-code per-field
  colors.
- Widget uniqueness (approved room-sensor rework):
  `widgetUniquenessKey` / `duplicateWidgetError` / `duplicateWidgetKeys` /
  `dedupeWidgets` — the invariant constrains EXACTLY `sensor-value` +
  `switch` (room + type + exact binding); unknown custom types have NO
  uniqueness constraint and every instance survives migrations.

## Internal

- `domain/widgetTypes.ts` — `WidgetConfig`, size parsing.
- `domain/capabilityColor.ts` — the accent resolver + tests.
- `domain/widgetUniqueness.ts` — the pure uniqueness classes/check/dedupe.
- `ui/widgetContext.tsx` — `WidgetServices` seam (D8): widgets never import
  other modules directly. Reactive hooks (CP-R1):
  - `useCapabilityState(deviceId, capability, enabled)` — live value via
    `useSyncExternalStore`; per-key snapshot identity, so unrelated store
    writes notify but skip re-render.
  - `useCapabilitySeries(deviceId, capability, enabled)` — recent numeric
    points; stable empty-array reference while there is no data.
- `ui/widgets/` — the built-ins (`SensorValueWidget`, `SwitchWidget`;
  `RoomDeviceListWidget` was retired with its type).

## Notes

- Widget components must tolerate `undefined` results (no value yet, no
  history data).
- CP-R1 regression tests (`widgetContext.test.tsx`) prove subscription
  updates + snapshot identity stability on a minimal fake store.
