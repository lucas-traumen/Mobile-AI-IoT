/**
 * Relay store — thin ViewModel holding the current (optimistic) relay states.
 *
 * Room-scoped runtime state (settings-information-architecture plan): every
 * entry is keyed by the composite `relaySlotKey(roomId, index)` so equal
 * slots in separate rooms never alias. Business rules stay in the domain
 * layer; the store only tracks state.
 */

import { create } from 'zustand';

import type { RelayAddress, RelayIndex, RelayState } from '@modules/relay/api';

/**
 * Composite store key for one room-scoped relay slot:
 * `relaySlotKey('room-1', 2)` → `'room-1#2'`.
 */
export type RelaySlotKey = string;

/** Build the composite runtime key for a room-scoped slot. */
export function relaySlotKey(roomId: string, index: RelayIndex): RelaySlotKey {
  return `${roomId}#${index}`;
}

/** Per-slot runtime state map (keyed by {@link relaySlotKey}). */
export type RelayStates = Record<RelaySlotKey, RelayState>;

interface RelayStateStore {
  /** Current state per room-scoped slot (unknown slots default to `'OFF'`). */
  states: Record<RelaySlotKey, RelayState>;
  /** True while a command is in flight for a room-scoped slot. */
  pending: Record<RelaySlotKey, boolean>;
  /** Optimistically set a slot state; marks it pending. */
  setOptimistic(address: RelayAddress, state: RelayState): void;
  /** Confirm a slot state from device feedback; clears pending. */
  confirm(address: RelayAddress, state: RelayState): void;
}

/** Read the current state of a slot (`'OFF'` when never touched). */
export function relayStateOf(
  states: Record<RelaySlotKey, RelayState>,
  address: RelayAddress,
): RelayState {
  return states[relaySlotKey(address.roomId, address.index)] ?? 'OFF';
}

/** Read the pending flag of a slot (`false` when never touched). */
export function relayPendingOf(
  pending: Record<RelaySlotKey, boolean>,
  address: RelayAddress,
): boolean {
  return pending[relaySlotKey(address.roomId, address.index)] ?? false;
}

/** Create the relay zustand store. */
export function createRelayStore() {
  return create<RelayStateStore>(set => ({
    states: {},
    pending: {},

    setOptimistic: (address, state) =>
      set(s => {
        const key = relaySlotKey(address.roomId, address.index);
        return {
          states: { ...s.states, [key]: state },
          pending: { ...s.pending, [key]: true },
        };
      }),

    confirm: (address, state) =>
      set(s => {
        const key = relaySlotKey(address.roomId, address.index);
        return {
          states: { ...s.states, [key]: state },
          pending: { ...s.pending, [key]: false },
        };
      }),
  }));
}

/** The zustand store instance shape returned by {@link createRelayStore}. */
export type RelayStore = ReturnType<typeof createRelayStore>;

/** Re-export the slot index type for store consumers. */
export type { RelayIndex };
