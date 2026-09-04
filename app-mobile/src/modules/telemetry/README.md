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
- `data/telemetryStore.ts` — connection ViewModel; `payloads.ts` — numeric
  payload parsing for the wire contract (invalid topics/payloads are dropped
  with a warn log, never crash).
- Topic contract (approved room-sensor rework): one finite numeric metric per
  topic, source identity in the topic itself —
  `<prefix>/room/<roomId>/sensor/<field>`; subscription wildcard
  `<prefix>/room/+/sensor/+`. The legacy global JSON topic
  `<prefix>/tele/sensor` is RETIRED (not dual-read). Relay command/feedback
  topics remain room-scoped and owned by the relay module:
  `<prefix>/room/<roomId>/cmnd/relay/<1..10>` /
  `<prefix>/room/<roomId>/stat/relay/<1..10>` (see `modules/relay/README.md`).

## Notes

- The devices module (not this one) maps capabilities onto the wire format —
  widgets bind `deviceId + capability`, never topics.
- AppState lifecycle (background disconnect / foreground reconnect) is wired
  in the composition root.
