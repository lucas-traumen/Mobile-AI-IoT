/**
 * Shared event payload types used by {@link EventMap}.
 *
 * These types are deliberately declared in `core` (not in the modules) so the
 * event bus contract can be defined without importing module internals.
 * Modules re-export their own payload types through their `api/` facade.
 */

/** MQTT connection lifecycle states. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/**
 * A validated room-scoped sensor reading (approved room-sensor rework):
 * each MQTT topic `<prefix>/room/<roomId>/sensor/<field>` carries exactly
 * ONE finite numeric metric, and the topic carries the source identity.
 * Exact dispatch: only registrations matching BOTH the room and the field
 * consume the value.
 */
export interface SensorTelemetry {
  readonly roomId: string;
  /** Sensor field (capability machine key, e.g. `temperature`). */
  readonly field: string;
  /** The parsed finite metric value. */
  readonly value: number;
}

/**
 * A relay ON/OFF command for one room-scoped slot.
 *
 * Room-scoped protocol: the identity is `{ roomId, index }` with
 * `index` in 1..10 — the same slot number can be used independently in
 * different rooms. The topic routes through
 * `<prefix>/room/<roomId>/cmnd/relay/<index>`.
 */
export interface RelayCommand {
  readonly roomId: string;
  readonly index: import('./constants').RelaySlotIndex;
  readonly state: 'ON' | 'OFF';
}

/**
 * Relay state reported back by the device (optional feedback topic
 * `<prefix>/room/<roomId>/stat/relay/<index>`).
 */
export interface RelayFeedback {
  readonly roomId: string;
  readonly index: import('./constants').RelaySlotIndex;
  readonly state: 'ON' | 'OFF';
}

/** Snapshot of the persisted app settings (no secrets beyond token). */
export interface SettingsSnapshot {
  readonly mqtt: {
    readonly host: string;
    readonly port: number;
    readonly username?: string;
    readonly password?: string;
    readonly prefix: string;
  };
  readonly influx: {
    readonly url: string;
    readonly org: string;
    readonly bucket: string;
    readonly token: string;
  };
  readonly ui: {
    /**
     * Theme preference selected in Settings. Exactly two explicit choices —
     * `'system'` no longer exists (persisted legacy values migrate to
     * `'light'` in the settings module before they reach the app runtime).
     */
    readonly theme: 'light' | 'dark';
  };
  /**
   * Scope of the change that produced this snapshot (user-authorized
   * exceptional fix for the Settings draft-loss defect): `'full'` = the
   * complete persisted settings changed (bootstrap adoption or an explicit
   * full save) — consumers may adopt the snapshot wholesale. `'ui-only'` =
   * ONLY UI preferences changed; the technical fields are identical to the
   * previously persisted settings, so the settings store must preserve any
   * divergent unsaved technical draft instead of replacing it.
   */
  readonly changeScope: 'full' | 'ui-only';
}
