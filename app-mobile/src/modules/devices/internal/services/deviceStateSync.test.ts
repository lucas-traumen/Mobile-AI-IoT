/**
 * DeviceStateSync tests.
 *
 * Verifies the bridge: telemetry:received → sensor devices get every declared
 * sensor capability mapped from the payload field of the same name (built-in
 * temperature/humidity + custom capabilities); relay:feedback / relay:command
 * → switch = ON/OFF for the matching relay channel. Idempotent start/stop.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { createLogger } from '@core/logger';

import type { CapabilityDef, Device } from '../domain/devices';
import { BUILT_IN_CAPABILITIES } from '../domain/devices';
import { capabilityKey } from '../domain/devices';
import { seedDevices } from '../domain/seeds';
import { createDeviceStateStore } from '../data/deviceStateStore';
import { DeviceStateSync } from './deviceStateSync';

function makeSync() {
  const bus = new InMemoryEventBus(createLogger('test'));
  const registry = {
    getDevices: jest.fn((): readonly Device[] => seedDevices().devices),
    getCapabilities: (): readonly CapabilityDef[] => BUILT_IN_CAPABILITIES,
  };
  const store = createDeviceStateStore(() => 42);
  const sync = new DeviceStateSync({
    bus,
    registry,
    store,
    logger: createLogger('test'),
  });
  return { bus, registry, store, sync };
}

describe('DeviceStateSync', () => {
  it('maps telemetry:received to sensor temperature + humidity', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('telemetry:received', { temperature: 26.3, humidity: 58 });

    expect(
      store.getState().values[capabilityKey('sensor-01', 'temperature')],
    ).toEqual({ value: 26.3, updatedAt: 42 });
    expect(
      store.getState().values[capabilityKey('sensor-01', 'humidity')],
    ).toEqual({ value: 58, updatedAt: 42 });
  });

  it('does not set capabilities the device does not declare', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const onlyTemp: Device = {
      id: 'sensor-01',
      name: 'Cảm biến môi trường',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    };
    const sync = new DeviceStateSync({
      bus,
      registry: {
        getDevices: () => [onlyTemp],
        getCapabilities: () => BUILT_IN_CAPABILITIES,
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    bus.emit('telemetry:received', { temperature: 26.3, humidity: 58 });

    expect(
      store.getState().values[capabilityKey('sensor-01', 'temperature')],
    ).toEqual({ value: 26.3, updatedAt: 42 });
    // humidity was in the reading but the device does not declare it.
    expect(
      store.getState().values[capabilityKey('sensor-01', 'humidity')],
    ).toBeUndefined();
  });

  it('maps a custom capability from the payload field of the same name', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const pressureSensor: Device = {
      id: 'sensor-02',
      name: 'Cảm biến áp suất',
      type: 'sensor',
      capabilities: ['temperature', 'pressure'],
      binding: { kind: 'telemetry-sensor' },
    };
    const catalog: readonly CapabilityDef[] = [
      ...BUILT_IN_CAPABILITIES,
      { type: 'pressure', label: 'Áp suất', kind: 'sensor', unit: 'hPa' },
    ];
    const sync = new DeviceStateSync({
      bus,
      registry: {
        getDevices: () => [pressureSensor],
        getCapabilities: () => catalog,
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    bus.emit('telemetry:received', {
      temperature: 25.1,
      pressure: 1013,
      humidity: 58,
    });

    expect(
      store.getState().values[capabilityKey('sensor-02', 'pressure')],
    ).toEqual({ value: 1013, updatedAt: 42 });
    expect(
      store.getState().values[capabilityKey('sensor-02', 'temperature')],
    ).toEqual({ value: 25.1, updatedAt: 42 });
    // humidity is in the payload but the device does not declare it.
    expect(
      store.getState().values[capabilityKey('sensor-02', 'humidity')],
    ).toBeUndefined();
  });

  it('ignores payload fields for capabilities not in the catalog', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const sensor: Device = {
      id: 'sensor-01',
      name: 'Cảm biến',
      type: 'sensor',
      capabilities: ['temperature', 'voltage'],
      binding: { kind: 'telemetry-sensor' },
    };
    const sync = new DeviceStateSync({
      bus,
      // Catalog without `voltage` → that capability is never mapped.
      registry: {
        getDevices: () => [sensor],
        getCapabilities: () => BUILT_IN_CAPABILITIES,
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    bus.emit('telemetry:received', { temperature: 25.1, voltage: 3.3 });

    expect(
      store.getState().values[capabilityKey('sensor-01', 'temperature')],
    ).toEqual({ value: 25.1, updatedAt: 42 });
    expect(
      store.getState().values[capabilityKey('sensor-01', 'voltage')],
    ).toBeUndefined();
  });

  it('maps relay:feedback to switch=true for ON', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('relay:feedback', { index: 2, state: 'ON' });

    expect(
      store.getState().values[capabilityKey('relay-2', 'switch')].value,
    ).toBe(true);
    expect(
      store.getState().values[capabilityKey('relay-2', 'switch')].updatedAt,
    ).toBe(42);
  });

  it('maps relay:command to switch=false for OFF (optimistic)', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('relay:command', { index: 3, state: 'OFF' });

    expect(
      store.getState().values[capabilityKey('relay-3', 'switch')].value,
    ).toBe(false);
  });

  it('ignores feedback for a channel no device is bound to', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const sensorOnly: Device = {
      id: 'sensor-01',
      name: 'Cảm biến môi trường',
      type: 'sensor',
      capabilities: ['temperature', 'humidity'],
      binding: { kind: 'telemetry-sensor' },
    };
    const sync = new DeviceStateSync({
      bus,
      registry: {
        getDevices: () => [sensorOnly],
        getCapabilities: () => BUILT_IN_CAPABILITIES,
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    bus.emit('relay:command', { index: 1, state: 'ON' });

    // No relay device is registered → no switch value anywhere.
    expect(store.getState().values).toEqual({});
  });

  it('start() is idempotent: no stacked handlers', () => {
    const { bus, store, sync } = makeSync();
    sync.start();
    sync.start();
    sync.start();

    bus.emit('telemetry:received', { temperature: 20, humidity: 40 });

    // If handlers stacked, the value would be the same anyway — so assert the
    // number of subscribers did not grow by checking stop() fully clears.
    sync.stop();
    sync.stop();
    bus.emit('telemetry:received', { temperature: 99, humidity: 99 });
    expect(
      store.getState().values[capabilityKey('sensor-01', 'temperature')],
    ).toEqual({ value: 20, updatedAt: 42 });
  });
});
