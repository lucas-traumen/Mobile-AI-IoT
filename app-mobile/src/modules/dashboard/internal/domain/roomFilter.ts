/**
 * Room filtering — which widgets are visible under a room filter.
 *
 * Pure, synchronous, no dependencies: the dashboard screen applies this to
 * the active dashboard's widgets before rendering.
 *
 * - `roomId === null` ("Tất cả") → every widget.
 * - `roomId === '<id>'` → widgets of that room + widgets without a room
 *   (global widgets show under every room filter).
 */

import type { WidgetConfig } from '@modules/widgets/api';

/**
 * Filter widgets for a room.
 *
 * @param widgets - the dashboard's widgets (order preserved).
 * @param roomId - room to filter by; `null` disables filtering.
 * @returns the visible widgets.
 */
export function filterWidgetsForRoom(
  widgets: readonly WidgetConfig[],
  roomId: string | null,
): WidgetConfig[] {
  if (roomId === null) {
    return [...widgets];
  }
  return widgets.filter(
    widget => widget.roomId === roomId || widget.roomId === undefined,
  );
}
