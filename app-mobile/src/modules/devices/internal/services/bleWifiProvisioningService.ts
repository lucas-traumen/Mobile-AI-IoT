/**
 * BLE WiFi provisioning service (boards-ble-wifi-provisioning, AD-5): the
 * ONLY place that touches `react-native-ble-plx` for provisioning — the
 * display shell (`BleProvisioningModal.tsx`) consumes the
 * {@link BleWifiProvisioningServiceLike} seam and never imports the BLE
 * stack (BoardsScannerModal's thin-shell pattern).
 *
 * Contract (see `modules/devices/README.md` — the shared firmware doc):
 * - scan filtered by the provisioning SERVICE UUID; boards are identified
 *   from the advertised local name `IoTBoard-{boardId}` (the scan list's
 *   identity; the DeviceInfo READ is the firmware's self-description and
 *   is intentionally NOT fetched during the scan — connecting per
 *   advertisement would make the list crawl. boardType comes from the QR
 *   label the user scanned, not from BLE).
 * - provision: connect → best-effort MTU 128 → service/characteristic
 *   discovery → subscribe the Status NOTIFY (armed BEFORE the writes so a
 *   fast firmware cannot emit into the void) → write SSID → write
 *   Password (both write-WITH-RESPONSE; empty password = open network) →
 *   write Command `PROVISION` → wait for `CONNECTED` (resolve) or
 *   `FAILED:*` (typed {@link BleProvisionError} with the firmware reason).
 *   No terminal status within {@link BLE_PROVISION_TIMEOUT_MS} → the
 *   `TIMEOUT` reason. Cleanup (unsubscribe + disconnect) runs in the
 *   finally path for EVERY exit.
 * - lastSsid memory (AD-4): a dedicated AsyncStorage key
 *   `devices.ble.lastSsid` — separate from the devices registry schema.
 *   The password is NEVER persisted (no API accepts one).
 *
 * Web safety (R5/AC7): importing this module is safe on web — the only
 * module-scope evaluation inside `react-native-ble-plx` reads
 * `NativeModules.BlePlx` (→ `undefined`, no crash). The BleManager itself
 * is constructed LAZILY inside {@link bleManager}, and on web that getter
 * throws a typed TRANSPORT error instead of constructing the native
 * manager. BoardsScreen additionally hides the whole flow behind a
 * `Platform.OS !== 'web'` gate, so the service is never called on web.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BleErrorCode,
  BleManager,
  type BleError,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';

import { createLogger, type Logger } from '@core/logger';

import {
  BLE_COMMAND_UUID,
  BLE_MTU_REQUEST,
  BLE_PASSWORD_UUID,
  BLE_PROVISION_TIMEOUT_MS,
  BLE_SERVICE_UUID,
  BLE_SSID_UUID,
  BLE_STATUS_UUID,
  PROVISION_COMMAND,
  base64ToUtf8,
  boardIdFromLocalName,
  parseBleStatus,
  utf8ToBase64,
  BleProvisionError,
  type BleProvisionStatus,
} from '../domain/bleProvisioningContract';

/** Dedicated AsyncStorage key (AD-4) — never the devices registry key. */
const LAST_SSID_KEY = 'devices.ble.lastSsid';

/** A board seen during a BLE scan. */
export interface BleScannedBoard {
  /**
   * Native device identifier (Android MAC / iOS UUID) — the connect target
   * passed back to {@link BleWifiProvisioningServiceLike.provision}.
   */
  readonly deviceId: string;
  /** Board id parsed from the `IoTBoard-{boardId}` local name. */
  readonly boardId: string;
  /** Advertised local name the id came from (display/debug context). */
  readonly localName: string | null;
  /** Signal strength (dBm) as reported by the scan, when present. */
  readonly rssi: number | null;
}

/**
 * Why a scan is not producing results: mapped from the BLE stack error so
 * the modal can show an honest hint instead of an endless spinner.
 */
export type BleScanProblem =
  | 'bluetoothOff'
  | 'permissionDenied'
  | 'unavailable';

/** A live scan; `stop()` ends it (idempotent — safe to call twice). */
export interface BleScanSession {
  stop(): void;
}

/** Arguments of the provisioning run. The password is never persisted. */
export interface BleProvisionArgs {
  readonly deviceId: string;
  readonly ssid: string;
  readonly password: string;
  /** Progress channel: every parsed Status notification, in arrival order. */
  readonly onStatus?: (status: BleProvisionStatus) => void;
}

/**
 * The display-shell seam (AD-6): exactly the surface
 * `BleProvisioningModal` consumes. BoardsScreen passes the real service;
 * tests inject fakes — neither the modal nor the screen mocks know BLE.
 */
export interface BleWifiProvisioningServiceLike {
  /**
   * Start scanning for provisioning boards (service-UUID filtered).
   * `onFound` fires per discovered board; `onProblem` fires when the scan
   * cannot run or dies (BT off / permission / unavailable). The returned
   * session must be stopped by the owner (modal close, board chosen).
   */
  startScan(
    onFound: (board: BleScannedBoard) => void,
    onProblem?: (problem: BleScanProblem) => void,
  ): BleScanSession;
  /** Run the provisioning sequence; resolves on `CONNECTED`. */
  provision(args: BleProvisionArgs): Promise<void>;
  /** The SSID remembered from the last successful send (null = none). */
  loadLastSsid(): Promise<string | null>;
  /** Remember the SSID for the next provisioning (password never stored). */
  saveLastSsid(ssid: string): Promise<void>;
}

/** Map a BLE stack error to the modal's honest scan-problem vocabulary. */
function mapScanProblem(error: BleError): BleScanProblem {
  const code = error.errorCode;
  if (
    code === BleErrorCode.BluetoothPoweredOff ||
    code === BleErrorCode.BluetoothResetting
  ) {
    return 'bluetoothOff';
  }
  if (code === BleErrorCode.BluetoothUnauthorized) {
    return 'permissionDenied';
  }
  return 'unavailable';
}

/**
 * The real service. One instance is enough (`getBleWifiProvisioningService`
 * singleton) — `BleManager` is created lazily on first use and reused.
 */
export class BleWifiProvisioningService
  implements BleWifiProvisioningServiceLike
{
  private manager: BleManager | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger = createLogger('BleWifiProvisioning')) {
    this.logger = logger;
  }

  /**
   * Lazy BleManager access — the R5/AC7 web guard: constructing
   * `BleManager` touches the native module (NativeEventEmitter), so it
   * happens only when a BLE operation is actually requested, and on web
   * it never happens (a typed TRANSPORT error is thrown instead).
   */
  private bleManager(): BleManager {
    if (Platform.OS === 'web') {
      throw new BleProvisionError(
        'TRANSPORT',
        'BLE provisioning is not available on web',
      );
    }
    if (this.manager === null) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  startScan(
    onFound: (board: BleScannedBoard) => void,
    onProblem?: (problem: BleScanProblem) => void,
  ): BleScanSession {
    const manager = this.bleManager();
    let stopped = false;

    void manager
      .startDeviceScan(
        [BLE_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (stopped) {
            return;
          }
          if (error) {
            // A mid-scan failure (the stack asks to restart scanning) —
            // surface the reason; the owner decides whether to retry.
            onProblem?.(mapScanProblem(error));
            return;
          }
          if (!device) {
            return;
          }
          const localName = device.localName ?? device.name ?? null;
          const boardId = boardIdFromLocalName(localName);
          if (boardId === null) {
            // Foreign advertisement (or a board whose name is malformed) —
            // never enters the scan list.
            return;
          }
          onFound({
            deviceId: device.id,
            boardId,
            localName,
            rssi: device.rssi ?? null,
          });
        },
      )
      .catch((error: unknown) => {
        // The scan could not START (typically BT off / missing permission
        // on Android) — the same honest problem channel as mid-scan errors.
        if (!stopped) {
          this.logger.warn('BLE scan failed to start', error);
          onProblem?.('unavailable');
        }
      });

    return {
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        manager.stopDeviceScan().catch((error: unknown) => {
          // Stopping an already-stopped/dead scan is a harmless no-op —
          // log, never propagate into the UI.
          this.logger.warn('BLE scan stop failed', error);
        });
      },
    };
  }

  async provision({
    deviceId,
    ssid,
    password,
    onStatus,
  }: BleProvisionArgs): Promise<void> {
    const manager = this.bleManager();
    let connected: Device | null = null;
    let statusSubscription: Subscription | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      // A local const keeps narrowing inside the closures below (the
      // `connected` field is the cleanup path's "did we connect" flag).
      const device = await manager.connectToDevice(deviceId, {
        autoConnect: false,
      });
      connected = device;

      // Best-effort MTU (plan: "app request MTU 128 sau connect
      // (best-effort)") — a rejection here must not kill provisioning.
      try {
        await device.requestMTU(BLE_MTU_REQUEST);
      } catch (mtuError) {
        this.logger.warn('BLE MTU negotiation failed (best-effort)', mtuError);
      }

      await device.discoverAllServicesAndCharacteristics();

      // The terminal-status promise: resolved by CONNECTED, rejected by
      // FAILED:* / notify errors / the overall timeout. The subscription
      // is armed BEFORE any write so no status can slip past.
      let resolveTerminal!: () => void;
      let rejectTerminal!: (error: BleProvisionError) => void;
      const terminal = new Promise<void>((resolve, reject) => {
        resolveTerminal = resolve;
        rejectTerminal = reject;
      });
      timeoutTimer = setTimeout(() => {
        rejectTerminal(
          new BleProvisionError(
            'TIMEOUT',
            `No CONNECTED status within ${BLE_PROVISION_TIMEOUT_MS} ms`,
          ),
        );
      }, BLE_PROVISION_TIMEOUT_MS);
      statusSubscription = device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_STATUS_UUID,
        (error, characteristic) => {
          if (error) {
            rejectTerminal(
              new BleProvisionError('TRANSPORT', 'Status subscription failed'),
            );
            return;
          }
          const raw = characteristic?.value ?? null;
          if (raw === null) {
            return;
          }
          const status = parseBleStatus(base64ToUtf8(raw));
          if (status === null) {
            // Garbage/unknown notification — never mistaken for a
            // terminal state.
            return;
          }
          onStatus?.(status);
          if (status.kind === 'connected') {
            resolveTerminal();
          } else if (status.kind === 'failed') {
            rejectTerminal(
              new BleProvisionError(
                status.reason,
                `Board reported FAILED:${status.reason}`,
              ),
            );
          }
        },
      );

      // The write sequence (plan order): SSID → Password → PROVISION,
      // all write-with-response (firmware reassembles ATT long writes).
      await device.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_SSID_UUID,
        utf8ToBase64(ssid),
      );
      await device.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_PASSWORD_UUID,
        utf8ToBase64(password),
      );
      await device.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_COMMAND_UUID,
        utf8ToBase64(PROVISION_COMMAND),
      );

      await terminal;
    } catch (error: unknown) {
      if (error instanceof BleProvisionError) {
        throw error;
      }
      throw new BleProvisionError(
        'TRANSPORT',
        error instanceof Error ? error.message : 'BLE provisioning failed',
      );
    } finally {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      statusSubscription?.remove();
      if (connected !== null) {
        try {
          await manager.cancelDeviceConnection(deviceId);
        } catch (disconnectError: unknown) {
          // A dead connection cannot be cancelled — cleanup must never
          // mask the provisioning result.
          this.logger.warn('BLE disconnect failed', disconnectError);
        }
      }
    }
  }

  async loadLastSsid(): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(LAST_SSID_KEY);
      return raw ?? null;
    } catch (error: unknown) {
      this.logger.warn('Failed to load last SSID', error);
      return null;
    }
  }

  async saveLastSsid(ssid: string): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SSID_KEY, ssid);
    } catch (error: unknown) {
      this.logger.warn('Failed to save last SSID', error);
    }
  }
}

/** Lazily-created default instance (constructed on first use). */
let defaultService: BleWifiProvisioningService | null = null;

/**
 * The default real service (singleton). BoardsScreen calls this when no
 * service was injected — tests always inject a fake instead, so the BLE
 * stack is never constructed under Jest.
 */
export function getBleWifiProvisioningService(): BleWifiProvisioningService {
  if (defaultService === null) {
    defaultService = new BleWifiProvisioningService();
  }
  return defaultService;
}
