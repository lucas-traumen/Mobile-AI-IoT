/**
 * Relay module — public facade.
 *
 * The only entry point other modules may use. Everything else lives in
 * `internal/` and must not be imported across modules (enforced by
 * `eslint-plugin-boundaries`).
 */

import type { AppError, Result } from '@core/errors';

/** Relay domain types: index (1..3), ON/OFF state, command record. */
export type {
  RelayIndex,
  RelayState,
  RelayCommand,
} from '../internal/domain/commands';
/** Pure command/topic builders + guards + feedback payload parser (zod). */
export {
  buildRelayCommand,
  buildRelayCommandTopic,
  buildRelayFeedbackTopic,
  isRelayIndex,
  isRelayState,
  parseRelayStatePayload,
} from '../internal/domain/commands';
/** zustand ViewModel factory: per-relay optimistic state. */
export { createRelayStore } from '../internal/data/relayStore';
/** Store shape: states keyed by relay index. */
export type { RelayStates, RelayStore } from '../internal/data/relayStore';
/** Default {@link RelayService} implementation (publish + feedback handling). */
export { RelayServiceImpl } from '../internal/services/relayService';

/**
 * Relay service — publishes ON/OFF commands over MQTT and tracks feedback.
 */
export interface RelayService {
  /**
   * Publish a relay command (`<prefix>/cmnd/relay/<1|2|3>`).
   *
   * @param index - relay index (1..3); anything else is rejected.
   * @param state - `'ON'` or `'OFF'`.
   * @returns `ok` when the command was accepted for publishing; `err` with
   *   code `validation` for out-of-contract indices/states.
   */
  setRelay(index: number, state: string): Result<void, AppError>;
}
