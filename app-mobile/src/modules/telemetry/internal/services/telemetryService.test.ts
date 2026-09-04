/**
 * TelemetryServiceImpl unit tests (approved room-sensor contract).
 *
 * Verifies:
 * - start subscribes the room/field wildcard `<prefix>/room/+/sensor/+`.
 * - a numeric message on a valid room/field topic → typed event + store.
 * - invalid topics (wrong prefix/shape/wildcards) and non-numeric payloads
 *   are dropped (store unchanged, no crash).
 * - stop → start → handlers still active (B1 regression guard).
 */

import type { SensorTelemetry } from '@modules/telemetry/api';
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

  it('subscribes the room-scoped sensor wildcard on start', async () => {
    service.start();
    // The subscription is attached after the connect promise resolves.
    await Promise.resolve();
    expect(client.subscribedTopics).toEqual(['home/room/+/sensor/+']);
  });

  it('emits a typed room/field reading for a valid numeric message', () => {
    service.start();
    const received: SensorTelemetry[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/room/room-living/sensor/temperature',
      payload: '25.6',
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      roomId: 'room-living',
      field: 'temperature',
      value: 25.6,
    });
    expect(store.getState().latest).toEqual({
      roomId: 'room-living',
      field: 'temperature',
      value: 25.6,
    });
    expect(store.getState().messageCount).toBe(1);
  });

  it('drops invalid topics without crashing or updating the store', () => {
    service.start();
    const received: SensorTelemetry[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/tele/sensor', // retired legacy global topic
      payload: '25',
    });
    client.emitMessage({
      topic: 'other/room/r1/sensor/temperature', // wrong prefix
      payload: '25',
    });
    client.emitMessage({
      topic: 'home/room/r1/sensor', // malformed
      payload: '25',
    });
    client.emitMessage({
      topic: 'home/room/+/sensor/temperature', // wildcard-like segment
      payload: '25',
    });
    client.emitMessage({
      topic: 'home/room/r1/sensor/', // empty field
      payload: '25',
    });

    expect(received).toHaveLength(0);
    expect(store.getState().latest).toBeNull();
    expect(store.getState().messageCount).toBe(0);
  });

  it('drops non-numeric payloads without crashing or updating the store', () => {
    service.start();
    const received: SensorTelemetry[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/room/room-living/sensor/temperature',
      payload: 'garbage',
    });
    client.emitMessage({
      topic: 'home/room/room-living/sensor/temperature',
      payload: '',
    });
    client.emitMessage({
      topic: 'home/room/room-living/sensor/temperature',
      payload: 'Infinity',
    });

    expect(received).toHaveLength(0);
    expect(store.getState().latest).toBeNull();
    expect(store.getState().messageCount).toBe(0);
  });

  it('keeps handlers active across stop/start cycles (B1)', () => {
    service.start();
    const received: SensorTelemetry[] = [];
    bus.subscribe('telemetry:received', p => received.push(p));

    client.emitMessage({
      topic: 'home/room/r1/sensor/temperature',
      payload: '1',
    });
    expect(received).toHaveLength(1);

    service.stop();
    service.start();

    // After stop+start the fake client has been re-connected; handlers
    // registered once in the constructor must still fire.
    client.emitMessage({
      topic: 'home/room/r2/sensor/humidity',
      payload: '2',
    });
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual({ roomId: 'r2', field: 'humidity', value: 2 });
    expect(store.getState().latest).toEqual({
      roomId: 'r2',
      field: 'humidity',
      value: 2,
    });
  });
});
