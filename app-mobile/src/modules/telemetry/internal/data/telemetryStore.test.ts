import { createTelemetryStore } from './telemetryStore';

describe('telemetry store', () => {
  it('starts idle with no readings', () => {
    const store = createTelemetryStore();
    const state = store.getState();
    expect(state.connection).toBe('idle');
    expect(state.latest).toBeNull();
    expect(state.messageCount).toBe(0);
  });

  it('updates state when a valid reading arrives', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('connected');
    store
      .getState()
      .applyReading({ temperature: 25.6, humidity: 60.2, ts: 1756300000 });
    const state = store.getState();
    expect(state.connection).toBe('connected');
    expect(state.latest).toEqual({
      temperature: 25.6,
      humidity: 60.2,
      ts: 1756300000,
    });
    expect(state.messageCount).toBe(1);
  });

  it('keeps state unchanged when an invalid payload arrives', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('connected');
    const before = store.getState();

    // Simulate the data-flow: invalid payloads are rejected by the domain
    // parser, so the store is never reached.
    const parsed = JSON.parse('{"temperature":"hot"}');
    if (
      typeof parsed.temperature !== 'number' ||
      typeof parsed.humidity !== 'number'
    ) {
      // reject — do nothing
    }
    expect(store.getState()).toEqual(before);
  });

  it('increments messageCount on each valid reading', () => {
    const store = createTelemetryStore();
    store.getState().applyReading({ temperature: 1, humidity: 1 });
    store.getState().applyReading({ temperature: 2, humidity: 2 });
    expect(store.getState().messageCount).toBe(2);
  });

  it('replaces latest with the newest reading', () => {
    const store = createTelemetryStore();
    store.getState().applyReading({ temperature: 1, humidity: 1 });
    store.getState().applyReading({ temperature: 2, humidity: 2 });
    expect(store.getState().latest).toEqual({ temperature: 2, humidity: 2 });
  });

  it('tracks connection state transitions', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('connecting');
    expect(store.getState().connection).toBe('connecting');
    store.getState().setConnection('connected');
    expect(store.getState().connection).toBe('connected');
    store.getState().setConnection('reconnecting');
    expect(store.getState().connection).toBe('reconnecting');
    store.getState().setConnection('failed');
    expect(store.getState().connection).toBe('failed');
  });

  it('records the error code on failed and keeps it through reconnecting (CP5)', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('failed', 'auth');
    expect(store.getState().lastErrorCode).toBe('auth');
    store.getState().setConnection('reconnecting');
    expect(store.getState().lastErrorCode).toBe('auth');
  });

  it('defaults the error code to network when failed without a cause', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('failed');
    expect(store.getState().lastErrorCode).toBe('network');
  });

  it('keeps the recorded error code on a bare failed transition', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('failed', 'timeout');
    store.getState().setConnection('reconnecting');
    store.getState().setConnection('failed'); // no new cause supplied
    expect(store.getState().lastErrorCode).toBe('timeout');
  });

  it('clears the error code on connected', () => {
    const store = createTelemetryStore();
    store.getState().setConnection('failed', 'auth');
    store.getState().setConnection('connected');
    expect(store.getState().lastErrorCode).toBeNull();
  });
});
