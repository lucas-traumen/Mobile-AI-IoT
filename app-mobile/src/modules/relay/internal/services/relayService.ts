/**
 * Relay service implementation: validates commands, publishes over MQTT,
 * tracks optimistic state and listens for device feedback.
 *
 * Room-scoped protocol: commands publish to
 * `<prefix>/room/<roomId>/cmnd/relay/<1..10>` and feedback arrives on
 * `<prefix>/room/<roomId>/stat/relay/<1..10>`. A single wildcard feedback
 * subscription (`<prefix>/room/+/stat/relay/+`) covers every room and slot,
 * so no re-subscription is needed when rooms/devices change — only when the
 * prefix changes ({@link applyPrefix}).
 */

import type { EventBus } from '@core/eventbus';
import { ok, type AppError, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { MqttClientPort } from '@modules/telemetry/api';
import {
  buildRelayCommand,
  buildRelayCommandTopic,
  parseRelayFeedbackTopic,
  parseRelayStatePayload,
  relayFeedbackSubscriptionTopic,
  type RelayAddress,
} from '../domain/commands';
import type { RelayStore } from '../data/relayStore';
import type { RelayService } from '../../api';

/**
 * Default {@link RelayService} implementation.
 *
 * Publishes validated commands over MQTT, applies optimistic state to the
 * store, and confirms states when device feedback arrives on
 * `<prefix>/room/<roomId>/stat/relay/<n>`.
 */
export class RelayServiceImpl implements RelayService {
  private readonly client: MqttClientPort;
  private readonly bus: EventBus;
  private readonly logger: Logger;
  private readonly store: RelayStore;
  private prefix: string;

  constructor(options: {
    client: MqttClientPort;
    bus: EventBus;
    logger: Logger;
    store: RelayStore;
    prefix: string;
  }) {
    this.client = options.client;
    this.bus = options.bus;
    this.logger = options.logger;
    this.store = options.store;
    this.prefix = options.prefix;
    // Attach the feedback subscription once (constructor) so repeated
    // startFeedbackListener calls (settings changes) never stack handlers
    // (B1: handler retention must not dead-leak on every settings save).
    this.bus.subscribe('relay:feedback', feedback => {
      this.store.getState().confirm(feedback, feedback.state);
    });
  }

  /** Update the topic prefix and re-subscribe the feedback wildcard (B1/M2). */
  applyPrefix(prefix: string): void {
    this.prefix = prefix;
    // Re-subscribe with the new prefix; old subscriptions remain active on
    // the broker until disconnect but will no longer match handleFeedbackMessage.
    this.client.subscribe(relayFeedbackSubscriptionTopic(this.prefix));
  }

  /** Publish a validated relay command and update the store optimistically. */
  setRelay(address: RelayAddress, state: string): Result<void, AppError> {
    const command = buildRelayCommand(address.roomId, address.index, state);
    if (!command.ok) {
      return command;
    }
    const topic = buildRelayCommandTopic(this.prefix, {
      roomId: command.value.roomId,
      index: command.value.index,
    });
    if (!topic.ok) {
      return topic;
    }
    const published = this.client.publish(topic.value, command.value.state);
    if (!published.ok) {
      // M3: do not apply optimistic state when the publish was rejected
      // (e.g. client disconnected). The store keeps its previous state and
      // pending stays false — no stuck optimistic state. Surface the failure
      // to the caller so the UI can show the error.
      this.logger.warn(
        `Relay room/${command.value.roomId} slot ${command.value.index} → ${command.value.state} rejected: ${published.error.message}`,
      );
      return published;
    }
    this.store
      .getState()
      .setOptimistic(
        { roomId: command.value.roomId, index: command.value.index },
        command.value.state,
      );
    this.bus.emit('relay:command', {
      roomId: command.value.roomId,
      index: command.value.index,
      state: command.value.state,
    });
    this.logger.info(
      `Relay room/${command.value.roomId} slot ${command.value.index} → ${command.value.state}`,
    );
    return ok(undefined);
  }

  /**
   * Subscribe to the feedback MQTT wildcard topic and confirm optimistic
   * states on `relay:feedback` events. The bus subscription itself is
   * attached once in the constructor; this method only (re)subscribes the
   * MQTT topics so it is safe to call repeatedly (e.g. after every settings
   * change / reconnect).
   */
  startFeedbackListener(): void {
    this.client.subscribe(relayFeedbackSubscriptionTopic(this.prefix));
  }

  /**
   * Handle an MQTT message that may be relay feedback
   * (`<prefix>/room/<roomId>/stat/relay/<n>`). Returns true when the message
   * matched.
   *
   * The topic is matched against the *configured* prefix (regex-escaped, M2)
   * and parsed into the room-scoped address, so feedback from another
   * device/prefix on the same broker is ignored and equal slots in different
   * rooms stay isolated.
   */
  handleFeedbackMessage(message: { topic: string; payload: string }): boolean {
    const address = parseRelayFeedbackTopic(message.topic, this.prefix);
    if (!address.ok) {
      return false;
    }
    const state = parseRelayStatePayload(message.payload);
    if (!state.ok) {
      this.logger.warn(`Relay: ignoring invalid feedback "${message.payload}"`);
      return true;
    }
    this.bus.emit('relay:feedback', {
      roomId: address.value.roomId,
      index: address.value.index,
      state: state.value,
    });
    return true;
  }
}
