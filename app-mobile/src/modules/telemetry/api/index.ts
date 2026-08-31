/**
 * Telemetry module — public facade.
 *
 * The only entry point other modules may use. Everything else lives in
 * `internal/` and must not be imported across modules (enforced by
 * `eslint-plugin-boundaries`).
 */

import type { TelemetryReading } from '@core/events';

/** Shared event payload type (`telemetry:received`). */
export type { TelemetryReading };

/** MQTT port/adapter types (the hexagonal boundary of the module). */
export type {
  MqttClientPort,
  MqttConnectionState,
  MqttConnectionConfig,
  MqttMessage,
} from '../internal/data/mqttClientPort';
/** `mqtt` v5 WebSocket adapter implementing {@link MqttClientPort}. */
export { MqttJsClient } from '../internal/data/mqttJsClient';
/** Payload validation (pure): zod schema + parse helper for `<prefix>/tele/sensor`. */
export {
  parseTelemetryPayload,
  TelemetryPayloadSchema,
} from '../internal/domain/payloads';
/** Type of a validated telemetry payload. */
export type { TelemetryPayload } from '../internal/domain/payloads';
/** zustand ViewModel factory: latest readings + MQTT connection state. */
export { createTelemetryStore } from '../internal/data/telemetryStore';
/** Store shape + connection-state union (`idle|connecting|connected|reconnecting|failed`). */
export type {
  ConnectionState,
  TelemetryStore,
} from '../internal/data/telemetryStore';
/** Default {@link TelemetryService} implementation (MQTT → validate → store → bus). */
export { TelemetryServiceImpl } from '../internal/services/telemetryService';

/**
 * Telemetry service — subscribes to the MQTT telemetry topic, validates
 * payloads, updates the store and publishes `telemetry:received`.
 */
export interface TelemetryService {
  /** Start listening: connect (if needed), subscribe `<prefix>/tele/sensor`. */
  start(): void;
  /** Stop listening: disconnect MQTT, reset state to idle. */
  stop(): void;
}
