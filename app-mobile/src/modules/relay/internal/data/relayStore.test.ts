import { createRelayStore } from './relayStore';

describe('relay store', () => {
  it('starts with all relays OFF and nothing pending', () => {
    const store = createRelayStore();
    const state = store.getState();
    expect(state.states).toEqual({ 1: 'OFF', 2: 'OFF', 3: 'OFF' });
    expect(state.pending).toEqual({ 1: false, 2: false, 3: false });
  });

  it('applies optimistic state and marks the relay pending', () => {
    const store = createRelayStore();
    store.getState().setOptimistic(2, 'ON');
    const state = store.getState();
    expect(state.states[2]).toBe('ON');
    expect(state.pending[2]).toBe(true);
    expect(state.states[1]).toBe('OFF');
  });

  it('confirms state from device feedback and clears pending', () => {
    const store = createRelayStore();
    store.getState().setOptimistic(2, 'ON');
    store.getState().confirm(2, 'ON');
    const state = store.getState();
    expect(state.states[2]).toBe('ON');
    expect(state.pending[2]).toBe(false);
  });

  it('corrects optimistic state when feedback disagrees', () => {
    const store = createRelayStore();
    store.getState().setOptimistic(1, 'ON');
    store.getState().confirm(1, 'OFF');
    expect(store.getState().states[1]).toBe('OFF');
    expect(store.getState().pending[1]).toBe(false);
  });

  it('tracks relays independently', () => {
    const store = createRelayStore();
    store.getState().setOptimistic(1, 'ON');
    store.getState().setOptimistic(3, 'OFF');
    store.getState().confirm(1, 'ON');
    const state = store.getState();
    expect(state.states).toEqual({ 1: 'ON', 2: 'OFF', 3: 'OFF' });
    expect(state.pending).toEqual({ 1: false, 2: false, 3: true });
  });
});
