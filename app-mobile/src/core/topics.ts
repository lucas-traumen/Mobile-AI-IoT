/**
 * Cross-module MQTT/history naming conventions (pure functions).
 *
 * Topic contract (prefix configurable, default `home`):
 * - telemetry: `<prefix>/tele/sensor`
 * - relay command: `<prefix>/cmnd/relay/<n>` (built + validated in
 *   `modules/relay/internal/domain/commands.ts`)
 * - relay feedback: `<prefix>/stat/relay/<n>` (same)
 */

/** Build the telemetry subscription topic. */
export function telemetryTopic(prefix: string): string {
  return `${prefix}/tele/sensor`;
}

/**
 * History data sources whose readings feed the charts. Each source maps to a
 * field of {@link import('@core/events').TelemetryReading} and to an
 * InfluxDB measurement written by the collector.
 */
export const HISTORY_FIELDS = ['temperature', 'humidity'] as const;

/** A field served by the history charts. */
export type HistoryField = (typeof HISTORY_FIELDS)[number];
