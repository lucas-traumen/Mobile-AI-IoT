# widgets module

Widget registry + runtime context + built-in widget components.

## Public API (`api/index.ts`)

- `createWidgetRegistry()` — widget definitions: `sensor-value`,
  `switch`, `history-chart`, `connection`, `room-device-list`; each with
  category, `defaultSize`, `supportedSizes` and `suggestForCapabilities`
  (filters by the selected device's capabilities).
- `validateWidgetBinding(def, binding)` — enforce one binding per widget.
- `effectiveCapabilities(def, binding)` — merged capability list.
- `resolveCapabilityAccent(field, def, tokens)` — **the** accent resolver
  (CP-R6): built-in temperature/humidity → theme tokens, custom → catalog
  color, unknown → primary. Built-in widgets never hard-code per-field
  colors.

## Internal

- `domain/widgetTypes.ts` — `WidgetConfig`, size parsing.
- `domain/capabilityColor.ts` — the accent resolver + tests.
- `ui/widgetContext.tsx` — `WidgetServices` seam (D8): widgets never import
  other modules directly. Reactive hooks (CP-R1):
  - `useCapabilityState(deviceId, capability, enabled)` — live value via
    `useSyncExternalStore`; per-key snapshot identity, so unrelated store
    writes notify but skip re-render.
  - `useCapabilitySeries(deviceId, capability, enabled)` — recent numeric
    points; stable empty-array reference while there is no data.
- `ui/widgets/` — the five built-ins. `HistoryChartWidget` queries **its own
  exact series** (`{measurement, range, fields: [capability],
deviceIds: [deviceId]}`, CP-R5) and sizes its chart from the available
  width (`useWindowDimensions`, no fixed 340px).

## Notes

- Widget components must tolerate `undefined` results (no value yet, no
  history data, no connection).
- CP-R1 regression tests (`widgetContext.test.tsx`) prove subscription
  updates + snapshot identity stability on a minimal fake store.
