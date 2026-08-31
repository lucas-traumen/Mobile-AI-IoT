/**
 * SettingsServiceImpl.save emits settings:changed on EventBus.
 *
 * Verifies that a successful save publishes the new settings so that
 * dependent modules (MQTT, Influx) can react.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { createLogger } from '@core/logger';

import type { AppSettings } from '../domain/settingsSchema';
import type { SettingsRepository } from '../data/settingsRepository';
import { ok, type Result } from '@core/errors';
import { SettingsServiceImpl } from './settingsService';

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

describe('SettingsServiceImpl.save', () => {
  it('emits settings:changed after a successful save', async () => {
    const bus = new InMemoryEventBus(createLogger('test'));
    const repo = new FakeSettingsRepository();
    const service = new SettingsServiceImpl(repo, bus, createLogger('test'));

    const events: unknown[] = [];
    bus.subscribe('settings:changed', e => events.push(e));

    const result = await service.save(validSettings);
    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
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
    });
  });
});
