/**
 * roomSensorFields tests (approved room-sensor contract).
 *
 * Verifies: the Flux field list for a room = the room's PROJECTED sensor
 * registrations (one visible sensor = one metric; a legacy multi-capability
 * board contributes each of its capabilities; relay devices excluded);
 * `null` = no valid active room (empty); unique + stable order; a room
 * without registrations → empty; and the `historyQueryForRoom` value object
 * (fields + roomId, null short-circuit).
 */

import type { CapabilityDef, Device } from '@modules/devices/api';

import { historyQueryForRoom, sensorFieldsForRoom } from './roomSensorFields';

// The devices facade transitively imports the devices repository
// (async-storage) — storage is not under test here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const CAPABILITIES: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor', unit: '°C' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', unit: '%' },
  { type: 'switch', label: 'Công tắc', kind: 'switch' },
  { type: 'pressure', label: 'Áp suất', kind: 'sensor', unit: 'hPa' },
];

const DEVICES: readonly Device[] = [
  {
    id: 'sensor-01',
    name: 'Cảm biến phòng khách',
    roomId: 'room-living',
    type: 'sensor',
    capabilities: ['temperature', 'humidity'], // legacy multi-metric board
    binding: { kind: 'telemetry-sensor' },
  },
  {
    id: 'relay-1',
    name: 'Đèn phòng khách',
    roomId: 'room-living',
    type: 'relay',
    capabilities: ['switch'],
    binding: { kind: 'relay', index: 1 },
  },
  {
    id: 'sensor-02',
    name: 'Cảm biến bếp',
    roomId: 'room-kitchen',
    type: 'sensor',
    capabilities: ['temperature', 'pressure'],
    binding: { kind: 'telemetry-sensor' },
  },
  {
    id: 'sensor-free',
    name: 'Cảm biến chưa xếp phòng',
    type: 'sensor',
    capabilities: ['humidity'],
    binding: { kind: 'telemetry-sensor' },
  },
];

describe('sensorFieldsForRoom (projected registrations)', () => {
  it('returns the room sensor fields (relay devices excluded)', () => {
    expect(sensorFieldsForRoom(DEVICES, CAPABILITIES, 'room-living')).toEqual([
      'temperature',
      'humidity',
    ]);
  });

  it('includes custom catalog capabilities of the room', () => {
    expect(sensorFieldsForRoom(DEVICES, CAPABILITIES, 'room-kitchen')).toEqual([
      'temperature',
      'pressure',
    ]);
  });

  it('null = no valid active room → empty (no room-level Tất cả)', () => {
    expect(sensorFieldsForRoom(DEVICES, CAPABILITIES, null)).toEqual([]);
  });

  it('returns an empty list for a room without sensor devices', () => {
    const roomOnlyRelays: readonly Device[] = [
      {
        id: 'relay-9',
        name: 'Rơ le',
        roomId: 'room-empty',
        type: 'relay',
        capabilities: ['switch'],
        binding: { kind: 'relay', index: 2 },
      },
    ];
    expect(
      sensorFieldsForRoom(roomOnlyRelays, CAPABILITIES, 'room-empty'),
    ).toEqual([]);
    expect(sensorFieldsForRoom([], CAPABILITIES, 'room-living')).toEqual([]);
  });

  it('ignores device capabilities absent from the sensor catalog', () => {
    const device: Device = {
      id: 'sensor-x',
      name: 'Kỳ lạ',
      roomId: 'room-living',
      type: 'sensor',
      capabilities: ['temperature', 'switch', 'mystery'],
      binding: { kind: 'telemetry-sensor' },
    };
    expect(sensorFieldsForRoom([device], CAPABILITIES, 'room-living')).toEqual([
      'temperature',
    ]);
  });

  it('the same field in another room does not leak into this room', () => {
    const devices: readonly Device[] = [
      {
        id: 's-a',
        name: 'Nhiệt độ A',
        roomId: 'room-a',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 's-b',
        name: 'Nhiệt độ B',
        roomId: 'room-b',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
    ];
    expect(sensorFieldsForRoom(devices, CAPABILITIES, 'room-a')).toEqual([
      'temperature',
    ]);
    expect(sensorFieldsForRoom(devices, CAPABILITIES, 'room-b')).toEqual([
      'temperature',
    ]);
  });
});

describe('historyQueryForRoom (roomId + _field identity)', () => {
  it('builds the query object with the room fields + the roomId filter', () => {
    expect(
      historyQueryForRoom(DEVICES, CAPABILITIES, 'room-living', '24h'),
    ).toEqual({
      measurement: 'sensors',
      range: '24h',
      fields: ['temperature', 'humidity'],
      roomId: 'room-living',
    });
  });

  it('fields come from projected registrations (duplicates collapse)', () => {
    const twoSensors: readonly Device[] = [
      ...DEVICES,
      {
        id: 'sensor-01b',
        name: 'Nhiệt độ phụ phòng khách',
        roomId: 'room-living',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
    ];
    const query = historyQueryForRoom(
      twoSensors,
      CAPABILITIES,
      'room-living',
      '1h',
    );
    // The field list stays unique per room (one temperature series), while
    // the projected registration count would be 3 (2×temp + humidity).
    expect(query?.fields).toEqual(['temperature', 'humidity']);
  });

  it('returns null for a room without registered sensors (no query issued)', () => {
    expect(
      historyQueryForRoom(
        [DEVICES[1]!, DEVICES[3]!],
        CAPABILITIES,
        'room-living',
        '1h',
      ),
    ).toBeNull();
  });

  it('returns null when there is no valid active room', () => {
    expect(historyQueryForRoom(DEVICES, CAPABILITIES, null, '7d')).toBeNull();
  });
});
