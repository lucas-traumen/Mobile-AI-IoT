/**
 * BLE provisioning contract tests (boards-ble-wifi-provisioning): the pure
 * GATT vocabulary — UUID constants pinned to the plan's contract table,
 * Status-notify parsing (exact values, garbage → null), byte-accurate WiFi
 * credential validation, the `IoTBoard-{boardId}` local-name grammar, the
 * DeviceInfo JSON parse (QR-label shape) and the Base64/UTF-8 codecs the
 * service layer writes with.
 */

import {
  BLE_BOARD_NAME_PREFIX,
  BLE_COMMAND_UUID,
  BLE_DEVICE_INFO_UUID,
  BLE_PASSWORD_MAX_BYTES,
  BLE_PASSWORD_UUID,
  BLE_PROVISION_TIMEOUT_MS,
  BLE_SERVICE_UUID,
  BLE_SSID_MAX_BYTES,
  BLE_SSID_UUID,
  BLE_STATUS_UUID,
  PROVISION_COMMAND,
  base64ToUtf8,
  boardIdFromLocalName,
  parseBleDeviceInfo,
  parseBleStatus,
  toBleProvisionErrorReason,
  utf8ByteLength,
  utf8ToBase64,
  validateWifiCredentials,
} from './bleProvisioningContract';

describe('BLE GATT UUID constants (plan contract table, verbatim)', () => {
  it('pins every UUID of the provisioning service', () => {
    expect(BLE_SERVICE_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a01');
    expect(BLE_DEVICE_INFO_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a05');
    expect(BLE_SSID_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a02');
    expect(BLE_PASSWORD_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a03');
    expect(BLE_COMMAND_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a04');
    expect(BLE_STATUS_UUID).toBe('e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a06');
  });

  it('pins the command, the advertise prefix and the firmware limits', () => {
    expect(PROVISION_COMMAND).toBe('PROVISION');
    expect(BLE_BOARD_NAME_PREFIX).toBe('IoTBoard-');
    expect(BLE_SSID_MAX_BYTES).toBe(32);
    expect(BLE_PASSWORD_MAX_BYTES).toBe(63);
    expect(BLE_PROVISION_TIMEOUT_MS).toBe(30_000);
  });
});

describe('parseBleStatus', () => {
  it('parses the non-terminal statuses exactly', () => {
    expect(parseBleStatus('IDLE')).toEqual({ kind: 'idle' });
    expect(parseBleStatus('CONNECTING')).toEqual({ kind: 'connecting' });
    expect(parseBleStatus('CONNECTED')).toEqual({ kind: 'connected' });
  });

  it('parses every FAILED:{reason} contract value', () => {
    expect(parseBleStatus('FAILED:BAD_AUTH')).toEqual({
      kind: 'failed',
      reason: 'BAD_AUTH',
    });
    expect(parseBleStatus('FAILED:NO_SSID')).toEqual({
      kind: 'failed',
      reason: 'NO_SSID',
    });
    expect(parseBleStatus('FAILED:TIMEOUT')).toEqual({
      kind: 'failed',
      reason: 'TIMEOUT',
    });
    expect(parseBleStatus('FAILED:ERROR')).toEqual({
      kind: 'failed',
      reason: 'ERROR',
    });
  });

  it('tolerates surrounding whitespace (notify padding)', () => {
    expect(parseBleStatus('  CONNECTED\n')).toEqual({ kind: 'connected' });
  });

  it('returns null for garbage and unknown values', () => {
    expect(parseBleStatus('')).toBeNull();
    expect(parseBleStatus('connected')).toBeNull(); // case-sensitive ASCII
    expect(parseBleStatus('CONNECT')).toBeNull();
    expect(parseBleStatus('OK')).toBeNull();
    expect(parseBleStatus('FAILED')).toBeNull();
    expect(parseBleStatus('FAILED:WIFI_DOWN')).toBeNull(); // unknown suffix
    expect(parseBleStatus('IDLE CONNECTED')).toBeNull();
    expect(parseBleStatus('BDQ9+/==')).toBeNull();
  });
});

describe('validateWifiCredentials (byte-accurate firmware limits)', () => {
  it('accepts a plain SSID with an empty password (open network)', () => {
    expect(validateWifiCredentials('MyWiFi', '')).toEqual({ ok: true });
  });

  it('accepts an SSID with password', () => {
    expect(validateWifiCredentials('MyWiFi', 'hunter2')).toEqual({ ok: true });
  });

  it('rejects an empty or whitespace-only SSID', () => {
    expect(validateWifiCredentials('', 'pass')).toEqual({
      ok: false,
      error: 'ssidRequired',
    });
    expect(validateWifiCredentials('   ', 'pass')).toEqual({
      ok: false,
      error: 'ssidRequired',
    });
  });

  it('counts UTF-8 bytes, not characters, for the SSID limit', () => {
    // 32 bytes exactly (ascii) → OK; 33 → too long.
    expect(validateWifiCredentials('a'.repeat(32), '')).toEqual({ ok: true });
    expect(validateWifiCredentials('a'.repeat(33), '')).toEqual({
      ok: false,
      error: 'ssidTooLong',
    });
    // Vietnamese: 'Bộ' is 4 bytes (B + ô[2 bytes]). 10 × 'Bộ' = 40 bytes → over.
    expect(utf8ByteLength('Bộ')).toBe(4);
    expect(validateWifiCredentials('Bộ'.repeat(10), '')).toEqual({
      ok: false,
      error: 'ssidTooLong',
    });
    // But 8 × 'Bộ' = 32 bytes exactly → still inside the limit.
    expect(validateWifiCredentials('Bộ'.repeat(8), '')).toEqual({ ok: true });
    // An emoji is 4 bytes; 8 × 🛜 = 32 bytes → OK, 9 → over.
    expect(utf8ByteLength('🛜')).toBe(4);
    expect(validateWifiCredentials('🛜'.repeat(8), '')).toEqual({ ok: true });
    expect(validateWifiCredentials('🛜'.repeat(9), '')).toEqual({
      ok: false,
      error: 'ssidTooLong',
    });
  });

  it('allows at most 63 UTF-8 bytes of password (empty allowed)', () => {
    expect(validateWifiCredentials('net', 'p'.repeat(63))).toEqual({
      ok: true,
    });
    expect(validateWifiCredentials('net', 'p'.repeat(64))).toEqual({
      ok: false,
      error: 'passwordTooLong',
    });
  });

  it('pins the UTF-8 byte length of the diacritics used above', () => {
    // 'ộ' (U+1ED9) is 3 bytes in UTF-8; a 4-byte emoji; 'Bộ' = 1 + 3 = 4.
    expect(utf8ByteLength('ộ')).toBe(3);
    expect(utf8ByteLength('Bộ')).toBe(4);
    expect(utf8ByteLength('🛜')).toBe(4);
    // 21 × 3 = 63 bytes → OK; 22 × 3 = 66 → over.
    expect(validateWifiCredentials('net', 'ộ'.repeat(21))).toEqual({
      ok: true,
    });
    expect(validateWifiCredentials('net', 'ộ'.repeat(22))).toEqual({
      ok: false,
      error: 'passwordTooLong',
    });
  });
});

describe('boardIdFromLocalName (IoTBoard-{boardId} advertise grammar)', () => {
  it('extracts the boardId from a contract-shaped local name', () => {
    expect(boardIdFromLocalName('IoTBoard-0')).toBe('0');
    expect(boardIdFromLocalName('IoTBoard-board-7')).toBe('board-7');
    expect(boardIdFromLocalName('IoTBoard-' + 'a'.repeat(32))).toBe(
      'a'.repeat(32),
    );
  });

  it('returns null for foreign names and grammar violations', () => {
    expect(boardIdFromLocalName(null)).toBeNull();
    expect(boardIdFromLocalName('')).toBeNull();
    expect(boardIdFromLocalName('IoTBoard-')).toBeNull(); // empty id
    expect(boardIdFromLocalName('ESP32 Setup')).toBeNull(); // no prefix
    expect(boardIdFromLocalName('iotboard-0')).toBeNull(); // case-sensitive
    expect(boardIdFromLocalName('IoTBoard-board 1')).toBeNull(); // space
    expect(boardIdFromLocalName('IoTBoard-' + 'a'.repeat(33))).toBeNull();
  });
});

describe('parseBleDeviceInfo (DeviceInfo READ — QR label shape)', () => {
  const VALID = JSON.stringify({
    schemaVersion: 1,
    boardId: '0',
    boardType: 'IoT_ESP32-S2R3',
  });

  it('parses the contract payload (identical shape to the QR label)', () => {
    expect(parseBleDeviceInfo(VALID)).toEqual({
      schemaVersion: 1,
      boardId: '0',
      boardType: 'IoT_ESP32-S2R3',
    });
  });

  it('returns null for garbage / non-object JSON', () => {
    expect(parseBleDeviceInfo('not json')).toBeNull();
    expect(parseBleDeviceInfo('42')).toBeNull();
    expect(parseBleDeviceInfo('null')).toBeNull();
    expect(parseBleDeviceInfo('')).toBeNull();
  });

  it('returns null for a wrong schemaVersion or missing fields', () => {
    expect(
      parseBleDeviceInfo(
        JSON.stringify({ schemaVersion: 2, boardId: '0', boardType: 't' }),
      ),
    ).toBeNull();
    expect(
      parseBleDeviceInfo(JSON.stringify({ boardId: '0', boardType: 't' })),
    ).toBeNull();
    expect(
      parseBleDeviceInfo(JSON.stringify({ schemaVersion: 1, boardId: '0' })),
    ).toBeNull();
  });

  it('returns null for boardId grammar violations and empty boardType', () => {
    expect(
      parseBleDeviceInfo(
        JSON.stringify({
          schemaVersion: 1,
          boardId: 'board 1',
          boardType: 't',
        }),
      ),
    ).toBeNull();
    expect(
      parseBleDeviceInfo(
        JSON.stringify({ schemaVersion: 1, boardId: '0', boardType: '' }),
      ),
    ).toBeNull();
  });

  it('tolerates extra fields (stripped)', () => {
    const parsed = parseBleDeviceInfo(
      JSON.stringify({
        schemaVersion: 1,
        boardId: '0',
        boardType: 'IoT_ESP32-S2R3',
        fw: '1.2.3',
      }),
    );
    expect(parsed).toEqual({
      schemaVersion: 1,
      boardId: '0',
      boardType: 'IoT_ESP32-S2R3',
    });
  });
});

describe('toBleProvisionErrorReason', () => {
  it('returns the reason of an error-like value', () => {
    expect(toBleProvisionErrorReason({ reason: 'BAD_AUTH' })).toBe('BAD_AUTH');
    expect(toBleProvisionErrorReason({ reason: 'TIMEOUT' })).toBe('TIMEOUT');
  });

  it('falls back to TRANSPORT for anything else', () => {
    expect(toBleProvisionErrorReason(undefined)).toBe('TRANSPORT');
    expect(toBleProvisionErrorReason(null)).toBe('TRANSPORT');
    expect(toBleProvisionErrorReason('boom')).toBe('TRANSPORT');
    expect(toBleProvisionErrorReason(new Error('boom'))).toBe('TRANSPORT');
    expect(toBleProvisionErrorReason({ reason: 42 })).toBe('TRANSPORT');
    expect(toBleProvisionErrorReason({ reason: 'NOT_A_REASON' })).toBe(
      'TRANSPORT',
    );
  });
});

describe('UTF-8 / Base64 codecs (write-path encoding)', () => {
  it('round-trips ASCII, Vietnamese and emoji payloads', () => {
    for (const text of [
      PROVISION_COMMAND,
      'MyWiFi',
      'Mạng nhà Bộ Đôi 🛜',
      'p@ss w0rd ộộộ',
      '',
    ]) {
      expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
    }
  });

  it('matches well-known Base64 reference vectors', () => {
    expect(utf8ToBase64('PROVISION')).toBe('UFJPVklTSU9O');
    expect(utf8ToBase64('MyWiFi')).toBe('TXlXaUZp');
    // 'Bộ' = 4 bytes UTF-8 (B + ộ[3]) → one padded group.
    expect(utf8ToBase64('Bộ')).toBe('QuG7mQ==');
    expect(utf8ToBase64('')).toBe('');
  });

  it('decodes unpadded and whitespace-padded input identically', () => {
    const padded = utf8ToBase64('CONNECTED');
    expect(padded.endsWith('=') || padded.length % 4 === 0).toBe(true);
    expect(base64ToUtf8(padded)).toBe('CONNECTED');
    expect(base64ToUtf8(padded.replace(/=/g, ''))).toBe('CONNECTED');
    expect(base64ToUtf8(` ${padded}\n`)).toBe('CONNECTED');
  });

  it('decodes an empty value to an empty string (open-network password write)', () => {
    expect(utf8ToBase64('')).toBe('');
    expect(base64ToUtf8('')).toBe('');
  });
});
