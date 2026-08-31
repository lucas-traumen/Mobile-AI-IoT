/**
 * Device state sync — bridges the existing module events into the device
 * state store.
 *
 * `devices` owns neither the MQTT client nor the relay module (D1): it only
 * listens on the bus and maps events to `${deviceId}:${capability}` values:
 *
 * - `telemetry:received` → every telemetry-sensor device gets each declared
 *   capability updated from the payload field with the same name
 *   (`payload[capability]`), so built-in (temperature/humidity) and custom
 *   (e.g. pressure) capabilities flow through the same generic mapping.
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
        const capabilities = this.registry.getCapabilities();
        for (const device of this.registry.getDevices()) {
          if (device.binding.kind !== 'telemetry-sensor') {
            continue;
          }
          for (const capability of device.capabilities) {
            // Generic mapping: the payload field named after the capability
            // feeds its live value (sensor-kind capabilities only).
            const def = capabilities.find(c => c.type === capability);
            if (!def || def.kind !== 'sensor') {
              continue;
            }
            const value = reading[capability];
            if (typeof value === 'number') {
              this.set(device, capability, value);
            }
          }
        }
      }),
    );

    const applyRelay = (index: number, state: 'ON' | 'OFF') => {
      for (const device of this.registry.getDevices()) {
        if (device.binding.kind !== 'relay' || device.binding.index !== index) {
          continue;
        }
        this.set(device, 'switch', state === 'ON');
      }
    };
    this.unsubscribers.push(
      this.bus.subscribe('relay:feedback', feedback =>
        applyRelay(feedback.index, feedback.state),
      ),
      this.bus.subscribe('relay:command', command =>
        applyRelay(command.index, command.state),
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
