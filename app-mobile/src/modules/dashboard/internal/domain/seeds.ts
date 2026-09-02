/**
 * First-run seed data for the dashboard module.
 *
 * Pastel visual upgrade seed (M2): four widgets for Phòng khách — two
 * sensor-value cards (temp + humidity, 1x1 each in row 0) bound to the
 * environment sensor, and two switch cards bound to the seeded relays
 * (w-light → Đèn relay-1, w-fan → Quạt relay-2, 2x1 each in rows 1–2). The
 * `room-device-list` TYPE stays registered (Add Widget can still add it);
 * it is just no longer part of the seed (replaced by the labeled switch
 * cards). The built-in `connection` widget remains retired (Phase 1): not
 * seeded, not registrable, legacy persisted instances are migrated out on
 * load (see DashboardServiceImpl). Widget ids and the dashboard id are
 * stable so tests can reference them.
 *
 * `activeRoomId` defaults to `null` ("Tất cả" — every widget visible).
 */

import type { DashboardsFile } from './dashboardSchema';

/** Default dashboard id ('main'). */
export const DEFAULT_DASHBOARD_ID = 'main';

/** Default dashboard name ('Trang chủ'). */
export const DEFAULT_DASHBOARD_NAME = 'Trang chủ';

/** Seed room id for Phòng khách (matches the devices seed). */
const SEED_LIVING_ROOM_ID = 'room-living';

/** Seed dashboards file used on first run (nothing persisted yet). */
export function defaultDashboardsFile(): DashboardsFile {
  return {
    dashboards: [
      {
        id: DEFAULT_DASHBOARD_ID,
        name: DEFAULT_DASHBOARD_NAME,
        widgets: [
          {
            id: 'w-temp',
            type: 'sensor-value',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'sensor-01', capability: 'temperature' },
            layout: { x: 0, y: 0, width: 1, height: 1 },
          },
          {
            id: 'w-hum',
            type: 'sensor-value',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'sensor-01', capability: 'humidity' },
            layout: { x: 1, y: 0, width: 1, height: 1 },
          },
          {
            id: 'w-light',
            type: 'switch',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'relay-1', capability: 'switch' },
            layout: { x: 0, y: 1, width: 2, height: 1 },
          },
          {
            id: 'w-fan',
            type: 'switch',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'relay-2', capability: 'switch' },
            layout: { x: 0, y: 2, width: 2, height: 1 },
          },
        ],
      },
    ],
    activeId: DEFAULT_DASHBOARD_ID,
    activeRoomId: null,
  };
}
