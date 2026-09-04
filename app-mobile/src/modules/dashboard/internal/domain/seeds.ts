/**
 * First-run seed data for the dashboard module.
 *
 * Approved Light/Dark design seed: four widgets for Phòng khách — two
 * sensor-value cards (temp + humidity, 1x1 each in row 0) bound to the
 * environment sensor, and two switch cards bound to the seeded relays
 * (w-light → Đèn relay-1, w-fan → Quạt relay-2, 1x1 each SIDE BY SIDE in
 * row 1 — the wide-canvas default device layout). The `room-device-list`
 * TYPE stays registered (Add Widget can still add it); it is just not part
 * of the seed. The built-in `connection` widget remains retired (Phase 1):
 * not seeded, not registrable, legacy persisted instances are migrated out
 * on load (see DashboardServiceImpl). Widget ids and the dashboard id are
 * stable so tests can reference them.
 *
 * `activeRoomId` defaults to `null` ("Tất cả" — every widget visible).
 */

import { collides } from './layout';
import type { DashboardsFile } from './dashboardSchema';
import type { WidgetConfig } from '@modules/widgets/api';

/** Default dashboard id ('main'). */
export const DEFAULT_DASHBOARD_ID = 'main';

/** Default dashboard name ('Trang chủ'). */
export const DEFAULT_DASHBOARD_NAME = 'Trang chủ';

/** Seed room id for Phòng khách (matches the devices seed). */
const SEED_LIVING_ROOM_ID = 'room-living';

/** The legacy (pre-responsive) seed arrangement of the two relay cards. */
const LEGACY_LIGHT_LAYOUT = { x: 0, y: 1, width: 2, height: 1 } as const;
const LEGACY_FAN_LAYOUT = { x: 0, y: 2, width: 2, height: 1 } as const;

/** The approved side-by-side arrangement (normalization target). */
const NORMALIZED_LIGHT_LAYOUT = { x: 0, y: 1, width: 1, height: 1 } as const;
const NORMALIZED_FAN_LAYOUT = { x: 1, y: 1, width: 1, height: 1 } as const;

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
            binding: { deviceId: 'sensor-temp-01', capability: 'temperature' },
            layout: { x: 0, y: 0, width: 1, height: 1 },
          },
          {
            id: 'w-hum',
            type: 'sensor-value',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'sensor-hum-01', capability: 'humidity' },
            layout: { x: 1, y: 0, width: 1, height: 1 },
          },
          {
            id: 'w-light',
            type: 'switch',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'relay-1', capability: 'switch' },
            layout: { x: 0, y: 1, width: 1, height: 1 },
          },
          {
            id: 'w-fan',
            type: 'switch',
            roomId: SEED_LIVING_ROOM_ID,
            binding: { deviceId: 'relay-2', capability: 'switch' },
            layout: { x: 1, y: 1, width: 1, height: 1 },
          },
        ],
      },
    ],
    activeId: DEFAULT_DASHBOARD_ID,
    activeRoomId: null,
  };
}

/**
 * True when `widget` is EXACTLY the untouched legacy seed relay card: the
 * seed id, the switch type, the seed binding, no custom title, and the
 * exact legacy default layout. Any difference (a moved, resized, renamed
 * or re-bound card) fails the check — user-customized layouts are never
 * rewritten.
 */
function isUntouchedLegacyRelay(
  widget: WidgetConfig | undefined,
  id: string,
  deviceId: string,
  legacy: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): boolean {
  return (
    widget !== undefined &&
    widget.id === id &&
    widget.type === 'switch' &&
    widget.title === undefined &&
    widget.binding?.deviceId === deviceId &&
    widget.binding?.capability === 'switch' &&
    widget.layout.x === legacy.x &&
    widget.layout.y === legacy.y &&
    widget.layout.width === legacy.width &&
    widget.layout.height === legacy.height
  );
}

/**
 * CONDITIONAL legacy-seed normalization (pure): when BOTH relay cards are
 * the untouched legacy seed arrangement (w-light/w-fan, switch bindings to
 * relay-1/relay-2, no custom title, the exact original default 2x1
 * coordinates), rewrite ONLY those two layouts to the approved side-by-side
 * 1x1 pair. In every other case the input array is returned unchanged:
 * - either card customized (moved/resized/renamed/re-bound) → no-op,
 * - the target cells occupied by any OTHER widget → no-op (never overlaps),
 * - already normalized → the legacy condition no longer matches → no-op
 *   (idempotent).
 *
 * @returns the normalized widget list, or the ORIGINAL array reference when
 *   nothing matched (the service only persists on a real change).
 */
export function normalizeLegacySeedLayouts(
  widgets: readonly WidgetConfig[],
): readonly WidgetConfig[] {
  const light = widgets.find(widget => widget.id === 'w-light');
  const fan = widgets.find(widget => widget.id === 'w-fan');
  const legacyPair =
    isUntouchedLegacyRelay(light, 'w-light', 'relay-1', LEGACY_LIGHT_LAYOUT) &&
    isUntouchedLegacyRelay(fan, 'w-fan', 'relay-2', LEGACY_FAN_LAYOUT);
  if (!legacyPair) {
    // Same REFERENCE on no-op: the service only persists when the returned
    // array is not the input array (cheap change detection).
    return widgets;
  }
  // Never create an overlap: if any OTHER widget already occupies one of
  // the normalized target cells, leave the legacy arrangement untouched.
  const targets = [NORMALIZED_LIGHT_LAYOUT, NORMALIZED_FAN_LAYOUT];
  for (const other of widgets) {
    if (other.id === 'w-light' || other.id === 'w-fan') {
      continue;
    }
    for (const target of targets) {
      if (collides(other.layout, target)) {
        return widgets;
      }
    }
  }
  return widgets.map(widget => {
    if (widget.id === 'w-light') {
      return { ...widget, layout: { ...NORMALIZED_LIGHT_LAYOUT } };
    }
    if (widget.id === 'w-fan') {
      return { ...widget, layout: { ...NORMALIZED_FAN_LAYOUT } };
    }
    return widget;
  });
}
