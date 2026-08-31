/**
 * First-run seed data for the dashboard module.
 *
 * Room-first seed (V2): two sensor-value widgets (temp + humidity, 1x1 each
 * in row 0) bound to Phòng khách, one `room-device-list` widget (2x1, row 1)
 * for Phòng khách and a global connection widget (2x1, row 2). Widget ids
 * and the dashboard id are stable so tests can reference them.
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
            id: 'w-room-devices',
            type: 'room-device-list',
            roomId: SEED_LIVING_ROOM_ID,
            layout: { x: 0, y: 1, width: 2, height: 1 },
          },
          {
            id: 'w-conn',
            type: 'connection',
            layout: { x: 0, y: 2, width: 2, height: 1 },
          },
        ],
      },
    ],
    activeId: DEFAULT_DASHBOARD_ID,
    activeRoomId: null,
  };
}
