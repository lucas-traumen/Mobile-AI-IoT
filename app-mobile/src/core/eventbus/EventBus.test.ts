import { InMemoryEventBus } from './InMemoryEventBus';
import { NullLogger } from '@core/logger';

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus(new NullLogger());
  });

  it('delivers payloads to subscribed handlers', () => {
    const received: number[] = [];
    bus.subscribe('telemetry:received', payload =>
      received.push(payload.temperature ?? 0),
    );
    bus.emit('telemetry:received', { temperature: 42, humidity: 50 });
    expect(received).toEqual([42]);
  });

  it('delivers to all subscribers in subscription order', () => {
    const order: string[] = [];
    bus.subscribe('telemetry:received', () => order.push('a'));
    bus.subscribe('telemetry:received', () => order.push('b'));
    bus.emit('telemetry:received', { temperature: 1, humidity: 1 });
    expect(order).toEqual(['a', 'b']);
  });

  it('does not deliver after unsubscribe', () => {
    const received: number[] = [];
    const unsubscribe = bus.subscribe('telemetry:received', payload =>
      received.push(payload.temperature ?? 0),
    );
    bus.emit('telemetry:received', { temperature: 1, humidity: 1 });
    unsubscribe();
    bus.emit('telemetry:received', { temperature: 2, humidity: 2 });
    expect(received).toEqual([1]);
  });

  it('ignores events nobody subscribed to', () => {
    expect(() =>
      bus.emit('telemetry:received', { temperature: 1, humidity: 1 }),
    ).not.toThrow();
  });

  it('isolates a throwing handler from other subscribers', () => {
    const received: number[] = [];
    const errors: unknown[] = [];
    const logger = {
      error: (message: string, ...args: unknown[]) =>
        errors.push([message, ...args]),
    };
    const loggingBus = new InMemoryEventBus(logger);
    loggingBus.subscribe('telemetry:received', () => {
      throw new Error('boom');
    });
    loggingBus.subscribe('telemetry:received', payload =>
      received.push(payload.temperature ?? 0),
    );
    expect(() =>
      loggingBus.emit('telemetry:received', { temperature: 7, humidity: 1 }),
    ).not.toThrow();
    expect(received).toEqual([7]);
    expect(errors.length).toBe(1);
  });

  it('supports unsubscribe from inside a handler', () => {
    const received: number[] = [];
    let unsubscribe: () => void = () => {};
    unsubscribe = bus.subscribe('telemetry:received', payload => {
      received.push(payload.temperature ?? 0);
      unsubscribe();
    });
    bus.emit('telemetry:received', { temperature: 1, humidity: 1 });
    bus.emit('telemetry:received', { temperature: 2, humidity: 2 });
    expect(received).toEqual([1]);
  });
});
