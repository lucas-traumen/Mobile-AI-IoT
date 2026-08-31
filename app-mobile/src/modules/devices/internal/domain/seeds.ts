/**
 * First-run seed data for the devices module.
 *
 * Room-first seed (V2): three rooms (Phòng khách / Phòng ngủ / Bếp) with
 * Ionicons icons, one environment sensor (temperature + humidity) and the
 * three hardware relays (Đèn / Quạt / Bơm) — all four devices live in
 * Phòng khách. The capability catalog seeds to the built-ins.
 *
 * Seed ids are stable (`room-living`, `sensor-01`, …) so other modules'
 * seeds (dashboard layout) can reference them.
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
        id: 'sensor-01',
        name: 'Cảm biến môi trường',
        roomId: SEED_ROOM_LIVING_ID,
        type: 'sensor',
        capabilities: ['temperature', 'humidity'],
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
