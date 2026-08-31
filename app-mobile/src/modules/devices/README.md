# devices module

Rooms, devices and the capability model — the V2 bridge between widgets and
the MQTT wire format.

## Public API (`api/index.ts`)

- `Room`, `Device`, `DeviceBinding` (`telemetry-sensor` | `relay`),
  `CapabilityDef`, `CapabilityType`, `DeviceCapabilityValue`, `SeriesPoint`.
- `DeviceRegistryService` — load/save rooms + devices + capability catalog.
- `DeviceCommandService` — `switch` capability → relay command; sensor
  capabilities are read-only.
- `createDeviceStateStore` — zustand store: live values keyed
  `deviceId:capability` + capped numeric series (`subscribe(listener)` is the
  reactive seam for widgets).

## Internal

- `domain/` — capability model (kind: sensor/switch; unit, icon, color,
  machine key + editable label), room migration helpers, pure validation.
- `data/deviceRegistry.ts` — AsyncStorage persistence (zod-validated).
- `data/deviceStateSync.ts` — mirrors `telemetry:received` / `relay:*` bus
  events into the state store; sensor payloads fan out to bound devices.
- `ui/DevicesScreen.tsx` — `DeviceManagementScreen` (opened from Settings →
  Quản lý): room CRUD, device CRUD, capability assignment from the catalog
  (binding kind: telemetry sensor vs relay), device removal cascades.

## Key rules

- **Capability label vs machine key:** the UI shows the catalog `label`
  (e.g. "Nhiệt độ"); bindings, MQTT topics and InfluxDB fields carry the
  machine key (`temperature`), fixed at capability creation.
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
