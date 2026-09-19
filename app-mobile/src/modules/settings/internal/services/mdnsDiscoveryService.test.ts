/**
 * mdnsDiscoveryService tests (plan required tests — mock the zeroconf
 * lib): scan start/stop; resolved event → typed result mapping; cleanup
 * on EVERY exit path (timeout / error / user stop); the 10 s timeout →
 * the honest EMPTY result (never an error); lib error → typed error
 * Result; web guard — lazy getter + TRANSPORT error, the lib is NEVER
 * constructed on web.
 */

import Zeroconf from 'react-native-zeroconf';
import type { Service } from 'react-native-zeroconf';

import {
  MDNS_SCAN_TIMEOUT_MS,
  MdnsDiscoveryService,
} from './mdnsDiscoveryService';

/** Mutable Platform.OS seam (web-guard test) — jest-expo is 'ios'. */
let mockPlatformOS = 'ios';

/**
 * Wrap the react-native module in a Proxy so `Platform.OS` reads the
 * mutable seam while every other export stays the untouched actual value
 * (the BLE service test's established pattern — a spread-based mock
 * eagerly evaluates RN internals and crashes jest-expo's setup).
 */
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native') as Record<
    PropertyKey,
    unknown
  >;
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === 'Platform') {
        return {
          ...(target.Platform as Record<string, unknown>),
          get OS() {
            return mockPlatformOS;
          },
        };
      }
      return target[prop];
    },
  });
});

/** The test-visible surface of the factory-created fake below. */
interface FakeZeroconfLike {
  scanCalls: unknown[][];
  stopped: boolean;
  on(event: string, listener: (...args: unknown[]) => unknown): unknown;
  removeListener(
    event: string,
    listener: (...args: unknown[]) => unknown,
  ): unknown;
  emit(event: string, ...args: unknown[]): void;
  listenerCountOf(event: string): number;
}

jest.mock('react-native-zeroconf', () => {
  /**
   * Minimal fake of the lib's JS surface the service uses (on /
   * removeListener / emit / scan / stop). Instances are tracked on the
   * static `instances` array so tests can pin lazy construction.
   */
  class FakeZeroconf {
    static readonly instances: FakeZeroconf[] = [];
    /** When true, the next scan() throws synchronously (native failure). */
    static failScan = false;
    readonly scanCalls: unknown[][] = [];
    stopped = false;
    private readonly handlers = new Map<
      string,
      Set<(...args: unknown[]) => unknown>
    >();

    constructor() {
      FakeZeroconf.instances.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => unknown): unknown {
      let set = this.handlers.get(event);
      if (!set) {
        set = new Set();
        this.handlers.set(event, set);
      }
      set.add(listener);
      return this;
    }

    removeListener(
      event: string,
      listener: (...args: unknown[]) => unknown,
    ): unknown {
      this.handlers.get(event)?.delete(listener);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(this.handlers.get(event) ?? [])]) {
        listener(...args);
      }
    }

    listenerCountOf(event: string): number {
      return this.handlers.get(event)?.size ?? 0;
    }

    scan(...args: unknown[]): void {
      if (FakeZeroconf.failScan) {
        throw new Error('native module gone');
      }
      this.scanCalls.push(args);
    }

    stop(): void {
      this.stopped = true;
    }
  }
  return { __esModule: true, default: FakeZeroconf };
});

/** The most recently constructed fake (undefined-checked). */
function latestFake(): FakeZeroconfLike {
  const ctor = Zeroconf as unknown as {
    instances: FakeZeroconfLike[];
  };
  const instance = ctor.instances[ctor.instances.length - 1];
  if (!instance) {
    throw new Error('no zeroconf instance was constructed');
  }
  return instance;
}

/** A contract-conformant resolved-service fixture. */
function resolvedService(overrides: Partial<Service> = {}): Service {
  return {
    name: 'Smart Home Server',
    fullName: 'Smart Home Server._smarthome._tcp.local.',
    addresses: ['192.168.1.23'],
    host: 'smarthomeserver.local.',
    port: 9001,
    txt: {
      prefix: 'smarthome',
      influx_port: '8086',
      influx_org: 'smarthome',
      influx_bucket: 'smarthome',
    },
    ...overrides,
  };
}

describe('MdnsDiscoveryService — lazy construction (AD-4)', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    (Zeroconf as unknown as { instances: unknown[] }).instances.length = 0;
  });

  it('constructs the client lazily (none before the first scan)', () => {
    new MdnsDiscoveryService();
    expect(
      (Zeroconf as unknown as { instances: unknown[] }).instances,
    ).toHaveLength(0);
    const session = new MdnsDiscoveryService().startScan(() => undefined);
    expect(
      (Zeroconf as unknown as { instances: unknown[] }).instances,
    ).toHaveLength(1);
    // End the scan so no timer leaks past the test (worker-exit hygiene).
    session.stop();
  });
});

describe('MdnsDiscoveryService — scan lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPlatformOS = 'ios';
    (Zeroconf as unknown as { instances: unknown[] }).instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('browses the contract service type (AD-1: _smarthome._tcp local.)', () => {
    new MdnsDiscoveryService().startScan(() => undefined);
    const fake = latestFake();
    expect(fake.scanCalls).toEqual([['smarthome', 'tcp', 'local.']]);
  });

  it('maps a resolved advertisement to the typed result and deduplicates it', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();
    fake.emit('resolved', resolvedService());
    fake.emit('resolved', resolvedService()); // same name|host|port → dedupe

    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      value?: readonly { name: string; host: string; port: number }[];
    };
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([
      {
        name: 'Smart Home Server',
        host: '192.168.1.23',
        port: 9001,
        txt: {
          prefix: 'smarthome',
          influxPort: 8086,
          influxOrg: 'smarthome',
          influxBucket: 'smarthome',
        },
      },
    ]);
  });

  it('prefers an IPv4 address and falls back to the hostname (trailing dot stripped)', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();
    fake.emit(
      'resolved',
      resolvedService({
        addresses: ['fe80::aebc:123:ffff:abcd', '10.0.0.2'],
      }),
    );
    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    const result = onDone.mock.calls[0]?.[0] as {
      value?: readonly { host: string }[];
    };
    expect(result.value?.[0]?.host).toBe('10.0.0.2');

    const onDone2 = jest.fn();
    new MdnsDiscoveryService().startScan(onDone2);
    latestFake().emit(
      'resolved',
      resolvedService({ addresses: [], host: 'smarthomeserver.local.' }),
    );
    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    const result2 = onDone2.mock.calls[0]?.[0] as {
      value?: readonly { host: string }[];
    };
    expect(result2.value?.[0]?.host).toBe('smarthomeserver.local');
  });

  it('skips foreign/useless advertisements (no name, no port, no host)', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();
    fake.emit('resolved', resolvedService({ name: '  ' }));
    fake.emit('resolved', resolvedService({ port: 0 }));
    fake.emit('resolved', resolvedService({ addresses: [], host: '' }));
    fake.emit('resolved', resolvedService({ port: 99999 }));

    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    const result = onDone.mock.calls[0]?.[0] as {
      value?: readonly unknown[];
    };
    expect(result.value).toEqual([]);
  });

  it('the 10 s timeout is the honest EMPTY result (ok([]), not an error) (AD-5)', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      value?: readonly unknown[];
    };
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([]);
  });

  it('honors a custom (shorter) scan window', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone, 50);
    jest.advanceTimersByTime(49);
    expect(onDone).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('MdnsDiscoveryService — cleanup on every exit path', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPlatformOS = 'ios';
    (Zeroconf as unknown as { instances: unknown[] }).instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('timeout: stops the native browse, detaches the handlers, fires once', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();
    expect(fake.listenerCountOf('resolved')).toBe(1);
    expect(fake.listenerCountOf('error')).toBe(1);

    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fake.stopped).toBe(true);
    expect(fake.listenerCountOf('resolved')).toBe(0);
    expect(fake.listenerCountOf('error')).toBe(0);

    // Late events after the finish are inert (detached + finished flag).
    fake.emit('resolved', resolvedService());
    fake.emit('error', new Error('late'));
    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS * 2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('user stop: fires once with the results found so far and cleans up', () => {
    const onDone = jest.fn();
    const session = new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();
    fake.emit('resolved', resolvedService());

    session.stop();
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      value?: readonly unknown[];
    };
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(fake.stopped).toBe(true);
    expect(fake.listenerCountOf('resolved')).toBe(0);
    expect(fake.listenerCountOf('error')).toBe(0);

    // Idempotent + inert afterwards.
    session.stop();
    jest.advanceTimersByTime(MDNS_SCAN_TIMEOUT_MS);
    fake.emit('resolved', resolvedService());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lib error event: fires a typed error Result once and cleans up', () => {
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);
    const fake = latestFake();

    fake.emit('error', new Error('NSD failure'));
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      error?: { code: string; message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('unavailable');
    expect(result.error?.message).toBe('NSD failure');
    expect(fake.stopped).toBe(true);
    expect(fake.listenerCountOf('resolved')).toBe(0);
    expect(fake.listenerCountOf('error')).toBe(0);
  });

  it('a synchronous scan-start failure is a typed error with full cleanup', () => {
    const onDone = jest.fn();
    const ctor = Zeroconf as unknown as { failScan: boolean };
    ctor.failScan = true;
    try {
      new MdnsDiscoveryService().startScan(onDone);
    } finally {
      ctor.failScan = false;
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('unavailable');
    // Cleanup ran even though the scan never started.
    const fake = latestFake();
    expect(fake.stopped).toBe(true);
    expect(fake.listenerCountOf('resolved')).toBe(0);
    expect(fake.listenerCountOf('error')).toBe(0);
  });
});

describe('MdnsDiscoveryService — web guard (AD-4)', () => {
  beforeEach(() => {
    (Zeroconf as unknown as { instances: unknown[] }).instances.length = 0;
  });

  it('on web: typed TRANSPORT error, no error thrown to the caller, lib NEVER constructed', () => {
    mockPlatformOS = 'web';
    const onDone = jest.fn();
    new MdnsDiscoveryService().startScan(onDone);

    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0]?.[0] as {
      ok: boolean;
      error?: { code: string; message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('transport');
    expect(result.error?.message).toBe(
      'mDNS discovery is not available on web',
    );
    expect(
      (Zeroconf as unknown as { instances: unknown[] }).instances,
    ).toHaveLength(0);
  });
});
