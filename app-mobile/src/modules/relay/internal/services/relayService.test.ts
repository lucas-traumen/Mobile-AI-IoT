/**
 * RelayServiceImpl unit tests — room-scoped protocol.
 *
 * Verifies:
 * - commands publish to `<prefix>/room/<roomId>/cmnd/relay/<1..10>` with an
 *   optimistic store update + `relay:command` event carrying `{roomId, index}`;
 * - publish failure rejects without optimistic state (M3);
 * - feedback parses `<prefix>/room/<roomId>/stat/relay/<n>` into the
 *   room-scoped address; wrong prefix, malformed structures and slots
 *   0/11 are ignored; prefix metacharacters are escaped (M2);
 * - the feedback subscription is a single wildcard covering every room/slot;
 * - equal slots in two rooms stay isolated end-to-end.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { err, Errors, ok, type Result } from '@core/errors';
import { createLogger } from '@core/logger';

import type {
  MqttClientPort,
  MqttConnectionConfig,
  MqttConnectionState,
  MqttMessage,
} from '@modules/telemetry/api';
import {
  createRelayStore,
  relayPendingOf,
  relayStateOf,
} from '../data/relayStore';
import type { RelayAddress } from '../domain/commands';
import { RelayServiceImpl } from './relayService';

const LIVING: RelayAddress = { roomId: 'room-living', index: 1 };
const BEDROOM: RelayAddress = { roomId: 'room-bedroom', index: 1 };

class FakeMqttClient implements MqttClientPort {
  public subscribedTopics: string[] = [];
  public published: { topic: string; payload: string }[] = [];
  public publishResult = ok(undefined) as Result<void>;

  async connect(_config: MqttConnectionConfig): Promise<void> {}
  subscribe(topic: string): void {
    this.subscribedTopics.push(topic);
  }
  publish(topic: string, payload: string): Result<void> {
    this.published.push({ topic, payload });
    return this.publishResult;
  }
  disconnect(): void {}
  onMessage(_handler: (message: MqttMessage) => void): void {}
  onStateChange(_handler: (state: MqttConnectionState) => void): void {}
}

function makeService(options?: { prefix?: string; client?: FakeMqttClient }): {
  bus: InMemoryEventBus;
  client: FakeMqttClient;
  store: ReturnType<typeof createRelayStore>;
  service: RelayServiceImpl;
} {
  const bus = new InMemoryEventBus(createLogger('test'));
  const client = options?.client ?? new FakeMqttClient();
  const store = createRelayStore();
  const service = new RelayServiceImpl({
    client,
    bus,
    logger: createLogger('test'),
    store,
    prefix: options?.prefix ?? 'home',
  });
  return { bus, client, store, service };
}

describe('RelayServiceImpl.setRelay (room-scoped)', () => {
  it('publishes to `<prefix>/room/<roomId>/cmnd/relay/<n>` and applies optimistic state', () => {
    const { bus, client, store, service } = makeService();
    const commands: unknown[] = [];
    bus.subscribe('relay:command', c => commands.push(c));

    const result = service.setRelay(LIVING, 'ON');

    expect(result.ok).toBe(true);
    expect(client.published).toEqual([
      { topic: 'home/room/room-living/cmnd/relay/1', payload: 'ON' },
    ]);
    expect(relayStateOf(store.getState().states, LIVING)).toBe('ON');
    expect(relayPendingOf(store.getState().pending, LIVING)).toBe(true);
    expect(commands).toEqual([
      { roomId: 'room-living', index: 1, state: 'ON' },
    ]);
  });

  it('accepts slots up to 10', () => {
    const { client, service } = makeService();
    expect(service.setRelay({ roomId: 'room-a', index: 10 }, 'ON').ok).toBe(
      true,
    );
    expect(client.published[0]?.topic).toBe('home/room/room-a/cmnd/relay/10');
  });

  it('rejects slots 0/11 and malformed rooms without publishing', () => {
    const { client, service } = makeService();
    expect(service.setRelay({ roomId: 'room-a', index: 0 as 1 }, 'ON').ok).toBe(
      false,
    );
    expect(
      service.setRelay({ roomId: 'room-a', index: 11 as 1 }, 'ON').ok,
    ).toBe(false);
    expect(service.setRelay({ roomId: '', index: 1 }, 'ON').ok).toBe(false);
    expect(service.setRelay({ roomId: 'a/b', index: 1 }, 'ON').ok).toBe(false);
    expect(service.setRelay(LIVING, 'TOGGLE').ok).toBe(false);
    expect(client.published).toEqual([]);
  });

  it('isolates equal slots in different rooms (no aliasing)', () => {
    const { store, service } = makeService();
    expect(service.setRelay(LIVING, 'ON').ok).toBe(true);
    expect(service.setRelay(BEDROOM, 'OFF').ok).toBe(true);

    expect(relayStateOf(store.getState().states, LIVING)).toBe('ON');
    expect(relayStateOf(store.getState().states, BEDROOM)).toBe('OFF');
  });

  it('rejects the command without changing state when publish fails (M3)', () => {
    const failedClient = new FakeMqttClient();
    failedClient.publishResult = err(
      Errors.network('MQTT client is not connected'),
    );
    const { store, service } = makeService({ client: failedClient });

    const result = service.setRelay(LIVING, 'ON');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
    // No optimistic state, no stuck pending flag.
    expect(relayStateOf(store.getState().states, LIVING)).toBe('OFF');
    expect(relayPendingOf(store.getState().pending, LIVING)).toBe(false);
  });
});

describe('RelayServiceImpl.handleFeedbackMessage (room-scoped)', () => {
  it('emits the room-scoped feedback for a matching topic', () => {
    const { bus, service } = makeService();
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    const matched = service.handleFeedbackMessage({
      topic: 'home/room/room-bedroom/stat/relay/2',
      payload: 'ON',
    });

    expect(matched).toBe(true);
    expect(feedbacks).toEqual([
      { roomId: 'room-bedroom', index: 2, state: 'ON' },
    ]);
  });

  it('matches the configured (non-default) prefix (M2)', () => {
    const { bus, service } = makeService({ prefix: 'factory/house-a' });
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'factory/house-a/room/r1/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(true);
    expect(feedbacks).toEqual([{ roomId: 'r1', index: 1, state: 'ON' }]);
  });

  it('escapes regex metacharacters in the configured prefix', () => {
    const { service } = makeService({ prefix: 'a.b' });
    expect(
      service.handleFeedbackMessage({
        topic: 'aXb/room/r1/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'a.b/room/r1/stat/relay/1',
        payload: 'ON',
      }),
    ).toBe(true);
  });

  it('ignores wrong prefixes and foreign topic structures', () => {
    const { bus, service } = makeService();
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      service.handleFeedbackMessage({
        topic: 'office/room/r1/stat/relay/1',
        payload: 'OFF',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/cmnd/relay/1',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/stat/relay/1/extra',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(feedbacks).toHaveLength(0);
  });

  it('ignores relay slots outside 1..10', () => {
    const { bus, service } = makeService();
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/stat/relay/0',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/stat/relay/11',
        payload: 'ON',
      }),
    ).toBe(false);
    expect(feedbacks).toHaveLength(0);
  });

  it('confirms optimistic state for exactly the addressed room+slot', () => {
    const { store, service } = makeService();
    expect(service.setRelay(LIVING, 'ON').ok).toBe(true);
    expect(service.setRelay(BEDROOM, 'ON').ok).toBe(true);

    // Only the living-room slot gets feedback confirmation.
    service.handleFeedbackMessage({
      topic: 'home/room/room-living/stat/relay/1',
      payload: 'OFF',
    });

    expect(relayStateOf(store.getState().states, LIVING)).toBe('OFF');
    expect(relayPendingOf(store.getState().pending, LIVING)).toBe(false);
    expect(relayStateOf(store.getState().states, BEDROOM)).toBe('ON');
    expect(relayPendingOf(store.getState().pending, BEDROOM)).toBe(true);
  });

  it('ignores invalid feedback payloads on a matching topic', () => {
    const { bus, service } = makeService();
    const feedbacks: unknown[] = [];
    bus.subscribe('relay:feedback', f => feedbacks.push(f));

    expect(
      service.handleFeedbackMessage({
        topic: 'home/room/r1/stat/relay/1',
        payload: 'MAYBE',
      }),
    ).toBe(true);
    expect(feedbacks).toHaveLength(0);
  });
});

describe('RelayServiceImpl feedback subscription', () => {
  it('subscribes the single room+slot wildcard for the configured prefix', () => {
    const { client, service } = makeService({ prefix: 'factory/house-a' });

    service.startFeedbackListener();

    expect(client.subscribedTopics).toEqual([
      'factory/house-a/room/+/stat/relay/+',
    ]);
  });

  it('re-subscribes the wildcard with the new prefix on applyPrefix', () => {
    const { client, service } = makeService({ prefix: 'home' });
    service.applyPrefix('office');

    expect(client.subscribedTopics).toEqual(['office/room/+/stat/relay/+']);
  });
});
