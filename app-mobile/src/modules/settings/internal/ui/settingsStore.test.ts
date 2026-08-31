/**
 * Settings store (zustand ViewModel) tests.
 *
 * Verifies:
 * - updateMqtt / updateInflux recompute field-level errors on the draft.
 * - save() with an invalid draft does NOT reach the service (errors surface).
 * - save() with a valid draft calls the service and records the outcome.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { ok, type Result } from '@core/errors';
import { createLogger } from '@core/logger';

import type { AppSettings } from '@modules/settings/api';

import type { SettingsRepository } from '../data/settingsRepository';
import { SettingsServiceImpl } from '../services/settingsService';
import { createSettingsStore } from './settingsStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const validSettings: AppSettings = {
  mqtt: {
    host: 'broker.local',
    port: 9001,
    username: undefined,
    password: undefined,
    prefix: 'home',
  },
  influx: {
    url: 'http://influx.local:8086',
    org: 'iot',
    bucket: 'sensors',
    token: 'tok',
  },
  ui: { theme: 'system' },
};

class FakeSettingsRepository implements SettingsRepository {
  public saved: AppSettings | null = null;
  async load(): Promise<Result<AppSettings>> {
    return ok(validSettings);
  }
  async save(settings: AppSettings): Promise<Result<void>> {
    this.saved = settings;
    return ok(undefined);
  }
}

function makeStore() {
  const repository = new FakeSettingsRepository();
  const bus = new InMemoryEventBus(createLogger('test'));
  const service = new SettingsServiceImpl(
    repository,
    bus,
    createLogger('test'),
  );
  const store = createSettingsStore(service);
  return { repository, bus, store };
}

describe('createSettingsStore', () => {
  it('recomputes field-level errors when the draft changes', () => {
    const { store } = makeStore();
    store.getState().setCurrent(validSettings);

    store.getState().updateMqtt({ host: '' });
    expect(store.getState().errors['mqtt.host']).toBeTruthy();

    store.getState().updateMqtt({ host: 'broker.local' });
    expect(store.getState().errors).toEqual({});

    store.getState().updateInflux({ url: 'not-a-url' });
    expect(store.getState().errors['influx.url']).toBeTruthy();
  });

  it('does not call the service when the draft is invalid', async () => {
    const { repository, store } = makeStore();
    store.getState().updateInflux({ token: '' });
    await store.getState().save();
    expect(repository.saved).toBeNull();
    expect(store.getState().saveMessage).toContain('Fix the highlighted');
  });

  it('calls the service and records success on save', async () => {
    const { repository, store } = makeStore();
    store.getState().setCurrent(validSettings);
    await store.getState().save();
    expect(repository.saved).toEqual(validSettings);
    expect(store.getState().saveMessage).toBe('Settings saved and applied.');
  });
});
