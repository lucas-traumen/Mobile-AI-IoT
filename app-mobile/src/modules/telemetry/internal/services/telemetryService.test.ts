/**
 * TelemetryServiceImpl unit tests.
 *
 * Verifies:
 * - start → valid message → store updates + event emitted.
 * - invalid payload → dropped (store unchanged, no crash).
 * - stop → start → handlers still active (B1 regression guard).
 */

import type { EventBus } from '@core/eventbus';
import { InMemoryEventBus } from '@core/eventbus';
import { ok, type Result } from '@core/errors';
import { createLogger } from '@core/logger';

import type {
  MqttClientPort,
  MqttConnectionConfig,
  MqttConnectionState,
  MqttMessage,
} from '../data/mqttClientPort';
import { createTelemetryStore } from '../data/telemetryStore';
import { TelemetryServiceImpl } from './telemetryService';

class FakeMqttClient implements MqttClientPort {
  private messageHandlers: ((m: MqttMessage) => void)[] = [];
  private stateHandlers: ((s: MqttConnectionState) => void)[] = [];
  public subscribedTopics: string[] = [];
  public connected = false;
  public connectCalls = 0;
  public disconnectCalls = 0;

  async connect(_config: MqttConnectionConfig): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
    for (const h of this.stateHandlers) {
      h('connected');
    }
  }

  subscribe(topic: string): void {
    this.subscribedTopics.push(topic);
  }

  publish(_topic: string, _payload: string): Result<void> {
    return ok(undefined);
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connected = false;
    for (const h of this.stateHandlers) {
      h('idle');
    }
  }

  onMessage(handler: (message: MqttMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onStateChange(handler: (state: MqttConnectionState) => void): void {
    this.stateHandlers.push(handler);
  }

  /** Test helper: simulate an incoming MQTT message. */
  emitMessage(message: MqttMessage): void {
    for (const h of this.messageHandlers) {
      h(message);
    }
  }
}

const CONFIG: MqttConnectionConfig = {
  host: 'broker.local',
  port: 9001,
  prefix: 'home',
};

describe('TelemetryServiceImpl', () => {
  let client: FakeMqttClient;
  let bus: EventBus;
  let store: ReturnType<typeof createTelemetryStore>;
  let service: TelemetryServiceImpl;

  beforeEach(() => {
    client = new FakeMqttClient();
    bus = new InMemoryEventBus(createLogger('test'));
    store = createTelemetryStore();
    service = new TelemetryServiceImpl({
      client,
      bus,
      logger: createLogger('test'),
      store,
      config: CONFIG,
    });
  });

  it('updates the store when a valid telemetry message arrives', () => {
    service.start();
    const received: unknown[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/tele/sensor',
      payload: JSON.stringify({ temperature: 22.5, humidity: 55 }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ temperature: 22.5, humidity: 55 });
    // The store must reflect the validated reading (store update requirement).
    expect(store.getState().latest).toEqual({
      temperature: 22.5,
      humidity: 55,
    });
    expect(store.getState().messageCount).toBe(1);
  });

  it('drops invalid payloads without crashing or updating the store', () => {
    service.start();
    const received: unknown[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/tele/sensor',
      payload: '{"temperature": "not-a-number"}',
    });
    client.emitMessage({ topic: 'home/tele/sensor', payload: 'garbage' });

    expect(received).toHaveLength(0);
    expect(store.getState().latest).toBeNull();
    expect(store.getState().messageCount).toBe(0);
  });

  it('keeps handlers active across stop/start cycles (B1)', () => {
    service.start();
    const received: unknown[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/tele/sensor',
      payload: JSON.stringify({ temperature: 1, humidity: 1 }),
    });
    expect(received).toHaveLength(1);

    service.stop();
    service.start();

    // After stop+start the fake client has been re-connected; handlers
    // registered once in the constructor must still fire.
    client.emitMessage({
      topic: 'home/tele/sensor',
      payload: JSON.stringify({ temperature: 2, humidity: 2 }),
    });
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual({ temperature: 2, humidity: 2 });
    expect(store.getState().latest).toEqual({ temperature: 2, humidity: 2 });
  });
});
