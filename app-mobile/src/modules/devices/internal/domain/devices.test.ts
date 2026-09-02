/**
 * Devices domain tests — schemas, constraints, seeds.
 *
 * Verifies:
 * - DeviceSchema valid/invalid + binding↔capability constraint.
 * - DevicesSnapshotSchema duplicate-id detection + capability catalog.
 * - Capability catalog parse migration (old snapshot → built-ins) + round-trip.
 * - Custom capability types are accepted by DeviceSchema.
 * - Seed shape (3 rooms + one sensor per room + 3 relays in Phòng khách).
 * - parseDevicesSnapshot error shape.
 */

import type { Device } from './devices';
import {
  BUILT_IN_CAPABILITIES,
  CapabilityDefSchema,
  CapabilityMachineKeySchema,
  DeviceSchema,
  DevicesSnapshotSchema,
  capabilityTypeFromLabel,
  deviceCapabilityOptions,
  parseDevicesSnapshot,
} from './devices';
import { seedDevices } from './seeds';

function sensorDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'sensor-1',
    name: 'Cảm biến',
    type: 'sensor',
    capabilities: ['temperature', 'humidity'],
    binding: { kind: 'telemetry-sensor' },
    ...overrides,
  };
}

function relayDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'relay-1',
    name: 'Đèn',
    type: 'relay',
    capabilities: ['switch'],
    binding: { kind: 'relay', index: 1 },
    ...overrides,
  };
}

describe('DeviceSchema', () => {
  it('accepts a valid telemetry-sensor device', () => {
    const result = DeviceSchema.safeParse(sensorDevice());
    expect(result.success).toBe(true);
  });

  it('accepts a valid relay device', () => {
    const result = DeviceSchema.safeParse(relayDevice());
    expect(result.success).toBe(true);
  });

  it('rejects a relay device without exactly the switch capability', () => {
    const withTemp = relayDevice({ capabilities: ['switch', 'temperature'] });
    expect(DeviceSchema.safeParse(withTemp).success).toBe(false);

    const empty = relayDevice({ capabilities: [] });
    expect(DeviceSchema.safeParse(empty).success).toBe(false);
  });

  it('rejects a telemetry-sensor exposing switch', () => {
    const withSwitch = sensorDevice({ capabilities: ['switch'] });
    expect(DeviceSchema.safeParse(withSwitch).success).toBe(false);
  });

  it('rejects a relay binding with index outside 1..3', () => {
    const bad = relayDevice({
      binding: { kind: 'relay', index: 4 as 1 | 2 | 3 },
    });
    expect(DeviceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing/empty name and id', () => {
    expect(DeviceSchema.safeParse(sensorDevice({ name: '' })).success).toBe(
      false,
    );
    expect(DeviceSchema.safeParse(sensorDevice({ id: '' })).success).toBe(
      false,
    );
  });

  it('accepts a custom (catalog) capability string on a sensor', () => {
    const withPressure = sensorDevice({
      capabilities: ['temperature', 'pressure'],
    });
    expect(DeviceSchema.safeParse(withPressure).success).toBe(true);
  });

  it('rejects empty capability strings', () => {
    const withEmpty = sensorDevice({ capabilities: [''] });
    expect(DeviceSchema.safeParse(withEmpty).success).toBe(false);
  });
});

describe('DevicesSnapshotSchema', () => {
  it('accepts a snapshot with unique ids', () => {
    const snapshot = {
      rooms: [{ id: 'room-1', name: 'Phòng khách', order: 0 }],
      devices: [sensorDevice(), relayDevice()],
    };
    expect(DevicesSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('rejects duplicate device ids', () => {
    const snapshot = {
      rooms: [],
      devices: [sensorDevice({ id: 'x' }), relayDevice({ id: 'x' })],
    };
    expect(DevicesSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('rejects duplicate room ids', () => {
    const snapshot = {
      rooms: [
        { id: 'r', name: 'A', order: 0 },
        { id: 'r', name: 'B', order: 1 },
      ],
      devices: [],
    };
    expect(DevicesSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('migrates a snapshot without capabilities to the built-in catalog', () => {
    // Old persisted file: no `capabilities` field at all.
    const result = DevicesSnapshotSchema.safeParse({
      rooms: [],
      devices: [sensorDevice()],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capabilities).toEqual(BUILT_IN_CAPABILITIES);
    }
  });

  it('round-trips a snapshot with an explicit catalog', () => {
    const catalog = [
      ...BUILT_IN_CAPABILITIES,
      { type: 'pressure', label: 'Áp suất', kind: 'sensor', unit: 'hPa' },
    ];
    const result = DevicesSnapshotSchema.safeParse({
      rooms: [],
      devices: [sensorDevice({ capabilities: ['pressure'] })],
      capabilities: catalog,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capabilities).toEqual(catalog);
    }
  });

  it('rejects duplicate capability types in the catalog', () => {
    const result = DevicesSnapshotSchema.safeParse({
      rooms: [],
      devices: [],
      capabilities: [
        { type: 'pressure', label: 'Áp suất', kind: 'sensor' },
        { type: 'pressure', label: 'Áp suất 2', kind: 'sensor' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a capability definition with an invalid kind', () => {
    const result = DevicesSnapshotSchema.safeParse({
      rooms: [],
      devices: [],
      capabilities: [{ type: 'pressure', label: 'Áp suất', kind: 'valve' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('deviceCapabilityOptions', () => {
  it('offers only switch for relay bindings', () => {
    expect(deviceCapabilityOptions({ kind: 'relay', index: 2 })).toEqual([
      'switch',
    ]);
  });

  it('offers temperature + humidity for sensors', () => {
    expect(deviceCapabilityOptions({ kind: 'telemetry-sensor' })).toEqual([
      'temperature',
      'humidity',
    ]);
  });
});

describe('seedDevices', () => {
  it('seeds 3 rooms + one sensor per room + three relays in Phòng khách', () => {
    const seed = seedDevices();
    expect(seed.rooms.map(room => room.name)).toEqual([
      'Phòng khách',
      'Phòng ngủ',
      'Bếp',
    ]);
    expect(seed.rooms[0]).toEqual({
      id: 'room-living',
      name: 'Phòng khách',
      order: 0,
      icon: 'home-outline',
    });
    expect(seed.rooms[1].icon).toBe('bed-outline');
    expect(seed.rooms[2].icon).toBe('restaurant-outline');
    // Look devices up by stable seed id: array order is an implementation
    // detail, so future seed insertions must not require re-indexing here.
    const byId = new Map(seed.devices.map(device => [device.id, device]));
    expect(seed.devices).toHaveLength(6);
    expect(byId.get('sensor-01')).toEqual({
      id: 'sensor-01',
      name: 'Cảm biến môi trường',
      roomId: 'room-living',
      type: 'sensor',
      capabilities: ['temperature', 'humidity'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(byId.get('sensor-02')).toEqual({
      id: 'sensor-02',
      name: 'Cảm biến môi trường',
      roomId: 'room-bedroom',
      type: 'sensor',
      capabilities: ['temperature', 'humidity'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(byId.get('sensor-03')).toEqual({
      id: 'sensor-03',
      name: 'Cảm biến môi trường',
      roomId: 'room-kitchen',
      type: 'sensor',
      capabilities: ['temperature', 'humidity'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(byId.get('relay-1')).toEqual({
      id: 'relay-1',
      name: 'Đèn',
      roomId: 'room-living',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 1 },
    });
    expect(byId.get('relay-2')?.name).toBe('Quạt');
    expect(byId.get('relay-2')?.binding).toEqual({ kind: 'relay', index: 2 });
    expect(byId.get('relay-3')?.name).toBe('Bơm');
    expect(byId.get('relay-3')?.binding).toEqual({ kind: 'relay', index: 3 });
    // Sensors span the three rooms; relays stay in Phòng khách.
    expect(byId.get('sensor-01')?.roomId).toBe('room-living');
    expect(byId.get('sensor-02')?.roomId).toBe('room-bedroom');
    expect(byId.get('sensor-03')?.roomId).toBe('room-kitchen');
    for (const id of ['relay-1', 'relay-2', 'relay-3']) {
      expect(byId.get(id)?.roomId).toBe('room-living');
    }
  });

  it('the seed validates against the snapshot schema', () => {
    expect(DevicesSnapshotSchema.safeParse(seedDevices()).success).toBe(true);
  });

  it('the seed catalog is the built-in catalog', () => {
    expect(seedDevices().capabilities).toEqual(BUILT_IN_CAPABILITIES);
  });
});

describe('parseDevicesSnapshot', () => {
  it('returns errors with dotted paths for invalid input', () => {
    const result = parseDevicesSnapshot({ rooms: [{ id: '' }], devices: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns the parsed value for valid input', () => {
    const result = parseDevicesSnapshot(seedDevices());
    expect(result.ok).toBe(true);
  });
});

describe('capabilityTypeFromLabel (CP5)', () => {
  it('slugs a Vietnamese label into a stable type key', () => {
    expect(capabilityTypeFromLabel('Áp suất', [])).toBe('áp-suất');
    expect(capabilityTypeFromLabel('CO2 trong nhà', [])).toBe('co2-trong-nhà');
  });

  it('keeps the label case-insensitive', () => {
    expect(capabilityTypeFromLabel('ÁP SUẤT', [])).toBe('áp-suất');
  });

  it('deduplicates against existing types with a numeric suffix', () => {
    expect(capabilityTypeFromLabel('Áp suất', ['áp-suất'])).toBe('áp-suất-2');
    expect(capabilityTypeFromLabel('Áp suất', ['áp-suất', 'áp-suất-2'])).toBe(
      'áp-suất-3',
    );
  });

  it('falls back to a generic key for punctuation-only labels', () => {
    expect(capabilityTypeFromLabel('---', [])).toBe('cap');
    expect(capabilityTypeFromLabel('---', ['cap'])).toBe('cap-2');
  });
});

describe('CapabilityMachineKeySchema (CP-R4)', () => {
  it('accepts valid ASCII machine keys', () => {
    expect(CapabilityMachineKeySchema.safeParse('pressure').success).toBe(true);
    expect(CapabilityMachineKeySchema.safeParse('temperature').success).toBe(
      true,
    );
    expect(CapabilityMachineKeySchema.safeParse('co2_level').success).toBe(
      true,
    );
    expect(CapabilityMachineKeySchema.safeParse('a').success).toBe(true);
    expect(CapabilityMachineKeySchema.safeParse('abc123').success).toBe(true);
  });

  it('rejects Vietnamese/non-ASCII keys', () => {
    expect(CapabilityMachineKeySchema.safeParse('áp-suất').success).toBe(false);
    expect(CapabilityMachineKeySchema.safeParse('nhiệt-độ').success).toBe(
      false,
    );
  });

  it('rejects keys with hyphens or spaces', () => {
    expect(CapabilityMachineKeySchema.safeParse('pressure-value').success).toBe(
      false,
    );
    expect(CapabilityMachineKeySchema.safeParse('my key').success).toBe(false);
  });

  it('rejects uppercase or digit-starting keys', () => {
    expect(CapabilityMachineKeySchema.safeParse('Pressure').success).toBe(
      false,
    );
    expect(CapabilityMachineKeySchema.safeParse('1pressure').success).toBe(
      false,
    );
    expect(CapabilityMachineKeySchema.safeParse('_pressure').success).toBe(
      false,
    );
  });

  it('rejects empty strings', () => {
    expect(CapabilityMachineKeySchema.safeParse('').success).toBe(false);
  });
});

describe('CapabilityDefSchema legacy compatibility (CP-R4)', () => {
  it('still accepts legacy non-ASCII keys for snapshot parsing', () => {
    const result = CapabilityDefSchema.safeParse({
      type: 'áp-suất',
      label: 'Áp suất',
      kind: 'sensor',
    });
    // Lenient schema accepts legacy keys for read compatibility
    expect(result.success).toBe(true);
  });

  it('accepts valid ASCII keys through the lenient schema too', () => {
    const result = CapabilityDefSchema.safeParse({
      type: 'pressure',
      label: 'Pressure',
      kind: 'sensor',
    });
    expect(result.success).toBe(true);
  });
});
