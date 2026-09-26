/**
 * mDNS discovery service (settings-mdns-discovery) — the ONLY place that
 * touches `react-native-zeroconf`; AdvancedSettingsScreen consumes the
 * {@link MdnsDiscoveryServiceLike} seam and never imports the lib.
 *
 * Scan lifecycle (AD-1/AD-5): one `_smarthome._tcp` browse for up to
 * {@link MDNS_SCAN_TIMEOUT_MS} (10 s). Resolved advertisements are mapped
 * to typed {@link DiscoveredServer}s (TXT through the contract's tolerant
 * parser, host preferred as the reachable IPv4) and deduplicated by
 * name|host|port. The
 * 10 s timeout is the HONEST end: `ok([])` — an empty result, never an
 * error (the server may simply not be advertising yet, R4). A lib error
 * event or a failed scan start resolves a typed
 * {@link MdnsDiscoveryError} Result instead. Cleanup — detach the scan
 * handlers, native stop, timer clear — runs on EVERY exit path: timeout,
 * error, and user stop (user stop keeps the results found so far).
 *
 * Web safety (AD-4, the BLE `bleManager()` pattern): module-scope
 * evaluation of `react-native-zeroconf` only reads
 * `NativeModules.RNZeroconf` (→ `undefined` on web, no crash). The
 * Zeroconf INSTANCE is constructed lazily inside
 * {@link MdnsDiscoveryService.zeroconf}, and on web that getter throws a
 * typed TRANSPORT error before any construction. The screen additionally
 * hides the whole flow behind a `Platform.OS !== 'web'` gate, so the
 * service is never even called on web.
 *
 * Listener lifecycle note: the lib's constructor subscribes its
 * DeviceEventEmitter plumbing ONCE for the client's lifetime; re-adding
 * them (`addDeviceListeners`) while present makes the lib emit — and the
 * `events` EventEmitter THROW on — an unhandled `'error'`. So each scan
 * only attaches/detaches its own `resolved`/`error` handlers and calls
 * `stop()`; the constructor-owned subscription set is reused for every
 * scan of the singleton client.
 */

import { Platform } from 'react-native';
import Zeroconf, { type Service } from 'react-native-zeroconf';

import { err, ok, type Result } from '@core/errors';
import { createLogger, type Logger } from '@core/logger';

import {
  MDNS_SERVICE_DOMAIN,
  MDNS_SERVICE_PROTOCOL,
  MDNS_SERVICE_TYPE,
  parseMdnsTxt,
  type DiscoveredServer,
} from '../domain/mdnsDiscoveryContract';

/** The honest scan window (AD-5): 10 seconds. */
export const MDNS_SCAN_TIMEOUT_MS = 10_000;

/**
 * Why a scan failed — never `'timeout'`: the timeout is the honest EMPTY
 * result (`ok([])`), not an error.
 */
export type MdnsDiscoveryErrorCode = 'transport' | 'unavailable';

/** Typed discovery error (`transport` = web guard; `unavailable` = stack). */
export class MdnsDiscoveryError extends Error {
  constructor(readonly code: MdnsDiscoveryErrorCode, message: string) {
    super(message);
    this.name = 'MdnsDiscoveryError';
  }
}

/** Scan outcome: `ok(servers)` — possibly EMPTY — or `err(typed)`. */
export type MdnsScanResult = Result<
  readonly DiscoveredServer[],
  MdnsDiscoveryError
>;

/** A live scan; `stop()` ends it early (idempotent) with the partials. */
export interface MdnsScanSession {
  stop(): void;
}

/**
 * The screen-facing seam (AD-4): exactly the surface
 * AdvancedSettingsScreen consumes. `onDone` fires EXACTLY ONCE per scan.
 */
export interface MdnsDiscoveryServiceLike {
  /**
   * Browse `_smarthome._tcp` for up to `timeoutMs`.
   *
   * @param onDone - called exactly once: `ok(servers)` (empty = honest
   *   nothing-found timeout) or `err(typed)`.
   * @param timeoutMs - scan window (default 10 s).
   * @returns the session; `stop()` ends the scan early with the results
   *   found so far (safe to call from unmount cleanup).
   */
  startScan(
    onDone: (result: MdnsScanResult) => void,
    timeoutMs?: number,
  ): MdnsScanSession;
}

const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

/** True when the string is a plausible dotted-quad IPv4 address. */
function isIpv4(host: string): boolean {
  if (!IPV4_PATTERN.test(host)) {
    return false;
  }
  return host.split('.').every(part => {
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

/**
 * Ranges a LAN phone client cannot reach even though the server
 * advertises them on its own interfaces: loopback (127/8), link-local
 * (169.254/16), the Docker bridge block (172.16/12) and the Tailscale
 * CGNAT block (100.64/10). Avahi emits those BEFORE the Wi-Fi LAN
 * address, so picking the first valid IPv4 could select an unreachable
 * host and make discovery appear broken (runtime evidence:
 * 127.0.0.1 + 172.17-19.0.1 advertised before 192.168.100.3).
 */
function isUnreachableFromLan(ip: string): boolean {
  const [first = -1, second = -1] = ip.split('.').map(part => Number(part));
  return (
    first === 127 || // loopback
    (first === 169 && second === 254) || // link-local
    (first === 172 && second >= 16 && second <= 31) || // Docker bridge
    (first === 100 && second >= 64 && second <= 127) // Tailscale CGNAT
  );
}

/**
 * Pick the MQTT host from a resolved advertisement: prefer an IPv4
 * address the phone can actually REACH ({@link isUnreachableFromLan} —
 * Avahi advertises the server's loopback/Docker/Tailscale interfaces
 * before the Wi-Fi LAN one); then the first valid IPv4; then the mDNS
 * hostname (trailing dot stripped) — the user can still edit the field
 * before saving. `null` = no usable host (skip the advertisement).
 */
function pickHost(service: Service): string | null {
  const addresses = Array.isArray(service.addresses) ? service.addresses : [];
  const ipv4s = addresses.filter(
    address => typeof address === 'string' && isIpv4(address),
  );
  const reachable = ipv4s.find(address => !isUnreachableFromLan(address));
  if (reachable !== undefined) {
    return reachable;
  }
  // EVERY IPv4 sits in an unreachable range (e.g. a LAN-less server):
  // keep the first one rather than dropping the advertisement.
  if (ipv4s.length > 0) {
    return ipv4s[0];
  }
  if (typeof service.host === 'string' && service.host.trim().length > 0) {
    return service.host.trim().replace(/\.$/, '');
  }
  return null;
}

/**
 * Map a lib resolved service to the typed result (plan: "map resolved
 * service (name/host/port/TXT) → typed result"). Returns `null` for
 * foreign/useless advertisements: no name, no valid port (the port IS
 * the MQTT WebSocket port) or no usable host.
 */
export function mapResolvedService(service: Service): DiscoveredServer | null {
  const name = typeof service.name === 'string' ? service.name.trim() : '';
  if (name.length === 0) {
    return null;
  }
  const port =
    typeof service.port === 'number' &&
    Number.isInteger(service.port) &&
    service.port >= 1 &&
    service.port <= 65535
      ? service.port
      : null;
  if (port === null) {
    return null;
  }
  const host = pickHost(service);
  if (host === null) {
    return null;
  }
  return { name, host, port, txt: parseMdnsTxt(service.txt) };
}

/**
 * The real service. One instance is enough (`getMdnsDiscoveryService`
 * singleton) — the Zeroconf client is created lazily on first use and
 * reused.
 */
export class MdnsDiscoveryService implements MdnsDiscoveryServiceLike {
  private client: Zeroconf | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger = createLogger('MdnsDiscovery')) {
    this.logger = logger;
  }

  /**
   * Lazy Zeroconf access — the web guard (AD-4): constructing Zeroconf
   * subscribes the native event plumbing, so it happens only when a scan
   * is actually requested, and on web it never happens (a typed
   * TRANSPORT error is thrown instead of constructing the native client).
   */
  private zeroconf(): Zeroconf {
    if (Platform.OS === 'web') {
      throw new MdnsDiscoveryError(
        'transport',
        'mDNS discovery is not available on web',
      );
    }
    if (this.client === null) {
      this.client = new Zeroconf();
    }
    return this.client;
  }

  startScan(
    onDone: (result: MdnsScanResult) => void,
    timeoutMs: number = MDNS_SCAN_TIMEOUT_MS,
  ): MdnsScanSession {
    let client: Zeroconf;
    try {
      client = this.zeroconf();
    } catch (error: unknown) {
      onDone(
        err(
          error instanceof MdnsDiscoveryError
            ? error
            : new MdnsDiscoveryError(
                'transport',
                'mDNS discovery failed to start',
              ),
        ),
      );
      return { stop: () => undefined };
    }

    const found = new Map<string, DiscoveredServer>();
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onResolved = (service: Service) => {
      if (finished) {
        return;
      }
      const mapped = mapResolvedService(service);
      if (mapped !== null) {
        found.set(`${mapped.name}|${mapped.host}|${mapped.port}`, mapped);
      }
    };

    const onError = (error: Error) => {
      finish(
        err(
          new MdnsDiscoveryError(
            'unavailable',
            error.message || 'mDNS scan error',
          ),
        ),
      );
    };

    // Cleanup on EVERY exit path (timeout / error / user stop): clear the
    // timer, detach this scan's handlers, stop the native browse — then
    // report exactly once.
    const finish = (result: MdnsScanResult) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      client.removeListener('resolved', onResolved);
      client.removeListener('error', onError);
      try {
        client.stop();
      } catch (stopError: unknown) {
        // Stopping an already-stopped/dead scan is a harmless no-op —
        // never mask the scan result with a cleanup failure.
        this.logger.warn('mDNS scan stop failed', stopError);
      }
      onDone(result);
    };

    client.on('resolved', onResolved);
    client.on('error', onError);
    timer = setTimeout(() => {
      // Honest timeout (AD-5): the empty result is a successful scan that
      // found nothing — NOT an error.
      finish(ok([...found.values()]));
    }, timeoutMs);
    try {
      client.scan(
        MDNS_SERVICE_TYPE,
        MDNS_SERVICE_PROTOCOL,
        MDNS_SERVICE_DOMAIN,
      );
    } catch (scanError: unknown) {
      this.logger.warn('mDNS scan failed to start', scanError);
      finish(
        err(
          new MdnsDiscoveryError(
            'unavailable',
            'mDNS scan could not start on this device',
          ),
        ),
      );
    }

    return {
      stop: () => {
        // User stop (e.g. the screen unmounted mid-scan): the results
        // found so far are still valid discoveries.
        finish(ok([...found.values()]));
      },
    };
  }
}

/** Lazily-created default instance (constructed on first use). */
let defaultService: MdnsDiscoveryService | null = null;

/**
 * The default real service (singleton). The screen resolves this when no
 * service was injected — tests always inject a fake, so the zeroconf lib
 * is never constructed under Jest (BoardsScreen BLE precedent).
 */
export function getMdnsDiscoveryService(): MdnsDiscoveryService {
  if (defaultService === null) {
    defaultService = new MdnsDiscoveryService();
  }
  return defaultService;
}
