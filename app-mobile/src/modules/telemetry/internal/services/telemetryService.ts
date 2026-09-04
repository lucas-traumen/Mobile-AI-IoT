/**
 * Telemetry service implementation: connects the MQTT client, validates
 * incoming payloads, updates the store and broadcasts on the event bus.
 */

import type { EventBus } from '@core/eventbus';
import type { ConnectionState } from '@core/events';
import type { Logger } from '@core/logger';
import { parseSensorTopic, sensorSubscriptionTopic } from '@core/topics';

import type {
  MqttClientPort,
  MqttConnectionConfig,
} from '../data/mqttClientPort';
import type { TelemetryStore } from '../data/telemetryStore';
import { parseSensorPayload } from '../domain/payloads';
import type { TelemetryService } from '../../api';

/**
 * Default {@link TelemetryService} implementation.
 *
 * Owns the MQTT client lifecycle for telemetry: {@link start} connects and
 * subscribes, incoming messages are validated (zod) and only valid readings
 * reach the store / event bus.
 *
 * Message/state handlers are attached once in the constructor. The client
 * port keeps registered handlers and subscriptions across `disconnect()`
 * (background teardown) and reconnects, so a stop/start cycle never loses
 * the telemetry pipeline.
 */
export class TelemetryServiceImpl implements TelemetryService {
  private readonly client: MqttClientPort;
  private readonly bus: EventBus;
  private readonly logger: Logger;
  private readonly store: TelemetryStore;
  private config: MqttConnectionConfig;
  private running = false;

  constructor(options: {
    client: MqttClientPort;
    bus: EventBus;
    logger: Logger;
    store: TelemetryStore;
    config: MqttConnectionConfig;
  }) {
    this.client = options.client;
    this.bus = options.bus;
    this.logger = options.logger;
    this.store = options.store;
    this.config = options.config;
    this.attachHandlers();
  }

  /**
   * Update the broker configuration and reconnect when running.
   * Called by the composition root on `settings:changed`.
   */
  applyConfig(config: MqttConnectionConfig): void {
    this.config = config;
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  /**
   * Connect to the broker and subscribe to `<prefix>/room/+/sensor/+`
   * (approved room-scoped per-field contract; exact dispatch happens in
   * `DeviceStateSync`).
   *
   * Idempotent: repeated calls while running are no-ops. When no host is
   * configured yet (fresh install before the user saves settings) the
   * connection is skipped with a warn log.
   */
  start(): void {
    if (this.running) {
      return;
    }
    if (!this.config.host) {
      this.logger.warn(
        'Telemetry: no broker host configured — configure settings first',
      );
      return;
    }
    this.running = true;
    void this.client.connect(this.config).then(() => {
      this.client.subscribe(sensorSubscriptionTopic(this.config.prefix));
    });
  }

  /** Disconnect and reset the connection state to idle. */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.client.disconnect();
    this.store.getState().setConnection('idle');
  }

  private attachHandlers(): void {
    this.client.onMessage(message => {
      // 1. Topic identity: parse + validate the exact `{roomId, field}`
      //    (wrong prefix, wrong shape, wildcard-like/empty segments → drop).
      const address = parseSensorTopic(message.topic, this.config.prefix);
      if (!address.ok) {
        this.logger.warn(
          `Telemetry: dropped invalid topic: ${address.error.message}`,
        );
        return;
      }
      // 2. Payload: one finite number.
      const value = parseSensorPayload(message.payload);
      if (!value.ok) {
        this.logger.warn(
          `Telemetry: dropped invalid payload: ${value.error.message}`,
        );
        return;
      }
      const reading = {
        roomId: address.value.roomId,
        field: address.value.field,
        value: value.value,
      };
      this.store.getState().applyReading(reading);
      this.bus.emit('telemetry:received', reading);
    });

    this.client.onStateChange((state, errorCode) => {
      this.store.getState().setConnection(state as ConnectionState, errorCode);
      this.bus.emit('telemetry:connectionState', state as ConnectionState);
    });
  }
}
