# devices module

Rooms, devices and the capability model — the V2 bridge between widgets and
the MQTT wire format.

## Public API (`api/index.ts`)

- `Room`, `Device`, `DeviceBinding` (`telemetry-sensor` | `relay` with a
  room-scoped slot 1..10), `CapabilityDef`, `CapabilityType`,
  `DeviceCapabilityValue`, `SeriesPoint`.
- `DeviceRegistryService` — load/save rooms + devices + capability catalog.
- `DeviceCommandService` — `switch` capability → room-scoped relay command;
  sensor capabilities are read-only.
- `createDeviceStateStore` — zustand store: live values keyed
  `deviceId:capability` + capped numeric series (`subscribe(listener)` is the
  reactive seam for widgets).
- Sensor projection (approved room-sensor rework): `projectSensorRegistrations`,
  `countRoomSensors`, `countRoomCategory`, `sensorFieldTakenInRoom` — one
  user-facing sensor = ONE metric; identity is `{roomId, field}` (unique per
  room); a legacy multi-capability board projects as separate
  temperature/humidity registrations.
- Per-room capacity contract (service-authoritative): `MAX_SENSORS_PER_ROOM`,
  `MAX_RELAYS_PER_ROOM` (10 + 10), plus pure helpers `countRoomDevices`,
  `maxDevicesPerRoom`, `deviceCategory`, `roomCapacityWorseningError`
  (sensor quota counts PROJECTED metric registrations),
  `relaySlotTakenInRoom` — the UI mirrors them for counters/disabled states.

## Internal

- `domain/` — capability model (kind: sensor/switch; unit, icon, color,
  machine key + editable label), room migration helpers, per-room capacity
  helpers, curated capability icon groups/presets (`capabilityPresets.ts`),
  pure validation.
- `data/deviceRegistry.ts` — AsyncStorage persistence (zod-validated).
- `data/deviceStateSync.ts` — mirrors `telemetry:received` / `relay:*` bus
  events into the state store; room/field readings dispatch EXACTLY (a
  `{roomId, field, value}` message updates only the matching registrations);
  relay events match `{roomId, slot}` so equal slots in separate rooms stay
  isolated.
- `ui/DevicesScreen.tsx` — `DeviceManagementScreen` (opened from Settings →
  Quản lý) is ROOM-FIRST (approved room-sensor rework): a room list with the
  explicit `+ Thêm phòng` action opens a room's detail with ONLY
  `Cảm biến n/10` and `Điều khiển n/10` sections — no `Tất cả`, repeated
  room chooser or binding-kind chooser. The chosen room is inherited by
  every form: sensor add picks exactly ONE metric (duplicates/full rooms
  omitted, curated custom-metric creation as a secondary action with the
  immutable machine key "Mã trường dữ liệu (MQTT/InfluxDB)"); relay add asks
  only name + free room-scoped slot 1..10. Room rename/delete keep the
  migration dialog; legacy roomless records stay manageable in a dedicated
  room-list section (assign/delete — never a global filter). General
  operation feedback shows top-center (`OperationBanner`); field validation
  stays inline.

## Key rules

- **Capability label vs machine key:** the UI shows the catalog `label`
  (e.g. "Nhiệt độ"); bindings, MQTT topics and InfluxDB `_field` values carry
  the machine key (`temperature`), fixed at capability creation. NEW keys
  must satisfy the strict ASCII format (`CAPABILITY_KEY_REGEX`); legacy
  persisted keys remain loadable.
- **Per-room capacity (service-authoritative):** every concrete room accepts
  at most 10 PROJECTED sensor metrics (one visible sensor = one metric; a
  legacy multi-capability board consumes two quota units) and 10 relay
  devices — enforced on add and on move/update (excluding the edited
  device). Loaded legacy multi-capability records permit non-worsening
  edits (e.g. rename); any new multi-field write is rejected. A relay slot may be used at
  most once per room; the SAME slot in different rooms is fine. Room count
  itself is unlimited. Over-capacity legacy snapshots stay loadable, and
  mutations may not worsen the violating room (a migration `move` into a
  full room is rejected; `unassign` always remains).
- **New devices require a room:** `NewDeviceInput.roomId` is required and
  must reference an existing room; the persisted `Device.roomId` stays
  optional so roomless legacy records and the room-deletion `unassign`
  migration remain loadable and manageable.
- **Catalog membership enforcement (fix cycle 1):** `addDevice` /
  `updateDevice` reject capability types that are not in the catalog and
  kinds that do not match the binding (`sensor` ↔ telemetry-sensor,
  `switch` ↔ relay).
- **Room removal is migration-only:** there is no plain `removeRoom` on the
  service — deletion always goes through `removeRoomWithMigration`. The
  mutation is two-phase (registry commit → widget migration); when the
  widget migration fails, the registry performs a compensating rollback
  (previous snapshot restored in the repository and mirror store) and
  returns an explicit failure carrying both details — a partial mutation is
  never reported as success.
- **Removal cascade:** deleting a device publishes `devices:changed` with
  `removedDeviceIds`; the composition root removes its widgets from all
  dashboards and drops its live values/series.
- Device deletion with rooms still populated triggers the migration dialog
  (move devices to another room or unassign) — a room is never deleted with
  devices silently orphaned.
