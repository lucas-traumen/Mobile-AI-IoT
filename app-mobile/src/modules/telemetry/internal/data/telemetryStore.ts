/**
 * Telemetry store — thin ViewModel + connection state machine.
 *
 * The store holds the MQTT connection state (`idle → connecting → connected →
 * reconnecting → failed`) and the latest validated readings. Parsing and
 * validation happen in the domain layer before the store is touched.
 */

import { create } from 'zustand';

import type { AppErrorCode } from '@core/errors';

import type { TelemetryReading } from '@modules/telemetry/api';

/** Connection lifecycle state. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

interface TelemetryState {
  /** MQTT connection state. */
  connection: ConnectionState;
  /**
   * Machine-readable cause of the last failed connection (CP5), or null
   * while healthy. Set on `failed`/`timeout` transitions; cleared on
   * `connected` so the UI only shows a friendly label when offline.
   */
  lastErrorCode: AppErrorCode | null;
  /** Latest validated reading, or null before the first message. */
  latest: TelemetryReading | null;
  /** Number of readings received since connect. */
  messageCount: number;
  /**
   * Transition the connection state. `failed` records a cause (default
   * `network`); `connected` clears the recorded cause.
   */
  setConnection(state: ConnectionState, errorCode?: AppErrorCode): void;
  /** Apply a *validated* reading. */
  applyReading(reading: TelemetryReading): void;
}

/** The zustand store instance shape returned by {@link createTelemetryStore}. */
export type TelemetryStore = ReturnType<typeof createTelemetryStore>;

/** Create the telemetry zustand store. */
export function createTelemetryStore() {
  return create<TelemetryState>(set => ({
    connection: 'idle',
    lastErrorCode: null,
    latest: null,
    messageCount: 0,

    setConnection: (state, errorCode) =>
      set(previous => {
        if (state === 'failed') {
          return {
            connection: state,
            lastErrorCode: errorCode ?? previous.lastErrorCode ?? 'network',
          };
        }
        if (state === 'connected') {
          return { connection: state, lastErrorCode: null };
        }
        return { connection: state };
      }),

    applyReading: reading =>
      set(state => ({
        latest: reading,
        messageCount: state.messageCount + 1,
      })),
  }));
}
