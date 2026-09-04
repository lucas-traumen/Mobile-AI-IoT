/**
 * Relay domain: address/command model + topic/payload builders (pure).
 *
 * Room-scoped topic contract (settings-information-architecture plan,
 * supersedes the legacy global `<prefix>/cmnd/relay/<n>` topics):
 *
 * - command:  `<prefix>/room/<roomId>/cmnd/relay/<1..10>`
 * - feedback: `<prefix>/room/<roomId>/stat/relay/<1..10>`
 *
 * The relay identity is the {@link RelayAddress} value object
 * `{ roomId, index }`: the same slot number can be used independently in
 * different rooms, and every layer (devices → command interface → MQTT
 * topics → events → runtime store) carries the room explicitly — the room
 * is never inferred from UI state. Out-of-contract slots (0, 11, …) and
 * malformed rooms are rejected at build/parse time.
 */

import { RELAY_INDICES } from '@core/constants';
import { Errors, err, ok, type AppError, type Result } from '@core/errors';

/** Relay slots supported by the hardware contract (1..10). */
export type RelayIndex = (typeof RELAY_INDICES)[number];

/** Relay on/off state. */
export type RelayState = 'ON' | 'OFF';

/**
 * Room-scoped relay address — the relay identity value object carried
 * through devices, commands, topics, events and the runtime store.
 */
export interface RelayAddress {
  readonly roomId: string;
  readonly index: RelayIndex;
}

/** A relay command ready to publish. */
export interface RelayCommand {
  readonly roomId: string;
  readonly index: RelayIndex;
  readonly state: RelayState;
}

/** Guard: true when `value` is a supported relay slot (1..10). */
export function isRelayIndex(value: number): value is RelayIndex {
  return (RELAY_INDICES as readonly number[]).includes(value);
}

/** Guard: true when `value` is a valid relay state string. */
export function isRelayState(value: string): value is RelayState {
  return value === 'ON' || value === 'OFF';
}

/**
 * Guard: true when `roomId` is topic-safe — non-empty and free of MQTT
 * wildcard (`+`, `#`) and separator (`/`) characters.
 */
export function isRelayRoomId(roomId: string): boolean {
  return roomId.length > 0 && !/[/+#]/.test(roomId);
}

/**
 * Build a validated room-scoped relay address.
 *
 * @param roomId - id of the room owning the slot (topic-safe, non-empty).
 * @param index - relay slot; must be 1..10.
 * @returns `ok(address)` or `err` with code `validation` when the room or
 *   slot is outside the contract.
 */
export function buildRelayAddress(
  roomId: string,
  index: number,
): Result<RelayAddress> {
  if (!isRelayRoomId(roomId)) {
    return err(
      Errors.validation(
        `Relay roomId must be non-empty and free of "/", "+" and "#" (got "${roomId}")`,
      ),
    );
  }
  if (!isRelayIndex(index)) {
    return err(
      Errors.validation(
        `Relay index must be one of ${RELAY_INDICES.join(', ')} (got ${index})`,
      ),
    );
  }
  return ok({ roomId, index });
}

/**
 * Build a validated relay command.
 *
 * @param roomId - id of the room owning the slot.
 * @param index - relay slot; must be 1..10.
 * @param state - `'ON'` or `'OFF'`.
 * @returns `ok(command)` or `err` with code `validation`.
 */
export function buildRelayCommand(
  roomId: string,
  index: number,
  state: string,
): Result<RelayCommand> {
  const address = buildRelayAddress(roomId, index);
  if (!address.ok) {
    return address;
  }
  if (!isRelayState(state)) {
    return err(
      Errors.validation(`Relay state must be "ON" or "OFF" (got "${state}")`),
    );
  }
  return ok({ roomId, index: address.value.index, state });
}

/**
 * Build an MQTT topic for a room-scoped relay, validating the address first.
 *
 * @param prefix - configured topic prefix (e.g. `home`).
 * @param address - room-scoped relay identity.
 * @param branch - `'cmnd'` for command topics, `'stat'` for feedback topics.
 * @returns `ok(topic)` e.g. `home/room/kitchen/cmnd/relay/2`, or `err` with
 *   code `validation` when the address is outside the contract.
 */
function buildRelayTopic(
  prefix: string,
  address: RelayAddress,
  branch: 'cmnd' | 'stat',
): Result<string, AppError> {
  if (!prefix) {
    return err(Errors.validation('Relay topic prefix must be non-empty'));
  }
  const validated = buildRelayAddress(address.roomId, address.index);
  if (!validated.ok) {
    return validated;
  }
  return ok(
    `${prefix}/room/${validated.value.roomId}/${branch}/relay/${validated.value.index}`,
  );
}

/**
 * Build the MQTT topic for a relay command.
 *
 * @returns `ok(topic)` e.g. `home/room/kitchen/cmnd/relay/2`, or `err` with
 *   code `validation` when the address is outside the contract.
 */
export function buildRelayCommandTopic(
  prefix: string,
  address: RelayAddress,
): Result<string, AppError> {
  return buildRelayTopic(prefix, address, 'cmnd');
}

/**
 * Build the MQTT topic for relay state feedback.
 *
 * @returns `ok(topic)` e.g. `home/room/kitchen/stat/relay/2`, or `err` with
 *   code `validation` when the address is outside the contract.
 */
export function buildRelayFeedbackTopic(
  prefix: string,
  address: RelayAddress,
): Result<string, AppError> {
  return buildRelayTopic(prefix, address, 'stat');
}

/**
 * The feedback subscription topic for ALL room-scoped relay slots:
 * `<prefix>/room/+/stat/relay/+`. The `+` wildcards match exactly one level
 * each, so every `{roomId, slot}` feedback topic matches while foreign
 * structures (e.g. `.../stat/relay/2/extra`) do not.
 */
export function relayFeedbackSubscriptionTopic(prefix: string): string {
  return `${prefix}/room/+/stat/relay/+`;
}

/**
 * Parse a feedback topic into its room-scoped address.
 *
 * The configured prefix is regex-escaped, so feedback from another
 * device/prefix on the same broker is rejected. The room segment must be
 * non-empty and wildcard-free; the slot must be 1..10.
 *
 * @param topic - the received MQTT topic.
 * @param prefix - the configured topic prefix (e.g. `home`).
 * @returns `ok({roomId, index})` or `err` with code `validation`.
 */
export function parseRelayFeedbackTopic(
  topic: string,
  prefix: string,
): Result<RelayAddress> {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^${escaped}\\/room\\/([^/+#]+)\\/stat\\/relay\\/(\\d+)$`,
  );
  const match = topic.match(re);
  if (!match) {
    return err(
      Errors.validation(
        `Topic does not match the relay feedback contract (${prefix}/room/<roomId>/stat/relay/<1..10>): "${topic}"`,
      ),
    );
  }
  return buildRelayAddress(match[1] ?? '', Number(match[2]));
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
