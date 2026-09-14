/**
 * BoardInventoryService tests (board-discovery-binding plan, acceptance 3f).
 *
 * Verifies: retained status messages (online/offline) create/update board
 * entries; telemetry/relay events feed `fields`/`relaySlots` and mark
 * data-only boards `seen`; malformed topics and invalid payloads are
 * skipped with a warn; the prefix change re-subscribes the wildcard; every
 * real change emits `board:changed` and pushes the mirror store.
 */

import { InMemoryEventBus } from '@core/eventbus';
import { ok, type Result } from '@core/errors';
import { createLogger } from '@core/logger';

import type {
  MqttClientPort,
  MqttConnectionConfig,
  MqttConnectionState,
  MqttMessage,
} from '@modules/telemetry/api';
import { createBoardStore } from '../ui/boardStore';
import { BoardInventoryService } from './boardInventoryService';

class FakeMqttClient implements MqttClientPort {
  public subscribedTopics: string[] = [];

  async connect(_config: MqttConnectionConfig): Promise<void> {}
  subscribe(topic: string): void {
    this.subscribedTopics.push(topic);
  }
  publish(_topic: string, _payload: string): Result<void> {
    return ok(undefined);
  }
  disconnect(): void {}
  onMessage(_handler: (message: MqttMessage) => void): void {}
  onStateChange(_handler: (state: MqttConnectionState) => void): void {}
}

function makeService(options?: { prefix?: string }) {
  const bus = new InMemoryEventBus(createLogger('test'));
  const client = new FakeMqttClient();
  const store = createBoardStore();
  const changes: string[] = [];
  bus.subscribe('board:changed', event => changes.push(event.code));
  const service = new BoardInventoryService({
    client,
    bus,
    logger: createLogger('test'),
    store,
    prefix: options?.prefix ?? 'home',
  });
  return { bus, client, store, changes, service };
}

const statusMessage = (
  code: string,
  payload: string,
): { topic: string; payload: string } => ({
  topic: `home/room/${code}/status`,
  payload,
});

describe('BoardInventoryService — status messages (retained)', () => {
  it('records an online board from an object status payload', () => {
    const { store, changes, service } = makeService();
    const matched = service.handleStatusMessage(
      statusMessage('board-1', '{"status":"online"}'),
    );

    expect(matched).toBe(true);
    expect(store.getState().boards).toEqual([
      { code: 'board-1', status: 'online', fields: [], relaySlots: [] },
    ]);
    expect(changes).toEqual(['board-1']);
    expect(service.getBoards()).toHaveLength(1);
  });

  it('records offline state and flips a previously online board', () => {
    const { store, service } = makeService();
    service.handleStatusMessage(
      statusMessage('board-1', '{"status":"online"}'),
    );
    service.handleStatusMessage(statusMessage('board-1', 'offline'));

    expect(store.getState().boards).toEqual([
      { code: 'board-1', status: 'offline', fields: [], relaySlots: [] },
    ]);
  });

  it('accepts a bare "online"/"offline" payload string', () => {
    const { store, service } = makeService();
    service.handleStatusMessage(statusMessage('board-1', 'online'));
    expect(store.getState().boards[0]?.status).toBe('online');
    service.handleStatusMessage(statusMessage('board-1', 'offline'));
    expect(store.getState().boards[0]?.status).toBe('offline');
  });

  it('skips an INVALID payload with a warn and keeps the previous entry', () => {
    const { store, changes, service } = makeService();
    service.handleStatusMessage(
      statusMessage('board-1', '{"status":"online"}'),
    );
    const matched = service.handleStatusMessage(
      statusMessage('board-1', '{"status":"away"}'),
    );

    expect(matched).toBe(true); // Topic matched, payload rejected.
    expect(changes).toEqual(['board-1']);
    expect(store.getState().boards[0]?.status).toBe('online');
  });

  it('keeps observed fields/slots when a late status message arrives', () => {
    const { bus, store, service } = makeService();
    // Board seen through data first...
    bus.emit('telemetry:received', {
      roomId: 'board-1',
      field: 'temperature',
      value: 25.5,
    });
    // ...then its retained status arrives (e.g. after a subscribe).
    service.handleStatusMessage(
      statusMessage('board-1', '{"status":"online"}'),
    );

    expect(store.getState().boards).toEqual([
      {
        code: 'board-1',
        status: 'online',
        fields: ['temperature'],
        relaySlots: [],
      },
    ]);
  });

  it('ignores status messages under another prefix', () => {
    const { store, service } = makeService({ prefix: 'home' });
    const matched = service.handleStatusMessage({
      topic: 'other/room/board-1/status',
      payload: '{"status":"online"}',
    });

    expect(matched).toBe(false);
    expect(store.getState().boards).toEqual([]);
  });
});

describe('BoardInventoryService — data-driven discovery (telemetry/relay)', () => {
  it('marks a data-only board `seen` and records its field', () => {
    const { bus, store, changes } = makeService();

    bus.emit('telemetry:received', {
      roomId: 'board-7',
      field: 'temperature',
      value: 26,
    });

    expect(store.getState().boards).toEqual([
      {
        code: 'board-7',
        status: 'seen',
        fields: ['temperature'],
        relaySlots: [],
      },
    ]);
    expect(changes).toEqual(['board-7']);
  });

  it('accumulates fields and relay slots without emitting duplicate changes', () => {
    const { bus, store, changes } = makeService();

    bus.emit('telemetry:received', {
      roomId: 'board-1',
      field: 'temperature',
      value: 26,
    });
    bus.emit('telemetry:received', {
      roomId: 'board-1',
      field: 'humidity',
      value: 60,
    });
    bus.emit('telemetry:received', {
      roomId: 'board-1',
      field: 'temperature',
      value: 27,
    });
    bus.emit('relay:feedback', { roomId: 'board-1', index: 2, state: 'ON' });
    bus.emit('relay:command', { roomId: 'board-1', index: 2, state: 'OFF' });

    expect(store.getState().boards).toEqual([
      {
        code: 'board-1',
        status: 'seen',
        fields: ['temperature', 'humidity'],
        relaySlots: [2],
      },
    ]);
    // temperature(×1) + humidity + slot — the repeats did not fire.
    expect(changes).toEqual(['board-1', 'board-1', 'board-1']);
  });
});

describe('BoardInventoryService — subscription discipline (B1/M2)', () => {
  it('subscribes the status wildcard on the shared client', () => {
    const { client, service } = makeService({ prefix: 'home' });
    service.startStatusListener();

    expect(client.subscribedTopics).toEqual(['home/room/+/status']);
  });

  it('re-subscribes with the NEW prefix on applyPrefix', () => {
    const { client, service } = makeService({ prefix: 'home' });
    service.startStatusListener();
    service.applyPrefix('smarthome');
    service.startStatusListener();

    expect(client.subscribedTopics).toEqual([
      'home/room/+/status',
      'smarthome/room/+/status',
      'smarthome/room/+/status',
    ]);
  });

  it('routes status parsing by the CURRENT prefix after applyPrefix', () => {
    const { store, service } = makeService({ prefix: 'home' });
    service.applyPrefix('smarthome');

    service.handleStatusMessage({
      topic: 'smarthome/room/board-2/status',
      payload: '{"status":"online"}',
    });

    expect(store.getState().boards.map(board => board.code)).toEqual([
      'board-2',
    ]);
  });
});
