/**
 * First-run seed data for the devices module.
 *
 * Room-first seed (V2): three rooms (Phòng khách / Phòng ngủ / Bếp) with
 * Ionicons icons, TWO separate logical sensor registrations per room — one
 * for `temperature` (Nhiệt độ) and one for `humidity` (Độ ẩm), per the
 * approved room-sensor rework (one visible sensor = one metric) — and the
 * three hardware relays (Đèn / Quạt / Bơm) in Phòng khách. The capability
 * catalog seeds to the built-ins.
 *
 * Seed ids are stable (`room-living`, `sensor-temp-01`, …) so other modules'
 * seeds (dashboard layout) can reference them. Counters start truthfully at
 * `2/10` sensors per seeded room.
 */

import type { DevicesSnapshot } from './devices';
import { BUILT_IN_CAPABILITIES } from './devices';

/** Seed room id: Phòng khách. */
export const SEED_ROOM_LIVING_ID = 'room-living';

/** Seed snapshot used on first run (nothing persisted yet). */
export function seedDevices(): DevicesSnapshot {
  return {
    rooms: [
      {
        id: SEED_ROOM_LIVING_ID,
        name: 'Phòng khách',
        order: 0,
        icon: 'home-outline',
      },
      { id: 'room-bedroom', name: 'Phòng ngủ', order: 1, icon: 'bed-outline' },
      { id: 'room-kitchen', name: 'Bếp', order: 2, icon: 'restaurant-outline' },
    ],
    devices: [
      {
        id: 'sensor-temp-01',
        name: 'Nhiệt độ',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'sensor-hum-01',
        name: 'Độ ẩm',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'sensor',
        capabilities: ['humidity'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'sensor-temp-02',
        name: 'Nhiệt độ',
        roomId: 'room-bedroom',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'sensor-hum-02',
        name: 'Độ ẩm',
        roomId: 'room-bedroom',
        type: 'sensor',
        capabilities: ['humidity'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'sensor-temp-03',
        name: 'Nhiệt độ',
        roomId: 'room-kitchen',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'sensor-hum-03',
        name: 'Độ ẩm',
        roomId: 'room-kitchen',
        type: 'sensor',
        capabilities: ['humidity'],
        binding: { kind: 'telemetry-sensor' },
      },
      {
        id: 'relay-1',
        name: 'Đèn',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'relay',
        capabilities: ['switch'],
        binding: { kind: 'relay', index: 1 },
      },
      {
        id: 'relay-2',
        name: 'Quạt',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'relay',
        capabilities: ['switch'],
        binding: { kind: 'relay', index: 2 },
      },
      {
        id: 'relay-3',
        name: 'Bơm',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'relay',
        capabilities: ['switch'],
        binding: { kind: 'relay', index: 3 },
      },
    ],
    capabilities: [...BUILT_IN_CAPABILITIES],
  };
}
