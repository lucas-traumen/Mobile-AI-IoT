/**
 * Settings persistence: AsyncStorage adapter (port + implementation).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@core/constants';
import { err, Errors, ok, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { AppSettings } from '../domain/settingsSchema';
import { defaultSettings, parseSettings } from '../domain/settingsSchema';

/** Port: persisted settings access (no storage knowledge leaks into domain). */
export interface SettingsRepository {
  /** Load persisted settings; returns defaults when nothing was saved. */
  load(): Promise<Result<AppSettings>>;
  /** Persist settings; validates before writing. */
  save(settings: AppSettings): Promise<Result<void>>;
}

/** AsyncStorage-backed implementation of {@link SettingsRepository}. */
export class AsyncStorageSettingsRepository implements SettingsRepository {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async load(): Promise<Result<AppSettings>> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
      if (raw === null) {
        return ok(defaultSettings());
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        this.logger.warn(
          'Settings: stored value is not valid JSON, ignoring',
          e,
        );
        return ok(defaultSettings());
      }
      const result = parseSettings(parsed);
      if (!result.ok) {
        this.logger.warn(
          'Settings: stored value failed validation, ignoring',
          result.errors,
        );
        return ok(defaultSettings());
      }
      return ok(result.value);
    } catch (e) {
      return err(Errors.unknown('Failed to read settings from storage', e));
    }
  }

  async save(settings: AppSettings): Promise<Result<void>> {
    const result = parseSettings(settings);
    if (!result.ok) {
      return err(
        Errors.validation('Cannot persist invalid settings', result.errors),
      );
    }
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify(result.value),
      );
      return ok(undefined);
    } catch (e) {
      return err(Errors.unknown('Failed to write settings to storage', e));
    }
  }
}
