/**
 * Relay domain: command model + topic/payload builders (pure functions).
 *
 * Topic contract: `<prefix>/cmnd/relay/<1|2|3>` with payload `"ON"` / `"OFF"`.
 * Only relay indices 1..3 are valid; anything else is rejected at build time.
 */

import { RELAY_INDICES } from '@core/constants';
import { Errors, err, ok, type AppError, type Result } from '@core/errors';

/** Relay indices supported by the hardware contract. */
export type RelayIndex = (typeof RELAY_INDICES)[number];

/** Relay on/off state. */
export type RelayState = 'ON' | 'OFF';

/** A relay command ready to publish. */
export interface RelayCommand {
  readonly index: RelayIndex;
  readonly state: RelayState;
}

/** Guard: true when `value` is a supported relay index. */
export function isRelayIndex(value: number): value is RelayIndex {
  return (RELAY_INDICES as readonly number[]).includes(value);
}

/** Guard: true when `value` is a valid relay state string. */
export function isRelayState(value: string): value is RelayState {
  return value === 'ON' || value === 'OFF';
}

/**
 * Build a validated relay command.
 *
 * @param index - relay index; must be 1, 2 or 3.
 * @param state - `'ON'` or `'OFF'`.
 * @returns `ok(command)` or `err` with code `validation` when the index or
 *   state is outside the contract.
 */
export function buildRelayCommand(
  index: number,
  state: string,
): Result<RelayCommand> {
  if (!isRelayIndex(index)) {
    return err(
      Errors.validation(
        `Relay index must be one of ${RELAY_INDICES.join(', ')} (got ${index})`,
      ),
    );
  }
  if (!isRelayState(state)) {
    return err(
      Errors.validation(`Relay state must be "ON" or "OFF" (got "${state}")`),
    );
  }
  return ok({ index, state });
}

/**
 * Build an MQTT topic for a relay, validating the index first.
 *
 * @param prefix - configured topic prefix (e.g. `home`).
 * @param index - relay index; must be 1, 2 or 3.
 * @param branch - `'cmnd'` for command topics, `'stat'` for feedback topics.
 * @returns `ok(topic)` e.g. `home/cmnd/relay/2` / `home/stat/relay/2`, or
 *   `err` with code `validation` when the index is outside the contract.
 */
function buildRelayTopic(
  prefix: string,
  index: number,
  branch: 'cmnd' | 'stat',
): Result<string, AppError> {
  if (!isRelayIndex(index)) {
    return err(
      Errors.validation(
        `Relay index must be one of ${RELAY_INDICES.join(', ')} (got ${index})`,
      ),
    );
  }
  return ok(`${prefix}/${branch}/relay/${index}`);
}

/**
 * Build the MQTT topic for a relay command.
 *
 * @param prefix - configured topic prefix (e.g. `home`).
 * @param index - relay index; must be 1, 2 or 3.
 * @returns `ok(topic)` e.g. `home/cmnd/relay/2`, or `err` with code
 *   `validation` when the index is outside the contract.
 */
export function buildRelayCommandTopic(
  prefix: string,
  index: number,
): Result<string, AppError> {
  return buildRelayTopic(prefix, index, 'cmnd');
}

/**
 * Build the MQTT topic for relay state feedback.
 *
 * @param prefix - configured topic prefix (e.g. `home`).
 * @param index - relay index; must be 1, 2 or 3.
 * @returns `ok(topic)` e.g. `home/stat/relay/2`, or `err` with code
 *   `validation` when the index is outside the contract.
 */
export function buildRelayFeedbackTopic(
  prefix: string,
  index: number,
): Result<string, AppError> {
  return buildRelayTopic(prefix, index, 'stat');
}

/** Parse a feedback payload (`"ON"` / `"OFF"`) safely. */
export function parseRelayStatePayload(raw: string): Result<RelayState> {
  const trimmed = raw.trim().toUpperCase();
  if (isRelayState(trimmed)) {
    return ok(trimmed);
  }
  return err(
    Errors.validation(`Relay feedback must be "ON" or "OFF" (got "${raw}")`),
  );
}
