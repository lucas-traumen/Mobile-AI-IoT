/**
 * Relay service implementation: validates commands, publishes over MQTT,
 * tracks optimistic state and listens for device feedback.
 */

import type { EventBus } from '@core/eventbus';
import { ok, type AppError, type Result } from '@core/errors';
import type { Logger } from '@core/logger';

import type { MqttClientPort } from '@modules/telemetry/api';
import {
  buildRelayCommand,
  buildRelayCommandTopic,
  buildRelayFeedbackTopic,
} from '../domain/commands';
import type { RelayStore } from '../data/relayStore';
import type { RelayService } from '../../api';

/**
 * Default {@link RelayService} implementation.
 *
 * Publishes validated commands over MQTT, applies optimistic state to the
 * store, and confirms states when device feedback arrives on
 * `<prefix>/stat/relay/<n>`.
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
      this.store.getState().confirm(feedback.index, feedback.state);
    });
  }

  /** Update the topic prefix and re-subscribe feedback topics (B1/M2). */
  applyPrefix(prefix: string): void {
    this.prefix = prefix;
    // Re-subscribe with the new prefix; old subscriptions remain active on
    // the broker until disconnect but will no longer match handleFeedbackMessage.
    for (const index of [1, 2, 3] as const) {
      const topic = buildRelayFeedbackTopic(this.prefix, index);
      if (topic.ok) {
        this.client.subscribe(topic.value);
      }
    }
  }

  /** Publish a validated relay command and update the store optimistically. */
  setRelay(index: number, state: string): Result<void, AppError> {
    const command = buildRelayCommand(index, state);
    if (!command.ok) {
      return command;
    }
    const topic = buildRelayCommandTopic(this.prefix, command.value.index);
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
        `Relay ${command.value.index} → ${command.value.state} rejected: ${published.error.message}`,
      );
      return published;
    }
    this.store
      .getState()
      .setOptimistic(command.value.index, command.value.state);
    this.bus.emit('relay:command', {
      index: command.value.index,
      state: command.value.state,
    });
    this.logger.info(`Relay ${command.value.index} → ${command.value.state}`);
    return ok(undefined);
  }

  /**
   * Subscribe to the feedback MQTT topics and confirm optimistic states on
   * `relay:feedback` events. The bus subscription itself is attached once in
   * the constructor; this method only (re)subscribes the MQTT topics so it is
   * safe to call repeatedly (e.g. after every settings change / reconnect).
   */
  startFeedbackListener(): void {
    for (const index of [1, 2, 3] as const) {
      const topic = buildRelayFeedbackTopic(this.prefix, index);
      if (topic.ok) {
        this.client.subscribe(topic.value);
      }
    }
  }

  /**
   * Handle an MQTT message that may be relay feedback
   * (`<prefix>/stat/relay/<n>`). Returns true when the message matched.
   *
   * M2: the topic is matched against the *configured* prefix, not a wildcard,
   * so feedback from another device/prefix on the same broker is ignored.
   */
  handleFeedbackMessage(message: { topic: string; payload: string }): boolean {
    const escaped = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}\\/stat\\/relay\\/([123])$`);
    const match = message.topic.match(re);
    if (!match) {
      return false;
    }
    const state = message.payload.trim().toUpperCase();
    if (state !== 'ON' && state !== 'OFF') {
      this.logger.warn(`Relay: ignoring invalid feedback "${message.payload}"`);
      return true;
    }
    this.bus.emit('relay:feedback', {
      index: Number(match[1]) as 1 | 2 | 3,
      state,
    });
    return true;
  }
}
