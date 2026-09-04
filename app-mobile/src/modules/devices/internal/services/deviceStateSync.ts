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
 * Start/stop are idempotent: repeated `start()` calls never stack handlers.
 */

import type { EventBus } from '@core/eventbus';
import type { Unsubscribe } from '@core/eventbus';
import type { Logger } from '@core/logger';

import type { CapabilityDef, Device } from '../domain/devices';
import { capabilityKey } from '../domain/devices';
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
  private unsubscribers: Unsubscribe[] = [];
  private started = false;

  constructor(options: {
    bus: EventBus;
    registry: DeviceSyncRegistry;
    store: DeviceStateStore;
    logger: Logger;
  }) {
    this.bus = options.bus;
    this.registry = options.registry;
    this.store = options.store;
    this.logger = options.logger;
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
        for (const device of this.registry.getDevices()) {
          if (device.binding.kind !== 'telemetry-sensor') {
            continue;
          }
          if (device.roomId !== reading.roomId) {
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
    // room updates (equal slots in separate rooms stay isolated).
    const applyRelay = (roomId: string, index: number, state: 'ON' | 'OFF') => {
      for (const device of this.registry.getDevices()) {
        if (
          device.binding.kind !== 'relay' ||
          device.roomId !== roomId ||
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
