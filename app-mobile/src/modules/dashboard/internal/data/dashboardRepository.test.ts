/**
 * AsyncStorageDashboardRepository tests.
 *
 * Verifies: seed on first run, round-trip persistence, malformed/failed
 * validation falls back to seed, storage failures map to Result errors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NullLogger } from '@core/logger';

import { defaultDashboardsFile } from '../domain/seeds';
import type { DashboardsFile } from '../domain/dashboardSchema';
import { AsyncStorageDashboardRepository } from './dashboardRepository';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('AsyncStorageDashboardRepository', () => {
  let repo: AsyncStorageDashboardRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AsyncStorageDashboardRepository(new NullLogger());
  });

  it('seeds defaults when nothing is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(defaultDashboardsFile());
    }
  });

  it('persists and reloads a file (round-trip)', async () => {
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-1',
              type: 'room-device-list',
              layout: { x: 0, y: 0, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    const saveResult = await repo.save(file);
    expect(saveResult.ok).toBe(true);
    expect(mockSetItem).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(file),
    );

    mockGetItem.mockResolvedValueOnce(JSON.stringify(file));
    const loadResult = await repo.load();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value).toEqual(file);
    }
  });

  it('migrates a pre-room file (no activeRoomId) to null', async () => {
    // Old persisted file without the `activeRoomId` field.
    const legacy = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            {
              id: 'w-1',
              type: 'room-device-list',
              layout: { x: 0, y: 0, width: 2, height: 1 },
            },
          ],
        },
      ],
      activeId: 'main',
    };
    mockGetItem.mockResolvedValueOnce(JSON.stringify(legacy));
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.activeRoomId).toBeNull();
      expect(result.value.dashboards).toEqual(legacy.dashboards);
    }
  });

  it('seeds defaults when stored JSON is malformed', async () => {
    mockGetItem.mockResolvedValueOnce('not-json{');
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(defaultDashboardsFile());
    }
  });

  it('seeds defaults when stored value fails validation', async () => {
    // activeId does not match any dashboard → invalid file.
    mockGetItem.mockResolvedValueOnce(
      JSON.stringify({ dashboards: [], activeId: 'ghost' }),
    );
    const result = await repo.load();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(defaultDashboardsFile());
    }
  });

  it('rejects saving an invalid file with a validation error', async () => {
    const invalid: DashboardsFile = {
      dashboards: [],
      activeId: 'ghost',
      activeRoomId: null,
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
