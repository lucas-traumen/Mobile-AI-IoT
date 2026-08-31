# telemetry module

MQTT transport: connect over WebSocket, validate inbound payloads with zod,
expose connection state.

## Public API (`api/index.ts`)

- `TelemetryService` — `start()`, `stop()`, `applyConfig(cfg)`.
- `MqttConnectionConfig` — host/port/username/password/prefix.
- `telemetryStore` — zustand store with `connection` state + `lastErrorCode`.

## Internal

- `data/mqttJsClient.ts` — `mqtt` v5 adapter (pure JS, WebSocket, no native
  module — works in Expo Go).
- `data/telemetryStore.ts` — connection ViewModel; `payloads.ts` — zod
  schemas for the wire contract (invalid payloads are dropped with a warn
  log, never crash).
- Topic contract: `<prefix>/tele/sensor` (JSON telemetry in),
  `<prefix>/cmnd/relay/<1|2|3>` / `<prefix>/stat/relay/<n>` (relay out/feedback).

## Notes

- The devices module (not this one) maps capabilities onto the wire format —
  widgets bind `deviceId + capability`, never topics.
- AppState lifecycle (background disconnect / foreground reconnect) is wired
  in the composition root.
