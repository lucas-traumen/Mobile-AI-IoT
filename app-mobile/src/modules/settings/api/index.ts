/**
 * Settings module — public facade.
 *
 * The only entry point other modules may use. Everything else lives in
 * `internal/` and must not be imported across modules (enforced by
 * `eslint-plugin-boundaries`).
 */

import type { SettingsSnapshot } from '@core/events';
import type { Result } from '@core/errors';

import type {
  AppSettings,
  InfluxSettings,
  MqttSettings,
} from '../internal/domain/settingsSchema';
import type { SettingsRepository } from '../internal/data/settingsRepository';

/** UI preferences (theme mode) persisted with the settings. */
export type { UiSettings } from '../internal/domain/settingsSchema';
/** Full persisted settings shape (mqtt + influx + ui). */
export type { AppSettings, InfluxSettings, MqttSettings };
/** Persistence port (implemented by {@link AsyncStorageSettingsRepository}). */
export type { SettingsRepository };
/** Event payload type broadcast on `settings:changed`. */
export type { SettingsSnapshot };

/** Settings domain: zod schemas + defaults + pure validation (single source of truth). */
export {
  defaultSettings,
  parseSettings,
  SettingsSchema,
} from '../internal/domain/settingsSchema';
/** zod schema for the UI settings subset (`theme`). */
export { UiSettingsSchema } from '../internal/domain/settingsSchema';
/** AsyncStorage persistence adapter (zod-validated round-trip). */
export { AsyncStorageSettingsRepository } from '../internal/data/settingsRepository';
/** Default {@link SettingsService} implementation (repository + event bus). */
export { SettingsServiceImpl } from '../internal/services/settingsService';
/** zustand ViewModel factory for the settings form (draft/current/errors). */
export { createSettingsStore } from '../internal/ui/settingsStore';
/** Store shape + field-error map (dotted paths). */
export type {
  SettingsFormErrors,
  SettingsStore,
} from '../internal/ui/settingsStore';

/**
 * Settings service — application-level operations exposed to the rest of the
 * app. The UI and other modules interact with settings only through here.
 */
export interface SettingsService {
  /**
   * Load persisted settings (defaults when nothing is stored yet).
   *
   * @returns `ok(settings)` with the persisted (or default) settings,
   *   `err` when storage read fails.
   */
  load(): Promise<Result<AppSettings>>;

  /**
   * Validate + persist new settings, then publish `settings:changed` on the
   * event bus so telemetry/relay/history can reconfigure.
   *
   * @param settings - candidate settings (validated with zod first).
   * @returns `ok(void)` on success; `err` with code `validation` when the
   *   input is invalid, or `unknown` when storage write fails.
   */
  save(settings: AppSettings): Promise<Result<void>>;

  /**
   * Subscribe to settings changes (payload: full {@link SettingsSnapshot}).
   *
   * @param handler - called with the new settings after a successful save.
   * @returns unsubscribe function.
   */
  onChanged(handler: (snapshot: SettingsSnapshot) => void): () => void;
}
