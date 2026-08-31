/**
 * Telemetry service implementation: connects the MQTT client, validates
 * incoming payloads, updates the store and broadcasts on the event bus.
 */

import type { EventBus } from '@core/eventbus';
import type { ConnectionState } from '@core/events';
import type { Logger } from '@core/logger';
import { telemetryTopic } from '@core/topics';

import type {
  MqttClientPort,
  MqttConnectionConfig,
} from '../data/mqttClientPort';
import type { TelemetryStore } from '../data/telemetryStore';
import { parseTelemetryPayload } from '../domain/payloads';
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
   * Connect to the broker and subscribe to `<prefix>/tele/sensor`.
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
      this.client.subscribe(telemetryTopic(this.config.prefix));
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
      const result = parseTelemetryPayload(message.payload);
      if (!result.ok) {
        this.logger.warn(
          `Telemetry: dropped invalid payload: ${result.error.message}`,
        );
        return;
      }
      this.store.getState().applyReading(result.value);
      this.bus.emit('telemetry:received', result.value);
    });

    this.client.onStateChange((state, errorCode) => {
      this.store.getState().setConnection(state as ConnectionState, errorCode);
      this.bus.emit('telemetry:connectionState', state as ConnectionState);
    });
  }
}
