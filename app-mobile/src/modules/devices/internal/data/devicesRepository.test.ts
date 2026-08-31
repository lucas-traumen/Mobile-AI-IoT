/**
 * AsyncStorageDevicesRepository tests.
 *
 * Verifies: seed on first run, round-trip persistence, malformed/failed
 * validation falls back to seed, storage failures map to Result errors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NullLogger } from '@core/logger';

import { BUILT_IN_CAPABILITIES } from '../domain/devices';
import { seedDevices } from '../domain/seeds';
import type { DevicesSnapshot } from '../domain/devices';
import { AsyncStorageDevicesRepository } from './devicesRepository';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('AsyncStorageDevicesRepository', () => {
  let repo: AsyncStorageDevicesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AsyncStorageDevicesRepository(new NullLogger());
  });

  it('seeds defaults when nothing is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(seedDevices());
    }
  });

  it('persists and reloads a snapshot (round-trip)', async () => {
    const snapshot: DevicesSnapshot = {
      rooms: [{ id: 'room-1', name: 'Phòng khách', order: 0 }],
      devices: [
        {
          id: 'dev-1',
          name: 'Đèn',
          type: 'relay',
          capabilities: ['switch'],
          binding: { kind: 'relay', index: 1 },
        },
      ],
      capabilities: BUILT_IN_CAPABILITIES,
    };
    const saveResult = await repo.save(snapshot);
    expect(saveResult.ok).toBe(true);
    expect(mockSetItem).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(snapshot),
    );

    mockGetItem.mockResolvedValueOnce(JSON.stringify(snapshot));
    const loadResult = await repo.load();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value).toEqual(snapshot);
    }
  });

  it('migrates a pre-catalog snapshot to the built-in catalog', async () => {
    // Old persisted file without the `capabilities` field.
    const legacy = {
      rooms: [],
      devices: [
        {
          id: 'dev-1',
          name: 'Đèn',
          type: 'relay',
          capabilities: ['switch'],
          binding: { kind: 'relay', index: 1 },
        },
      ],
    };
    mockGetItem.mockResolvedValueOnce(JSON.stringify(legacy));
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.capabilities).toEqual(BUILT_IN_CAPABILITIES);
      expect(result.value.devices).toEqual(legacy.devices);
    }
  });

  it('seeds defaults when stored JSON is malformed', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{');
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(seedDevices());
    }
  });

  it('seeds defaults when stored value fails validation', async () => {
    // Relay binding with temperature capability violates the constraint.
    mockGetItem.mockResolvedValueOnce(
      JSON.stringify({
        rooms: [],
        devices: [
          {
            id: 'bad',
            name: 'Bad',
            type: 'relay',
            capabilities: ['switch', 'temperature'],
            binding: { kind: 'relay', index: 1 },
          },
        ],
      }),
    );
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(seedDevices());
    }
  });

  it('rejects saving an invalid snapshot with a validation error', async () => {
    const invalid: DevicesSnapshot = {
      rooms: [],
      devices: [
        {
          id: 'bad',
          name: 'Bad',
          type: 'relay',
          capabilities: ['temperature'],
          binding: { kind: 'relay', index: 1 },
        },
      ],
      capabilities: BUILT_IN_CAPABILITIES,
    };
    const result = await repo.save(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
    }
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('maps storage read failures to a Result error', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('storage boom'));
    const result = await repo.load();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
    }
  });
});
