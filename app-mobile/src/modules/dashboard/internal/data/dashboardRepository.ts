/**
 * Dashboard persistence: AsyncStorage adapter (port + implementation).
 *
 * Same pattern as the settings/devices repositories: load → seed on first
 * run, validate with zod before trusting anything, map IO failures to
 * {@link Result}. Invalid stored data is logged and replaced with seeds
 * (never thrown).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@core/constants';
import { err, Errors, ok, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { DashboardsFile } from '../domain/dashboardSchema';
import { parseDashboardsFile } from '../domain/dashboardSchema';
import { defaultDashboardsFile } from '../domain/seeds';

/** Port: persisted dashboards access (no storage knowledge in domain). */
export interface DashboardRepository {
  /** Load the persisted file; seeds defaults when nothing was saved. */
  load(): Promise<Result<DashboardsFile>>;
  /** Persist a file; validates before writing. */
  save(file: DashboardsFile): Promise<Result<void>>;
}

/** AsyncStorage-backed implementation of {@link DashboardRepository}. */
export class AsyncStorageDashboardRepository implements DashboardRepository {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async load(): Promise<Result<DashboardsFile>> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.dashboards);
      if (raw === null) {
        return ok(defaultDashboardsFile());
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        this.logger.warn(
          'Dashboards: stored value is not valid JSON, seeding defaults',
          e,
        );
        return ok(defaultDashboardsFile());
      }
      const result = parseDashboardsFile(parsed);
      if (!result.ok) {
        this.logger.warn(
          'Dashboards: stored value failed validation, seeding defaults',
          result.errors,
        );
        return ok(defaultDashboardsFile());
      }
      return ok(result.value);
    } catch (e) {
      return err(Errors.unknown('Failed to read dashboards from storage', e));
    }
  }

  async save(file: DashboardsFile): Promise<Result<void>> {
    const result = parseDashboardsFile(file);
    if (!result.ok) {
      return err(
        Errors.validation(
          'Cannot persist invalid dashboards file',
          result.errors,
        ),
      );
    }
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.dashboards,
        JSON.stringify(result.value),
      );
      return ok(undefined);
    } catch (e) {
      return err(Errors.unknown('Failed to write dashboards to storage', e));
    }
  }
}
