/**
 * BoardInventoryService — board discovery on the shared MQTT client
 * (board-discovery-binding plan).
 *
 * Real-backend boards publish their identity as the MQTT room segment
 * (`deviceId ≡ roomId` on the bridge): status is RETAINED on
 * `<prefix>/room/<code>/status`, telemetry flows on
 * `<prefix>/room/<code>/sensor/<field>` and relay feedback on
 * `<prefix>/room/<code>/stat/relay/<n>`. This service combines those three
 * sources into one inventory entry per board code:
 *
 * - `{code, status: 'online'|'offline'|'seen', fields, relaySlots}` —
 *   `seen` = the board has sent data (telemetry/feedback) but no status
 *   message was observed yet.
 * - status payloads are zod-validated; malformed topics/payloads are
 *   skipped with a warn (a foreign/broken message can never corrupt the
 *   inventory).
 * - every change pushes the snapshot into the zustand board store and
 *   emits `board:changed` on the bus.
 *
 * Client discipline mirrors `RelayService` (B1): the bus subscriptions are
 * attached ONCE in the constructor (no stacking on settings changes); the
 * MQTT status wildcard is (re)subscribed through `startStatusListener` /
 * `applyPrefix` on the SHARED client (`AppDependencies.mqttClient`) — no
 * extra connection.
 */

import type { EventBus } from '@core/eventbus';
import type { Logger } from '@core/logger';
import { parseBoardStatusTopic } from '@core/topics';
import { z } from 'zod';

import type { MqttClientPort } from '@modules/telemetry/api';

/** One discovered board (board-discovery-binding plan entry shape). */
export interface BoardInventoryEntry {
  /** Wire board code (the MQTT room segment the board publishes under). */
  readonly code: string;
  /**
   * `online`/`offline` come from the retained status topic; `seen` marks a
   * board that has sent data but published no status message (yet).
   */
  readonly status: 'online' | 'offline' | 'seen';
  /** Sensor fields the board has been observed measuring. */
  readonly fields: readonly string[];
  /** Relay slots the board has been observed reporting/commanding. */
  readonly relaySlots: readonly number[];
}

/**
 * Status payload contract: the bridge may publish either a bare
 * `"online"`/`"offline"` string or an object `{"status": "online"}` —
 * both validate to the same normalized state. Anything else is dropped.
 */
const BoardStatusPayloadSchema = z.union([
  z
    .object({ status: z.enum(['online', 'offline']) })
    .passthrough()
    .transform(value => value.status),
  z.enum(['online', 'offline']),
]);

/** Inventory mutation + persistence + broadcast (single fan-out point). */
export class BoardInventoryService {
  private readonly client: MqttClientPort;
  private readonly bus: EventBus;
  private readonly logger: Logger;
  private readonly store: BoardInventoryStorePort;
  private prefix: string;
  private readonly entries = new Map<string, BoardInventoryEntry>();

  constructor(options: {
    client: MqttClientPort;
    bus: EventBus;
    logger: Logger;
    store: BoardInventoryStorePort;
    prefix: string;
  }) {
    this.client = options.client;
    this.bus = options.bus;
    this.logger = options.logger;
    this.store = options.store;
    this.prefix = options.prefix;
    this.attachBusHandlers();
  }

  /** Update the topic prefix and re-subscribe the status wildcard (B1/M2). */
  applyPrefix(prefix: string): void {
    this.prefix = prefix;
    // Old-prefix subscriptions stay on the broker until disconnect but no
    // longer match handleStatusMessage (same discipline as RelayService).
    this.client.subscribe(this.statusSubscriptionTopic());
  }

  /**
   * Subscribe to the status MQTT wildcard
   * (`<prefix>/room/+/status`). Safe to call repeatedly (e.g. after every
   * settings change / reconnect) — the client port de-duplicates
   * subscription topics in a Set.
   */
  startStatusListener(): void {
    this.client.subscribe(this.statusSubscriptionTopic());
  }

  /**
   * Handle an MQTT message that may be a board status message
   * (`<prefix>/room/<code>/status`, retained). Returns true when the topic
   * matched (regardless of payload validity — same contract as
   * `RelayService.handleFeedbackMessage`).
   */
  handleStatusMessage(message: { topic: string; payload: string }): boolean {
    const code = parseBoardStatusTopic(message.topic, this.prefix);
    if (!code.ok) {
      return false;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(message.payload) as unknown;
    } catch {
      payload = message.payload;
    }
    const parsed = BoardStatusPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(
        `Boards: ignoring invalid status payload for "${code.value}": ${message.payload}`,
      );
      return true;
    }
    this.upsert(code.value, {
      status: parsed.data,
      fields: this.entries.get(code.value)?.fields ?? [],
      relaySlots: this.entries.get(code.value)?.relaySlots ?? [],
    });
    return true;
  }

  /** The current inventory (insertion order). */
  getBoards(): readonly BoardInventoryEntry[] {
    return [...this.entries.values()];
  }

  private statusSubscriptionTopic(): string {
    return `${this.prefix}/room/+/status`;
  }

  /**
   * Bus handlers (attached ONCE): telemetry readings and relay feedback
   * carry the WIRE room identity as `roomId` — for bound boards that is
   * the board code, so they feed the inventory directly. A board observed
   * through data without a status message becomes `seen`.
   */
  private attachBusHandlers(): void {
    this.bus.subscribe('telemetry:received', reading => {
      const existing = this.entries.get(reading.roomId);
      // Telemetry never changes the status (a data-only board stays
      // `seen`); the only mutation is a NEW observed field.
      if (existing && existing.fields.includes(reading.field)) {
        return; // No change.
      }
      this.upsert(reading.roomId, {
        status: existing?.status ?? 'seen',
        fields: existing
          ? [...existing.fields, reading.field]
          : [reading.field],
        relaySlots: existing?.relaySlots ?? [],
      });
    });
    const applyRelaySlot = (roomId: string, index: number): void => {
      const existing = this.entries.get(roomId);
      if (existing && existing.relaySlots.includes(index)) {
        return; // No change.
      }
      this.upsert(roomId, {
        status: existing?.status ?? 'seen',
        fields: existing?.fields ?? [],
        relaySlots: existing ? [...existing.relaySlots, index] : [index],
      });
    };
    this.bus.subscribe('relay:command', command =>
      applyRelaySlot(command.roomId, command.index),
    );
    this.bus.subscribe('relay:feedback', feedback =>
      applyRelaySlot(feedback.roomId, feedback.index),
    );
  }

  /**
   * Create/update one entry, persist into the mirror store and broadcast
   * `board:changed`. Duplicate upserts are avoided by the callers' change
   * checks, so the bus event fires only on real changes.
   */
  private upsert(code: string, next: Omit<BoardInventoryEntry, 'code'>): void {
    this.entries.set(code, { code, ...next });
    this.store.getState().setBoards(this.getBoards());
    this.bus.emit('board:changed', { code });
  }
}

/** Narrow store port the service pushes snapshots into (zustand board store). */
export interface BoardInventoryStorePort {
  getState(): {
    setBoards(boards: readonly BoardInventoryEntry[]): void;
  };
}
