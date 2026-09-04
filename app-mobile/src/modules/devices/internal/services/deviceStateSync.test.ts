/**
 * DeviceStateSync tests (approved room/field telemetry contract).
 *
 * Verifies the bridge: `telemetry:received` (`{roomId, field, value}`) →
 * ONLY the registrations matching BOTH the room and the field update
 * (no cross-room fan-out); relay:feedback / relay:command → switch =
 * ON/OFF for the matching room-scoped slot. Idempotent start/stop.
 */

import type { SensorTelemetry } from '@modules/telemetry/api';
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

function reading(overrides: Partial<SensorTelemetry> = {}): SensorTelemetry {
  return {
    roomId: 'room-living',
    field: 'temperature',
    value: 26.3,
    ...overrides,
  };
}

describe('DeviceStateSync — room/field telemetry dispatch', () => {
  it('updates only the registration matching the exact room and field', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('telemetry:received', reading());

    expect(
      store.getState().values[capabilityKey('sensor-temp-01', 'temperature')],
    ).toEqual({ value: 26.3, updatedAt: 42 });
    // The humidity registration of the same room is untouched.
    expect(
      store.getState().values[capabilityKey('sensor-hum-01', 'humidity')],
    ).toBeUndefined();
  });

  it('never fans a message into another room (multi-room isolation)', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('telemetry:received', reading({ roomId: 'room-bedroom' }));

    // Only the bedroom registration moves; living stays empty.
    expect(
      store.getState().values[capabilityKey('sensor-temp-02', 'temperature')],
    ).toEqual({ value: 26.3, updatedAt: 42 });
    expect(
      store.getState().values[capabilityKey('sensor-temp-01', 'temperature')],
    ).toBeUndefined();
  });

  it('ignores fields no device in the room registers', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('telemetry:received', reading({ field: 'pressure', value: 1013 }));

    expect(store.getState().values).toEqual({});
  });

  it('ignores fields that are not sensor-kind catalog capabilities', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const sensor: Device = {
      id: 's1',
      name: 'Nhiệt độ',
      roomId: 'r1',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    };
    const sync = new DeviceStateSync({
      bus,
      registry: {
        getDevices: () => [sensor],
        getCapabilities: () => BUILT_IN_CAPABILITIES, // no `voltage`
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    bus.emit('telemetry:received', reading({ roomId: 'r1', field: 'voltage' }));

    expect(store.getState().values).toEqual({});
  });

  it('maps a custom catalog sensor field to the matching registration', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const pressureSensor: Device = {
      id: 'sensor-pressure-01',
      name: 'Áp suất',
      roomId: 'r1',
      type: 'sensor',
      capabilities: ['pressure'],
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

    bus.emit(
      'telemetry:received',
      reading({ roomId: 'r1', field: 'pressure', value: 1013 }),
    );

    expect(
      store.getState().values[capabilityKey('sensor-pressure-01', 'pressure')],
    ).toEqual({ value: 1013, updatedAt: 42 });
  });
});

describe('DeviceStateSync — room-scoped relay dispatch (unchanged contract)', () => {
  it('maps relay:feedback to switch=true for the addressed room+slot only', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('relay:feedback', {
      roomId: 'room-living',
      index: 2,
      state: 'ON',
    });

    expect(
      store.getState().values[capabilityKey('relay-2', 'switch')].value,
    ).toBe(true);
    expect(
      store.getState().values[capabilityKey('relay-2', 'switch')].updatedAt,
    ).toBe(42);
    // The seed relays live in room-living; another room with the same slot
    // does not exist in the seed, so nothing else was touched.
    expect(
      store.getState().values[capabilityKey('relay-1', 'switch')],
    ).toBeUndefined();
  });

  it('maps relay:command to switch=false for OFF (optimistic)', () => {
    const { bus, store, sync } = makeSync();
    sync.start();

    bus.emit('relay:command', {
      roomId: 'room-living',
      index: 3,
      state: 'OFF',
    });

    expect(
      store.getState().values[capabilityKey('relay-3', 'switch')].value,
    ).toBe(false);
  });

  it('ignores relay events for another room even with the same slot', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const livingRelay: Device = {
      id: 'relay-living-2',
      name: 'Quạt khách',
      roomId: 'room-living',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 2 },
    };
    const sync = new DeviceStateSync({
      bus,
      registry: {
        getDevices: () => [livingRelay],
        getCapabilities: () => BUILT_IN_CAPABILITIES,
      },
      store,
      logger: createLogger('test'),
    });
    sync.start();

    // Same slot (2) but a different room: the living-room device must not move.
    bus.emit('relay:command', {
      roomId: 'room-bedroom',
      index: 2,
      state: 'ON',
    });
    expect(store.getState().values).toEqual({});

    bus.emit('relay:feedback', {
      roomId: 'room-living',
      index: 2,
      state: 'ON',
    });
    expect(
      store.getState().values[capabilityKey('relay-living-2', 'switch')].value,
    ).toBe(true);
  });

  it('ignores feedback for a channel no device is bound to', () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const store = createDeviceStateStore(() => 42);
    const sensorOnly: Device = {
      id: 'sensor-temp-01',
      name: 'Nhiệt độ',
      roomId: 'room-living',
      type: 'sensor',
      capabilities: ['temperature'],
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

    bus.emit('relay:command', { roomId: 'room-living', index: 1, state: 'ON' });

    // No relay device is registered → no switch value anywhere.
    expect(store.getState().values).toEqual({});
  });

  it('start() is idempotent: no stacked handlers', () => {
    const { bus, store, sync } = makeSync();
    sync.start();
    sync.start();
    sync.start();

    bus.emit('telemetry:received', reading({ value: 20 }));

    // If handlers stacked, the value would be the same anyway — so assert the
    // number of subscribers did not grow by checking stop() fully clears.
    sync.stop();
    sync.stop();
    bus.emit('telemetry:received', reading({ value: 99 }));
    expect(
      store.getState().values[capabilityKey('sensor-temp-01', 'temperature')],
    ).toEqual({ value: 20, updatedAt: 42 });
  });
});
