/**
 * Relay store — thin ViewModel holding the current (optimistic) relay states.
 *
 * Business rules stay in the domain layer; the store only tracks state.
 */

import { create } from 'zustand';

import type { RelayIndex, RelayState } from '@modules/relay/api';

/** Per-relay runtime state (optimistic until feedback arrives). */
export type RelayStates = Record<RelayIndex, RelayState>;

interface RelayStateStore {
  /** Current state per relay. */
  states: RelayStates;
  /** True while a command is in flight for a relay. */
  pending: Record<RelayIndex, boolean>;
  /** Optimistically set a relay state; marks it pending. */
  setOptimistic(index: RelayIndex, state: RelayState): void;
  /** Confirm a relay state from device feedback; clears pending. */
  confirm(index: RelayIndex, state: RelayState): void;
}

function initialStates(): RelayStates {
  return {
    1: 'OFF',
    2: 'OFF',
    3: 'OFF',
  };
}

function initialPending(): Record<RelayIndex, boolean> {
  return { 1: false, 2: false, 3: false };
}

/** Create the relay zustand store. */
export function createRelayStore() {
  return create<RelayStateStore>(set => ({
    states: initialStates(),
    pending: initialPending(),

    setOptimistic: (index, state) =>
      set(s => ({
        states: { ...s.states, [index]: state },
        pending: { ...s.pending, [index]: true },
      })),

    confirm: (index, state) =>
      set(s => ({
        states: { ...s.states, [index]: state },
        pending: { ...s.pending, [index]: false },
      })),
  }));
}

/** The zustand store instance shape returned by {@link createRelayStore}. */
export type RelayStore = ReturnType<typeof createRelayStore>;

/** Index type used by the store. */
export type { RelayIndex };
