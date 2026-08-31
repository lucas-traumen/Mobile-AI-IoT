/**
 * RelayServiceImpl unit tests.
 *
 * Verifies:
 * - handleFeedbackMessage applies correct state for configured prefix.
 * - wrong prefix is ignored (M2).
 * - index outside 1..3 is ignored.
 */

import type { EventBus } from '@core/eventbus';
import { InMemoryEventBus } from '@core/eventbus';
import { err, Errors, ok, type Result } from '@core/errors';
import { createLogger } from '@core/logger';

import type {
  MqttClientPort,
  MqttConnectionConfig,
  MqttConnectionState,
  MqttMessage,
} from '@modules/telemetry/api';
import { createRelayStore, type RelayStore } from '../data/relayStore';
import { RelayServiceImpl } from './relayService';

class FakeMqttClient implements MqttClientPort {
  public subscribedTopics: string[] = [];
  public publishResult = ok(undefined) as Result<void>;

  async connect(_config: MqttConnectionConfig): Promise<void> {}
  subscribe(topic: string): void {
    this.subscribedTopics.push(topic);
  }
  publish(_topic: string, _payload: string): Result<void> {
    return this.publishResult;
  }
  disconnect(): void {}
  onMessage(_handler: (message: MqttMessage) => void): void {}
  onStateChange(_handler: (state: MqttConnectionState) => void): void {}
}

describe('RelayServiceImpl.handleFeedbackMessage', () => {
  let bus: EventBus;
  let service: RelayServiceImpl;

  beforeEach(() => {
    bus = new InMemoryEventBus(createLogger('test'));
    const store = createRelayStore();
    service = new RelayServiceImpl({
      client: new FakeMqttClient(),
      bus,
      logger: createLogger('test'),
      store,
      prefix: 'home',
    });
  });

  it('applies feedback state when prefix matches', () => {
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    const matched = service.handleFeedbackMessage({
      topic: 'home/stat/relay/2',
      payload: 'ON',
    });

    expect(matched).toBe(true);
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0]).toEqual({ index: 2, state: 'ON' });
  });

  it('matches the configured (non-default) prefix (M2)', () => {
    const store = createRelayStore();
    const customService = new RelayServiceImpl({
      client: new FakeMqttClient(),
      bus,
      logger: createLogger('test'),
      store,
      prefix: 'factory/house-a',
    });
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      customService.handleFeedbackMessage({
        topic: 'home/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      customService.handleFeedbackMessage({
        topic: 'factory/house-a/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(true);
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0]).toEqual({ index: 1, state: 'ON' });
  });

  it('escapes regex metacharacters in the configured prefix', () => {
    const store = createRelayStore();
    const dotService = new RelayServiceImpl({
      client: new FakeMqttClient(),
      bus,
      logger: createLogger('test'),
      store,
      prefix: 'a.b',
    });
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      dotService.handleFeedbackMessage({
        topic: 'aXb/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      dotService.handleFeedbackMessage({
        topic: 'a.b/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(true);
  });

  it('ignores feedback with a different prefix (M2)', () => {
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    const matched = service.handleFeedbackMessage({
      topic: 'office/stat/relay/1',
      payload: 'OFF',
    });

    expect(matched).toBe(false);
    expect(feedbacks).toHaveLength(0);
  });

  it('ignores relay indices outside 1..3', () => {
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      service.handleFeedbackMessage({
        topic: 'home/stat/relay/4',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'home/stat/relay/0',
        payload: 'OFF',
      }),
    ).toBe(false);
    expect(feedbacks).toHaveLength(0);
  });
});

describe('RelayServiceImpl.setRelay', () => {
  it('rejects the command without changing state when publish fails (M3)', () => {
    const failedClient = new FakeMqttClient();
    failedClient.publishResult = err(
      Errors.network('MQTT client is not connected'),
    );
    const store: RelayStore = createRelayStore();
    const service = new RelayServiceImpl({
      client: failedClient,
      bus: new InMemoryEventBus(createLogger('test')),
      logger: createLogger('test'),
      store,
      prefix: 'home',
    });

    const result = service.setRelay(1, 'ON');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
    // No optimistic state, no stuck pending flag.
    const state = store.getState();
    expect(state.states[1]).toBe('OFF');
    expect(state.pending[1]).toBe(false);
  });

  it('applies optimistic state and emits relay:command on success', () => {
    const client = new FakeMqttClient();
    const store: RelayStore = createRelayStore();
    const bus = new InMemoryEventBus(createLogger('test'));
    const service = new RelayServiceImpl({
      client,
      bus,
      logger: createLogger('test'),
      store,
      prefix: 'home',
    });
    const commands: unknown[] = [];
    bus.subscribe('relay:command', c => commands.push(c));

    const result = service.setRelay(2, 'ON');

    expect(result.ok).toBe(true);
    expect(client.subscribedTopics).toEqual([]); // only feedback topics
    expect(store.getState().states[2]).toBe('ON');
    expect(store.getState().pending[2]).toBe(true);
    expect(commands).toEqual([{ index: 2, state: 'ON' }]);
  });

  it('subscribes feedback topics with the configured prefix (M2)', () => {
    const client = new FakeMqttClient();
    const service = new RelayServiceImpl({
      client,
      bus: new InMemoryEventBus(createLogger('test')),
      logger: createLogger('test'),
      store: createRelayStore(),
      prefix: 'factory/house-a',
    });

    service.startFeedbackListener();

    expect(client.subscribedTopics).toEqual([
      'factory/house-a/stat/relay/1',
      'factory/house-a/stat/relay/2',
      'factory/house-a/stat/relay/3',
    ]);
  });
});
