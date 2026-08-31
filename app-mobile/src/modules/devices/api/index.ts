/**
 * Devices module — public facade.
 *
 * The only entry point other modules may use. Everything else lives in
 * `internal/` and must not be imported across modules (enforced by
 * `eslint-plugin-boundaries`).
 *
 * V2 abstraction: widgets bind to `deviceId + capability`, never to MQTT
 * topics. This facade exposes the devices registry (CRUD rooms/devices), the
 * live capability state store, and the command router.
 */

import type { AppError, Result } from '@core/errors';

import type {
  CapabilityDef,
  CapabilityType,
  Device,
  Room,
} from '../internal/domain/devices';
import type {
  CapabilityPatch,
  DevicePatch,
  NewCapabilityInput,
  NewDeviceInput,
  RoomMigrationTarget,
  RoomPatch,
} from '../internal/services/deviceRegistryService';
import type { DevicesStore } from '../internal/ui/devicesStore';

/** Devices domain types: capability, device, binding, snapshot, room, relay channel. */
export type {
  CapabilityDef,
  CapabilityKind,
  CapabilityType,
  Device,
  DeviceBinding,
  DevicesSnapshot,
  KnownCapability,
  RelayChannel,
  Room,
} from '../internal/domain/devices';
/** Devices domain: zod schemas + pure helpers (binding↔capability constraint). */
export {
  BUILT_IN_CAPABILITIES,
  CAPABILITY_TYPES,
  CapabilityDefSchema,
  CapabilityKindSchema,
  CapabilitySchema,
  DeviceBindingSchema,
  DeviceSchema,
  DevicesSnapshotSchema,
  RELAY_CHANNELS,
  RoomSchema,
  capabilityKey,
  capabilityTypeFromLabel,
  CAPABILITY_KEY_REGEX,
  CapabilityMachineKeySchema,
  deviceCapabilityOptions,
  parseDevicesSnapshot,
} from '../internal/domain/devices';

/** First-run seed snapshot (3 rooms + sensor-01 + relays 1..3, all in Phòng khách). */
export { seedDevices, SEED_ROOM_LIVING_ID } from '../internal/domain/seeds';
/** Persistence port (implemented by {@link AsyncStorageDevicesRepository}). */
export type { DevicesRepository } from '../internal/data/devicesRepository';
/** AsyncStorage adapter: load → seed, zod-validated round-trip. */
export { AsyncStorageDevicesRepository } from '../internal/data/devicesRepository';
/** zustand store factory: live capability values keyed `${deviceId}:${capability}`. */
export {
  createDeviceStateStore,
  deltaOverHorizon,
} from '../internal/data/deviceStateStore';
/** Live-value shape + store type. */
export type {
  DeviceCapabilityValue,
  DeviceStateStore,
  SeriesPoint,
} from '../internal/data/deviceStateStore';
/** Default {@link DeviceRegistryService} implementation (repository + bus + zod). */
export { DeviceRegistryServiceImpl } from '../internal/services/deviceRegistryService';
/** Service input/patch types (CRUD rooms/devices + capability catalog). */
export type {
  CapabilityPatch,
  DevicePatch,
  NewCapabilityInput,
  NewDeviceInput,
  RoomMigrationTarget,
  RoomPatch,
} from '../internal/services/deviceRegistryService';
/** Bridge `telemetry:received` / `relay:*` bus events → live capability values. */
export { DeviceStateSync } from '../internal/services/deviceStateSync';
/** Default {@link DeviceCommandService} implementation (switch → relay module). */
export { DeviceCommandServiceImpl } from '../internal/services/deviceCommandService';
/** zustand store factory mirroring the registry snapshot for the UI. */
export { createDevicesStore } from '../internal/ui/devicesStore';
/** Mirror store type (rooms + devices snapshot). */
export type { DevicesStore } from '../internal/ui/devicesStore';

/**
 * Devices registry service — CRUD for rooms + devices.
 *
 * The service owns the persisted snapshot; every mutation validates, persists
 * and broadcasts `devices:changed` (payload `{ removedDeviceIds }`).
 */
export interface DeviceRegistryService {
  /** The zustand store mirrored to the UI (subscribe for re-renders). */
  getStore(): DevicesStore;
  /** Load the persisted snapshot (seeds defaults on first run). */
  load(): Promise<Result<void>>;
  /** All registered devices. */
  getDevices(): readonly Device[];
  /** All rooms. */
  getRooms(): readonly Room[];
  /** The capability catalog (built-ins + user-defined). */
  getCapabilities(): readonly CapabilityDef[];
  /** Find a device by id (undefined when unknown). */
  findDevice(id: string): Device | undefined;
  /** Add a room. */
  addRoom(name: string): Promise<Result<void>>;
  /** Update a room (partial patch; id must exist). */
  updateRoom(id: string, patch: RoomPatch): Promise<Result<void>>;
  /**
   * Remove a room with an explicit device/widget migration (CP5): `move`
   * retargets devices + widgets to another room; `unassign` makes devices
   * roomless and widgets global. Room deletion is ONLY possible through
   * this explicit migration — there is no un-migrated removal path (fix
   * cycle 1: the plain `removeRoom` bypass was removed).
   */
  removeRoomWithMigration(
    id: string,
    target: RoomMigrationTarget,
  ): Promise<Result<void>>;
  /** Add a device (id generated; validated against the binding constraint). */
  addDevice(input: NewDeviceInput): Promise<Result<void>>;
  /** Update a device (partial patch; id must exist). */
  updateDevice(id: string, patch: DevicePatch): Promise<Result<void>>;
  /**
   * Remove a device; broadcasts `devices:changed` with its id in
   * `removedDeviceIds` so bindings (widgets) can be cascaded away.
   */
  removeDevice(id: string): Promise<Result<void>>;
  /** Add a capability definition to the catalog (`type` must be unique). */
  addCapability(input: NewCapabilityInput): Promise<Result<void>>;
  /** Update a capability definition (patch; the type key is immutable). */
  updateCapability(type: string, patch: CapabilityPatch): Promise<Result<void>>;
  /**
   * Remove a capability definition; rejected (validation error) when any
   * device still declares it or any widget still binds it (injected check).
   */
  removeCapability(type: string): Promise<Result<void>>;
}

/**
 * Device command service — capability-level command entry point for widgets.
 *
 * Routes `switch` commands to the relay module through the device binding;
 * unsupported device/capability combinations return a validation error so the
 * UI can surface the failure (closes KNOWN ISSUE-001 UX gap).
 */
export interface DeviceCommandService {
  /**
   * Send a command to a device capability (`switch` → relay module).
   *
   * @returns `ok` when routed; `err` with code `not-found` for unknown
   *   devices, or `validation` for unsupported capability / binding.
   */
  sendCommand(
    deviceId: string,
    capability: CapabilityType,
    value: boolean,
  ): Result<void, AppError>;
}
