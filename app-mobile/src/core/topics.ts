/**
 * Cross-module MQTT/history naming conventions (pure functions).
 *
 * Topic contract (prefix configurable, default `home`) — approved
 * `room-sensor-derived-history-layout-rework` plan:
 *
 * - sensor telemetry (ONE finite numeric metric per topic, identity is the
 *   room-scoped `{roomId, field}` value object):
 *
 *   ```text
 *   <prefix>/room/<roomId>/sensor/<field> -> 25.6
 *   ```
 *
 * - relay command: `<prefix>/room/<roomId>/cmnd/relay/<1..10>` (built +
 *   validated in `modules/relay/internal/domain/commands.ts`)
 * - relay feedback: `<prefix>/room/<roomId>/stat/relay/<1..10>` (same;
 *   identity is the room-scoped `{roomId, slot}` value object)
 *
 * The ambiguous legacy global JSON topic `<prefix>/tele/sensor` is RETIRED
 * (not dual-read): without source identity it would fan one payload into
 * every room.
 */

import { Errors, err, ok, type Result } from '@core/errors';

/** One numeric sensor reading identity (topic suffix + Influx `_field`). */
export interface SensorTopicAddress {
  readonly roomId: string;
  readonly field: string;
}

/**
 * Build the sensor telemetry topic for one room-scoped metric.
 *
 * @param prefix - configured MQTT prefix (e.g. `home`).
 * @param address - the `{roomId, field}` identity.
 * @returns e.g. `home/room/room-living/sensor/temperature`.
 */
export function sensorTopic(
  prefix: string,
  address: SensorTopicAddress,
): string {
  return `${prefix}/room/${address.roomId}/sensor/${address.field}`;
}

/**
 * The sensor telemetry subscription wildcard:
 * `<prefix>/room/+/sensor/+` (any room, any field — dispatch is exact).
 */
export function sensorSubscriptionTopic(prefix: string): string {
  return `${prefix}/room/+/sensor/+`;
}

/**
 * MQTT wildcard characters that must never appear inside a concrete topic
 * segment (a `+`/`#` in the room/field would silently widen dispatch).
 */
const WILDCARD_CHARS = new Set(['+', '#']);

/** Validate one concrete topic segment (non-empty, no wildcards/slashes). */
function isValidSegment(segment: string): boolean {
  if (segment.length === 0) {
    return false;
  }
  for (const ch of segment) {
    if (ch === '/' || WILDCARD_CHARS.has(ch)) {
      return false;
    }
  }
  return true;
}

/**
 * Parse a concrete sensor telemetry topic into its `{roomId, field}`
 * identity (pure, exact — no ambiguity, no guessing).
 *
 * @param topic - the received MQTT topic.
 * @param prefix - the configured prefix (must match exactly).
 * @returns `ok({roomId, field})` for a well-formed
 *   `<prefix>/room/<roomId>/sensor/<field>` topic; `err(code:
 *   'validation')` for wrong prefixes, wrong shapes, empty segments or
 *   wildcard-like segments (such messages are dropped by the service).
 */
export function parseSensorTopic(
  topic: string,
  prefix: string,
): Result<SensorTopicAddress> {
  const roomPrefix = `${prefix}/room/`;
  if (!topic.startsWith(roomPrefix)) {
    return err(
      Errors.validation(
        `Sensor topic does not start with "${roomPrefix}": ${topic}`,
      ),
    );
  }
  const rest = topic.slice(roomPrefix.length);
  const parts = rest.split('/');
  // Exactly `roomId + "sensor" + field`.
  if (parts.length !== 3 || parts[1] !== 'sensor') {
    return err(Errors.validation(`Malformed sensor topic: ${topic}`));
  }
  const roomId = parts[0] ?? '';
  const field = parts[2] ?? '';
  if (!isValidSegment(roomId) || !isValidSegment(field)) {
    return err(
      Errors.validation(
        `Sensor topic has an empty or wildcard-like segment: ${topic}`,
      ),
    );
  }
  return ok({ roomId, field });
}
