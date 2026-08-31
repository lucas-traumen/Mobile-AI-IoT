/**
 * Default {@link SettingsService} implementation: validates + persists via
 * the repository and broadcasts `settings:changed` on the event bus.
 */

import type { EventBus } from '@core/eventbus';
import type { SettingsSnapshot } from '@core/events';
import { err, Errors, ok, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { AppSettings } from '../domain/settingsSchema';
import { parseSettings } from '../domain/settingsSchema';
import type { SettingsRepository } from '../data/settingsRepository';

function toSnapshot(settings: AppSettings): SettingsSnapshot {
  return {
    mqtt: {
      host: settings.mqtt.host,
      port: settings.mqtt.port,
      username: settings.mqtt.username,
      password: settings.mqtt.password,
      prefix: settings.mqtt.prefix,
    },
    influx: {
      url: settings.influx.url,
      org: settings.influx.org,
      bucket: settings.influx.bucket,
      token: settings.influx.token,
    },
    ui: {
      theme: settings.ui.theme,
    },
  };
}

/** Settings service bound to a repository + event bus. */
export class SettingsServiceImpl {
  private readonly repository: SettingsRepository;
  private readonly bus: EventBus;
  private readonly logger: Logger;

  constructor(repository: SettingsRepository, bus: EventBus, logger: Logger) {
    this.repository = repository;
    this.bus = bus;
    this.logger = logger;
  }

  /** Load persisted settings (defaults when nothing is stored yet). */
  async load(): Promise<Result<AppSettings>> {
    return this.repository.load();
  }

  /** Validate + persist, then broadcast `settings:changed`. */
  async save(settings: AppSettings): Promise<Result<void>> {
    const validated = parseSettings(settings);
    if (!validated.ok) {
      return err(Errors.validation('Invalid settings', validated.errors));
    }
    const result = await this.repository.save(validated.value);
    if (!result.ok) {
      return result;
    }
    this.logger.info('Settings saved; broadcasting settings:changed');
    this.bus.emit('settings:changed', toSnapshot(validated.value));
    return ok(undefined);
  }

  /** Subscribe to settings changes. */
  onChanged(handler: (snapshot: SettingsSnapshot) => void): () => void {
    return this.bus.subscribe('settings:changed', handler);
  }
}
