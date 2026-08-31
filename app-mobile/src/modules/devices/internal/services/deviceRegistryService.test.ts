/**
 * DeviceRegistryServiceImpl tests.
 *
 * Verifies: addRoom/updateRoom/removeRoom; addDevice/updateDevice (validation
 * + binding constraint); removeDevice emits `devices:changed
 * { removedDeviceIds: [id] }`; room removal unassigns devices; mirror store
 * updates after commit; capability catalog CRUD (add/update/remove with the
 * in-use checks) + `getCapabilities`.
 * (Seed-on-load behavior is covered by devicesRepository.test.ts.)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { Errors, err, ok, type Result } from '@core/errors';
import { FakeClock } from '@core/time';
import { InMemoryEventBus } from '@core/eventbus';
import { NullLogger, createLogger } from '@core/logger';

import { BUILT_IN_CAPABILITIES } from '../domain/devices';
import { AsyncStorageDevicesRepository } from '../data/devicesRepository';
import { DeviceRegistryServiceImpl } from './deviceRegistryService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

function makeRegistry(options?: {
  isCapabilityInUse?: (type: string) => boolean;
  migrateWidgetsFromRoom?: (
    fromId: string,
    toId: string | null,
  ) => Promise<Result<void>>;
}) {
  const bus = new InMemoryEventBus(createLogger('test'));
  const registry = new DeviceRegistryServiceImpl({
    repository: new AsyncStorageDevicesRepository(new NullLogger()),
    bus,
    logger: createLogger('test'),
    clock: new FakeClock(),
    isCapabilityInUse: options?.isCapabilityInUse,
    migrateWidgetsFromRoom: options?.migrateWidgetsFromRoom,
  });
  return { bus, registry };
}

describe('DeviceRegistryServiceImpl', () => {
  let bus: InMemoryEventBus;
  let registry: DeviceRegistryServiceImpl;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Start from an empty persisted snapshot (no seed) for a clean slate.
    mockGetItem.mockResolvedValue(JSON.stringify({ rooms: [], devices: [] }));
    mockSetItem.mockResolvedValue(undefined);
    const made = makeRegistry();
    bus = made.bus;
    registry = made.registry;
    await registry.load();
  });

  it('adds rooms and updates the mirror store', async () => {
    const result = await registry.addRoom('Phòng khách');
    expect(result.ok).toBe(true);
    expect(registry.getRooms()).toHaveLength(1);
    expect(registry.getRooms()[0].name).toBe('Phòng khách');
    expect(registry.getStore().getState().snapshot.rooms).toHaveLength(1);
  });

  it('rejects an empty room name', async () => {
    const result = await registry.addRoom('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('removes a room via the explicit unassign migration', async () => {
    await registry.addRoom('Phòng khách');
    const room = registry.getRooms()[0];
    await registry.addDevice({
      name: 'Đèn',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 1 },
    });
    // Assign the first device to the room.
    const device = registry.getDevices()[0];
    await registry.updateDevice(device.id, { roomId: room.id });
    expect(registry.getDevices()[0].roomId).toBe(room.id);

    // The plain (bypass) `removeRoom` no longer exists on the service —
    // deletion must always go through the explicit migration API.
    expect(
      (registry as unknown as Record<string, unknown>)['removeRoom'],
    ).toBeUndefined();

    const result = await registry.removeRoomWithMigration(room.id, {
      kind: 'unassign',
    });
    expect(result.ok).toBe(true);
    expect(registry.getRooms()).toHaveLength(0);
    expect(registry.getDevices()[0].roomId).toBeUndefined();
  });

  it('rolls the registry back when the widget migration fails', async () => {
    await registry.addRoom('Phòng A');
    await registry.addRoom('Phòng B');
    const roomA = registry.getRooms()[0];
    await registry.addDevice({
      name: 'Nhiệt',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    });
    await registry.updateDevice(registry.getDevices()[0].id, {
      roomId: roomA.id,
    });
    const roomsBefore = registry.getRooms();
    const devicesBefore = registry.getDevices();

    const failing = makeRegistry({
      migrateWidgetsFromRoom: async () =>
        err(Errors.unknown('widget store locked')),
    });
    await failing.registry.load();
    await failing.registry.addRoom('Phòng A');
    await failing.registry.addRoom('Phòng B');
    const failRoomA = failing.registry.getRooms()[0];
    await failing.registry.addDevice({
      name: 'Nhiệt',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    });
    await failing.registry.updateDevice(failing.registry.getDevices()[0].id, {
      roomId: failRoomA.id,
    });

    const result = await failing.registry.removeRoomWithMigration(
      failRoomA.id,
      { kind: 'unassign' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('rolled back');
      expect(result.error.message).toContain('widget store locked');
    }
    // Compensating rollback restored the pre-mutation snapshot: room still
    // present, device still assigned, mirror store back in sync.
    expect(failing.registry.getRooms()).toHaveLength(2);
    expect(failing.registry.getRooms()[0].id).toBe(failRoomA.id);
    expect(failing.registry.getDevices()[0].roomId).toBe(failRoomA.id);
    expect(failing.registry.getStore().getState().snapshot.rooms).toHaveLength(
      2,
    );
    expect(roomsBefore.length).toBe(2);
    expect(devicesBefore).toHaveLength(1);
  });

  it('reports an explicit failure when even the rollback persist fails', async () => {
    // Own registry with a failing widget migration so the compensation
    // path (and its persist) actually runs.
    const failing = makeRegistry({
      migrateWidgetsFromRoom: async () =>
        err(Errors.unknown('widget store locked')),
    });
    await failing.registry.load();
    await failing.registry.addRoom('Phòng A');
    const roomA = failing.registry.getRooms()[0];
    await failing.registry.addDevice({
      name: 'Nhiệt',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    });
    await failing.registry.updateDevice(failing.registry.getDevices()[0].id, {
      roomId: roomA.id,
    });

    // First save (the mutation) succeeds; the widget migration fails; the
    // rollback persist then fails too — both failures must be surfaced.
    mockSetItem.mockResolvedValueOnce(undefined);
    mockSetItem.mockRejectedValueOnce(new Error('rollback disk full'));

    const result = await failing.registry.removeRoomWithMigration(roomA.id, {
      kind: 'unassign',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Widget migration failed');
      expect(result.error.message).toContain('registry rollback failed');
      expect(result.error.message).toContain('Failed to write devices');
    }
    // In-memory state is still compensated so the UI keeps the original.
    expect(failing.registry.getRooms()).toHaveLength(1);
    expect(failing.registry.getDevices()[0].roomId).toBe(roomA.id);
    expect(failing.registry.getStore().getState().snapshot.rooms).toHaveLength(
      1,
    );
  });

  it('rejects a duplicate machine key with an explicit message', async () => {
    const first = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
      unit: 'hPa',
      icon: 'speedometer-outline',
      color: '#0878ff',
    });
    expect(first.ok).toBe(true);

    const second = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất khác',
      kind: 'sensor',
      unit: 'hPa',
      icon: 'speedometer-outline',
      color: '#0878ff',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.message).toContain(
        'Capability type "pressure" already exists',
      );
    }
    // The catalog still holds exactly one "pressure" entry.
    expect(
      registry.getCapabilities().filter(def => def.type === 'pressure'),
    ).toHaveLength(1);
  });

  it('rejects a device whose capability is not in the catalog', async () => {
    const result = await registry.addDevice({
      name: 'Cảm biến lạ',
      type: 'sensor',
      capabilities: ['ghost-capability'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        'not defined in the capability catalog',
      );
    }
    expect(registry.getDevices()).toHaveLength(0);
  });

  it('accepts a valid custom pressure assignment (catalog membership)', async () => {
    const added = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
      unit: 'hPa',
      icon: 'speedometer-outline',
      color: '#0878ff',
    });
    expect(added.ok).toBe(true);

    const result = await registry.addDevice({
      name: 'Cảm biến áp suất',
      type: 'sensor',
      capabilities: ['pressure'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(result.ok).toBe(true);
    expect(registry.getDevices()[0].capabilities).toEqual(['pressure']);
  });

  it('rejects a capability whose kind does not match the binding', async () => {
    const added = await registry.addCapability({
      type: 'custom_switch',
      label: 'Công tắc riêng',
      kind: 'switch',
      icon: 'flash-outline',
      color: '#0878ff',
    });
    expect(added.ok).toBe(true);

    const result = await registry.addDevice({
      name: 'Thiết bị sai loại',
      type: 'sensor',
      capabilities: ['custom_switch'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        'does not match a telemetry-sensor binding',
      );
    }
    expect(registry.getDevices()).toHaveLength(0);
  });

  it('rejects updateDevice patches with unknown capabilities', async () => {
    await registry.addDevice({
      name: 'Nhiệt',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' },
    });
    const id = registry.getDevices()[0].id;
    const result = await registry.updateDevice(id, {
      capabilities: ['temperature', 'ghost'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('ghost');
    }
    // The device is unchanged.
    expect(registry.getDevices()[0].capabilities).toEqual(['temperature']);
  });

  it('adds a device with a generated id and validates the binding', async () => {
    const result = await registry.addDevice({
      name: 'Đèn',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 1 },
    });
    expect(result.ok).toBe(true);
    expect(registry.getDevices()).toHaveLength(1);
    expect(registry.getDevices()[0].id).toMatch(/^dev-/);
    expect(registry.findDevice(registry.getDevices()[0].id)).toBeDefined();
  });

  it('rejects a device violating the binding↔capability constraint', async () => {
    const result = await registry.addDevice({
      name: 'Đèn',
      type: 'relay',
      capabilities: ['switch', 'temperature'],
      binding: { kind: 'relay', index: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(registry.getDevices()).toHaveLength(0);
  });

  it('removeDevice emits devices:changed with removedDeviceIds', async () => {
    await registry.addDevice({
      name: 'Đèn',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 1 },
    });
    const id = registry.getDevices()[0].id;

    const events: { removedDeviceIds: readonly string[] }[] = [];
    bus.subscribe('devices:changed', e => events.push(e));

    const result = await registry.removeDevice(id);
    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].removedDeviceIds).toEqual([id]);
    expect(registry.getDevices()).toHaveLength(0);
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('persists through the repository on every mutation', async () => {
    await registry.addRoom('Phòng khách');
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(registry.getStore().getState().snapshot),
    );
  });
});

describe('DeviceRegistryServiceImpl capability catalog', () => {
  let registry: DeviceRegistryServiceImpl;
  let isCapabilityInUse: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify({ rooms: [], devices: [] }));
    mockSetItem.mockResolvedValue(undefined);
    isCapabilityInUse = jest.fn(() => false);
    registry = makeRegistry({ isCapabilityInUse }).registry;
    await registry.load();
  });

  it('getCapabilities returns the migrated built-ins after load', () => {
    expect(registry.getCapabilities()).toEqual(BUILT_IN_CAPABILITIES);
  });

  it('addCapability validates and persists a new catalog entry', async () => {
    const result = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
      unit: 'hPa',
      color: '#5e35b1',
      icon: 'speedometer-outline',
    });
    expect(result.ok).toBe(true);
    expect(registry.getCapabilities()).toHaveLength(4);
    expect(registry.getCapabilities()[3]).toEqual({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
      unit: 'hPa',
      color: '#5e35b1',
      icon: 'speedometer-outline',
    });
    expect(mockSetItem).toHaveBeenCalled();
  });

  it('addCapability rejects a duplicate type', async () => {
    const result = await registry.addCapability({
      type: 'temperature',
      label: 'Nhiệt độ 2',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(registry.getCapabilities()).toHaveLength(3);
  });

  it('addCapability rejects an invalid definition', async () => {
    const result = await registry.addCapability({
      type: '',
      label: 'X',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('updateCapability patches a definition (type immutable)', async () => {
    const result = await registry.updateCapability('temperature', {
      color: '#ff5722',
    });
    expect(result.ok).toBe(true);
    const updated = registry
      .getCapabilities()
      .find(def => def.type === 'temperature');
    expect(updated?.color).toBe('#ff5722');
    expect(updated?.label).toBe('Nhiệt độ');
  });

  it('updateCapability rejects an unknown type', async () => {
    const result = await registry.updateCapability('ghost', { label: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
  });

  it('removeCapability rejects when a device still declares it', async () => {
    await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
    });
    await registry.addDevice({
      name: 'Cảm biến',
      type: 'sensor',
      capabilities: ['pressure'],
      binding: { kind: 'telemetry-sensor' },
    });
    const result = await registry.removeCapability('pressure');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
      expect(result.error.message).toMatch(/device/);
    }
    expect(registry.getCapabilities()).toHaveLength(4);
  });

  it('removeCapability rejects when the injected predicate says in use', async () => {
    await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
    });
    isCapabilityInUse.mockReturnValue(true);
    const result = await registry.removeCapability('pressure');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
      expect(result.error.message).toMatch(/widget/);
    }
    expect(isCapabilityInUse).toHaveBeenCalledWith('pressure');
  });

  it('removeCapability rejects a locked built-in capability', async () => {
    const result = await registry.removeCapability('temperature');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
      expect(result.error.message).toMatch(/built-in/);
    }
    expect(registry.getCapabilities()).toHaveLength(3);
  });

  it('removeCapability removes an unused custom capability', async () => {
    await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
    });
    const result = await registry.removeCapability('pressure');
    expect(result.ok).toBe(true);
    expect(registry.getCapabilities()).toHaveLength(3);
  });

  it('removeCapability rejects an unknown type', async () => {
    const result = await registry.removeCapability('ghost');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
  });

  it('a device can declare a custom capability once it is in the catalog', async () => {
    await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
    });
    const result = await registry.addDevice({
      name: 'Cảm biến áp suất',
      type: 'sensor',
      capabilities: ['pressure'],
      binding: { kind: 'telemetry-sensor' },
    });
    expect(result.ok).toBe(true);
    expect(registry.getDevices()[0].capabilities).toEqual(['pressure']);
  });
});

describe('DeviceRegistryServiceImpl removeRoomWithMigration (CP5)', () => {
  let registry: DeviceRegistryServiceImpl;
  let migrateWidgetsFromRoom: jest.Mock;

  /** Two rooms + a device in the first room (helper for the migration tests). */
  async function seedTwoRoomsWithDevice() {
    await registry.addRoom('Phòng khách');
    await registry.addRoom('Phòng ngủ');
    const [roomA] = registry.getRooms();
    await registry.addDevice({
      name: 'Đèn',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay', index: 1 },
    });
    const device = registry.getDevices()[0];
    await registry.updateDevice(device.id, { roomId: roomA.id });
    return { roomA, roomB: registry.getRooms()[1] };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify({ rooms: [], devices: [] }));
    mockSetItem.mockResolvedValue(undefined);
    migrateWidgetsFromRoom = jest.fn(() => Promise.resolve(ok(undefined)));
    registry = makeRegistry({ migrateWidgetsFromRoom }).registry;
    await registry.load();
  });

  it('move: devices move to the target room and widgets migrate too', async () => {
    const { roomA, roomB } = await seedTwoRoomsWithDevice();

    const result = await registry.removeRoomWithMigration(roomA.id, {
      kind: 'move',
      roomId: roomB.id,
    });
    expect(result.ok).toBe(true);
    expect(registry.getRooms()).toHaveLength(1);
    expect(registry.getDevices()[0].roomId).toBe(roomB.id);
    // The devices commit happens first, then the widget applier runs with the
    // removed room id and the target room id.
    expect(migrateWidgetsFromRoom).toHaveBeenCalledTimes(1);
    expect(migrateWidgetsFromRoom).toHaveBeenCalledWith(roomA.id, roomB.id);
  });

  it('unassign: devices become roomless and widgets become global', async () => {
    const { roomA } = await seedTwoRoomsWithDevice();

    const result = await registry.removeRoomWithMigration(roomA.id, {
      kind: 'unassign',
    });
    expect(result.ok).toBe(true);
    expect(registry.getRooms()).toHaveLength(1);
    expect(registry.getDevices()[0].roomId).toBeUndefined();
    expect(migrateWidgetsFromRoom).toHaveBeenCalledWith(roomA.id, null);
  });

  it('rejects an unknown room id without migrating', async () => {
    const result = await registry.removeRoomWithMigration('ghost', {
      kind: 'unassign',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
    expect(migrateWidgetsFromRoom).not.toHaveBeenCalled();
  });

  it('rejects moving a room into itself', async () => {
    const { roomA } = await seedTwoRoomsWithDevice();
    const result = await registry.removeRoomWithMigration(roomA.id, {
      kind: 'move',
      roomId: roomA.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(registry.getRooms()).toHaveLength(2);
    expect(migrateWidgetsFromRoom).not.toHaveBeenCalled();
  });

  it('rejects moving devices to a room that does not exist', async () => {
    const { roomA } = await seedTwoRoomsWithDevice();
    const result = await registry.removeRoomWithMigration(roomA.id, {
      kind: 'move',
      roomId: 'ghost',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
    expect(registry.getRooms()).toHaveLength(2);
    expect(migrateWidgetsFromRoom).not.toHaveBeenCalled();
  });

  it('succeeds without an injected widget applier (roomless fallback)', async () => {
    const bare = makeRegistry();
    await bare.registry.load();
    await bare.registry.addRoom('Phòng khách');
    const [room] = bare.registry.getRooms();

    const result = await bare.registry.removeRoomWithMigration(room.id, {
      kind: 'unassign',
    });
    expect(result.ok).toBe(true);
    expect(bare.registry.getRooms()).toHaveLength(0);
  });
});

describe('addCapability strict machine-key validation (CP-R4)', () => {
  let registry: DeviceRegistryServiceImpl;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(JSON.stringify({ rooms: [], devices: [] }));
    mockSetItem.mockResolvedValue(undefined);
    const made = makeRegistry();
    registry = made.registry;
    await registry.load();
  });

  it('accepts a valid ASCII machine key', async () => {
    const result = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
      unit: 'hPa',
    });
    expect(result.ok).toBe(true);
    expect(registry.getCapabilities().some(c => c.type === 'pressure')).toBe(
      true,
    );
  });

  it('rejects a Vietnamese/non-ASCII machine key', async () => {
    const result = await registry.addCapability({
      type: 'áp-suất',
      label: 'Áp suất',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(registry.getCapabilities().some(c => c.type === 'áp-suất')).toBe(
      false,
    );
  });

  it('rejects a key with hyphens', async () => {
    const result = await registry.addCapability({
      type: 'pressure-value',
      label: 'Pressure Value',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
    expect(
      registry.getCapabilities().some(c => c.type === 'pressure-value'),
    ).toBe(false);
  });

  it('rejects an uppercase key', async () => {
    const result = await registry.addCapability({
      type: 'Pressure',
      label: 'Pressure',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a digit-starting key', async () => {
    const result = await registry.addCapability({
      type: '1pressure',
      label: 'Pressure',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
  });

  it('still rejects duplicate keys even with valid format', async () => {
    await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất',
      kind: 'sensor',
    });
    const result = await registry.addCapability({
      type: 'pressure',
      label: 'Áp suất 2',
      kind: 'sensor',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
  });
});

describe('updateCapability legacy compatibility (CP-R4)', () => {
  it('can update metadata of a legacy non-ASCII keyed capability', async () => {
    jest.clearAllMocks();
    // Pre-populate storage with a snapshot containing a legacy key
    const legacySnapshot = {
      rooms: [],
      devices: [],
      capabilities: [
        ...BUILT_IN_CAPABILITIES,
        { type: 'áp-suất', label: 'Áp suất', kind: 'sensor', unit: 'hPa' },
      ],
    };
    mockGetItem.mockResolvedValue(JSON.stringify(legacySnapshot));
    mockSetItem.mockResolvedValue(undefined);
    const made = makeRegistry();
    const reg = made.registry;
    await reg.load();

    const result = await reg.updateCapability('áp-suất', {
      label: 'Áp suất mới',
    });
    expect(result.ok).toBe(true);
    const cap = reg.getCapabilities().find(c => c.type === 'áp-suất');
    expect(cap?.label).toBe('Áp suất mới');
  });
});
