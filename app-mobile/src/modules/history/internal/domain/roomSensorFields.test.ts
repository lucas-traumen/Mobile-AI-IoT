/**
 * roomSensorFields tests (CP4 + CP-R5).
 *
 * Verifies: the Flux field list for a room = the sensor capabilities of its
 * `telemetry-sensor` devices (relay devices excluded); `null` = no valid
 * active room (empty — the room-level "Tất cả" view was removed); unique +
 * stable order; a room without sensor devices → empty; and the CP-R5
 * `historyQueryForRoom` value object (fields + deviceIds, null short-circuit).
 */

import type { CapabilityDef, Device } from '@modules/devices/api';

import { historyQueryForRoom, sensorFieldsForRoom } from './roomSensorFields';

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
    capabilities: ['temperature', 'humidity'],
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

describe('sensorFieldsForRoom', () => {
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

  it('null = no valid active room → empty (no room-level Tất cả, CP-R3)', () => {
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
});

describe('historyQueryForRoom (CP-R5)', () => {
  it('builds the query object with the room fields + device ids', () => {
    expect(
      historyQueryForRoom(DEVICES, CAPABILITIES, 'room-living', '24h'),
    ).toEqual({
      measurement: 'sensors',
      range: '24h',
      fields: ['temperature', 'humidity'],
      deviceIds: ['sensor-01'],
    });
  });

  it('lists every telemetry device of the room (same-field devices included)', () => {
    const twoSensors: readonly Device[] = [
      ...DEVICES,
      {
        id: 'sensor-01b',
        name: 'Cảm biến phụ phòng khách',
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
    expect(query?.deviceIds).toEqual(['sensor-01', 'sensor-01b']);
    expect(query?.fields).toEqual(['temperature', 'humidity']);
  });

  it('returns null for a room without telemetry sensors (no query issued)', () => {
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
