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
 * A validated sensor reading: known fields (temperature °C, humidity %) are
 * optional and any additional finite-number field (e.g. `pressure`) may be
 * present. At least one numeric field is guaranteed by the parser.
 */
export interface TelemetryReading {
  readonly temperature?: number;
  readonly humidity?: number;
  /** Unix epoch seconds if the device sent one, otherwise undefined. */
  readonly ts?: number;
  /** Additional sensor fields (open payload, e.g. `pressure: 1013`). */
  readonly [key: string]: number | undefined;
}

/** A relay ON/OFF command for one of the three relays. */
export interface RelayCommand {
  readonly index: 1 | 2 | 3;
  readonly state: 'ON' | 'OFF';
}

/** Relay state reported back by the device (optional feedback topic). */
export interface RelayFeedback {
  readonly index: 1 | 2 | 3;
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
    /** Theme preference selected in Settings (resolved by the app root). */
    readonly theme: 'system' | 'light' | 'dark';
  };
}
