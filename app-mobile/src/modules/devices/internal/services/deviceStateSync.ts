/**
 * Device state sync — bridges the existing module events into the device
 * state store.
 *
 * `devices` owns neither the MQTT client nor the relay module (D1): it only
 * listens on the bus and maps events to `${deviceId}:${capability}` values:
 *
 * - `telemetry:received` (approved room/field contract: `{roomId, field,
 *   value}`) → ONLY the telemetry-sensor devices in that exact room that
 *   register that exact field get the value.
 * - `relay:feedback` (and `relay:command` for optimistic state) → the relay
 *   device bound to that channel gets `switch` = `TRUE/FALSE`.
 *
 * Identity entrance (board-discovery-binding plan): the wire `roomId` on
 * both event shapes is the MQTT topic segment — a bound room publishes
 * under its board `code`, a code-less (seed demo) room under its internal
 * `id`. Incoming identities resolve through `resolveRoomByMqttId` (code
 * FIRST, then id) and match registrations by the INTERNAL room id — the
 * registrations themselves never change. Without an injected rooms getter
 * the resolution degenerates to the exact historical behavior (identity
 * match by id).
 *
 * Start/stop are idempotent: repeated `start()` calls never stack handlers.
 */

import type { EventBus } from '@core/eventbus';
import type { Unsubscribe } from '@core/eventbus';
import type { Logger } from '@core/logger';

import type { CapabilityDef, Device, Room } from '../domain/devices';
import { capabilityKey, resolveRoomByMqttId } from '../domain/devices';
import type { DeviceStateStore } from '../data/deviceStateStore';

/** Registry access needed by the sync bridge (narrow dependency). */
export interface DeviceSyncRegistry {
  getDevices(): readonly Device[];
  /** Capability catalog (maps capability type → sensor/switch kind). */
  getCapabilities(): readonly CapabilityDef[];
}

/** Bridge bus events → capability values in the state store. */
export class DeviceStateSync {
  private readonly bus: EventBus;
  private readonly registry: DeviceSyncRegistry;
  private readonly store: DeviceStateStore;
  private readonly logger: Logger;
  /**
   * Rooms snapshot getter (board-discovery-binding plan). The composition
   * root wires it to the registry, whose snapshot is refreshed
   * synchronously on every mutation (before `devices:changed` broadcasts) —
   * so every event resolves against the CURRENT rooms without a local cache
   * to invalidate. Optional: absent = identity resolution by internal id
   * (the pre-binding behavior, kept for narrow-construction tests).
   */
  private readonly getRooms?: () => readonly Room[];
  private unsubscribers: Unsubscribe[] = [];
  private started = false;

  constructor(options: {
    bus: EventBus;
    registry: DeviceSyncRegistry;
    store: DeviceStateStore;
    logger: Logger;
    /** Rooms snapshot getter (see field doc). Wired at the composition root. */
    getRooms?: () => readonly Room[];
  }) {
    this.bus = options.bus;
    this.registry = options.registry;
    this.store = options.store;
    this.logger = options.logger;
    this.getRooms = options.getRooms;
  }

  /** Subscribe to the relevant bus events (idempotent). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.unsubscribers.push(
      this.bus.subscribe('telemetry:received', reading => {
        // Approved room-sensor contract: EXACT room + field dispatch. A
        // message on `<prefix>/room/<roomId>/sensor/<field>` updates ONLY
        // the registrations matching BOTH the room and the field — there
        // is no cross-room fan-out and no global JSON payload.
        const def = this.registry
          .getCapabilities()
          .find(candidate => candidate.type === reading.field);
        if (!def || def.kind !== 'sensor') {
          return;
        }
        // Identity entrance: the wire roomId may be a board code (bound
        // room) or the internal id (code-less room) — resolve ONCE, then
        // match registrations by the internal room id.
        const room = this.resolveRoom(reading.roomId);
        for (const device of this.registry.getDevices()) {
          if (device.binding.kind !== 'telemetry-sensor') {
            continue;
          }
          if (device.roomId !== room.id) {
            continue;
          }
          if (!device.capabilities.includes(reading.field)) {
            continue;
          }
          this.set(device, reading.field, reading.value);
        }
      }),
    );

    // Room-scoped relay mapping: a `relay:command`/`relay:feedback` event
    // carries `{roomId, index}`; only the device bound to that slot IN that
    // room updates (equal slots in separate rooms stay isolated). The
    // entrance roomId goes through the same board-code resolution.
    const applyRelay = (roomId: string, index: number, state: 'ON' | 'OFF') => {
      const room = this.resolveRoom(roomId);
      for (const device of this.registry.getDevices()) {
        if (
          device.binding.kind !== 'relay' ||
          device.roomId !== room.id ||
          device.binding.index !== index
        ) {
          continue;
        }
        this.set(device, 'switch', state === 'ON');
      }
    };
    this.unsubscribers.push(
      this.bus.subscribe('relay:feedback', feedback =>
        applyRelay(feedback.roomId, feedback.index, feedback.state),
      ),
      this.bus.subscribe('relay:command', command =>
        applyRelay(command.roomId, command.index, command.state),
      ),
    );
  }

  /** Remove all subscriptions (idempotent). */
  stop(): void {
    if (!this.started) {
      return;
    }
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.started = false;
  }

  /**
   * Resolve the wire room identity to the app's internal room: board code
   * first (bound room), internal id fallback (code-less room). When no
   * rooms getter is injected, the identity IS the internal room id (the
   * exact historical behavior).
   */
  private resolveRoom(mqttRoomId: string): Pick<Room, 'id'> {
    if (!this.getRooms) {
      return { id: mqttRoomId };
    }
    return resolveRoomByMqttId(this.getRooms(), mqttRoomId) ?? { id: '' };
  }

  private set(
    device: Device,
    capability: string,
    value: number | boolean,
  ): void {
    this.store.getState().setCapabilityValue(device.id, capability, value);
    this.logger.debug(
      `Devices: ${capabilityKey(device.id, capability)} = ${String(value)}`,
    );
  }
}
