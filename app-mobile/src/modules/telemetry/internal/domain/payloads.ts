/**
 * Telemetry domain: payload schemas + pure parsing.
 *
 * The MQTT telemetry payload is external data — zod validates it before
 * anything else touches it. Invalid payloads are rejected safely (never crash).
 */

import { z } from 'zod';

import { Errors, err, ok, type Result } from '@core/errors';

/** MQTT telemetry payload published to `<prefix>/tele/sensor`. */
export const TelemetryPayloadSchema = z
  .object({
    /** Temperature in °C (optional — devices may report fewer fields). */
    temperature: z.number().finite().optional(),
    /** Relative humidity in % (optional — devices may report fewer fields). */
    humidity: z.number().finite().optional(),
    /** Optional device timestamp (Unix epoch seconds). */
    ts: z.number().int().positive().optional(),
  })
  // Open payload: any extra field (e.g. `pressure`) must be a finite number.
  .catchall(z.number().finite());

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

/** Count the numeric sensor fields of a payload (`ts` excluded). */
function sensorFieldCount(payload: TelemetryPayload): number {
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'ts' && typeof value === 'number') {
      count += 1;
    }
  }
  return count;
}

/** Validated sensor reading (same shape as the payload). */
export type TelemetryReading = TelemetryPayload;

/**
 * Parse a raw MQTT payload string into a validated {@link TelemetryReading}.
 *
 * @param raw - UTF-8 payload received on the telemetry topic.
 * @returns `ok(reading)` when the JSON parses and validates,
 *   `err(code: 'validation')` otherwise.
 */
export function parseTelemetryPayload(raw: string): Result<TelemetryReading> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(Errors.validation('Telemetry payload is not valid JSON'));
  }
  const result = TelemetryPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return err(
      Errors.validation(
        `Telemetry payload failed validation: ${result.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      ),
    );
  }
  if (sensorFieldCount(result.data) === 0) {
    return err(
      Errors.validation(
        'Telemetry payload has no numeric sensor field (temperature/humidity/custom)',
      ),
    );
  }
  return ok(result.data);
}
