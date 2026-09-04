/**
 * Dashboard section grouping — pure split of the visible widgets into the
 * two dashboard sections (M2 label fix): "Môi trường" (`sensor-value`
 * cards) and "Thiết bị" (`switch` + every other type). The retired
 * `history-chart` type (approved room-sensor rework — History is a derived
 * tab) is no longer part of the split.
 *
 * Groups keep the original widget order and the persisted ABSOLUTE layout
 * coords. The screen renders each non-empty group as its own section — a
 * label pill directly above its own `DashboardGrid` — and passes the
 * section's rebase row ({@link sectionBaseY}) as the grid's `layoutYOffset`
 * so the group's top card sits at the top of its own grid while persisted
 * coords stay dashboard-absolute.
 *
 * Pure + platform-independent.
 */

import type { WidgetConfig } from '@modules/widgets/api';

import { gridContentHeight } from './gridMetrics';

/** The two dashboard sections (label text lives in `STRINGS.dashboard`). */
export interface WidgetSections {
  /** Environment cards: `sensor-value`. */
  readonly environment: readonly WidgetConfig[];
  /** Device cards: `switch` + all other widget types. */
  readonly devices: readonly WidgetConfig[];
}

/** Widget types that belong to the "Môi trường" section. */
const ENVIRONMENT_TYPES: readonly string[] = ['sensor-value'];

/**
 * Split visible widgets into the environment/devices sections (order-
 * preserving). A section may be empty — the screen hides empty sections.
 *
 * @param widgets - the room-filtered visible widgets.
 */
export function groupWidgets(widgets: readonly WidgetConfig[]): WidgetSections {
  const environment = widgets.filter(widget =>
    ENVIRONMENT_TYPES.includes(widget.type),
  );
  const devices = widgets.filter(
    widget => !ENVIRONMENT_TYPES.includes(widget.type),
  );
  return { environment, devices };
}

/**
 * Minimum persisted row of a widget group — the `layoutYOffset` the screen
 * passes to `DashboardGrid` so the group's top card sits at the top of its
 * own grid (the group renders compactly without a dead leading row).
 *
 * @param widgets - a section group (empty → 0).
 */
export function sectionBaseY(widgets: readonly WidgetConfig[]): number {
  if (widgets.length === 0) {
    return 0;
  }
  return Math.min(...widgets.map(widget => widget.layout.y));
}

/**
 * Exact content height of one section grid (points): `gridContentHeight`
 * measured on the REBASED group (rows relative to the section's own top) so
 * no dead leading/trailing row is reserved when the group does not start at
 * persisted row 0.
 *
 * @param widgets - a section group (empty → one fallback row).
 * @param metrics - grid metrics from `computeGridMetrics`.
 */
export function sectionContentHeight(
  widgets: readonly WidgetConfig[],
  metrics: {
    readonly padding: number;
    readonly gap: number;
    readonly rowHeight: number;
  },
): number {
  const baseY = sectionBaseY(widgets);
  return gridContentHeight(
    widgets.map(widget => ({
      layout: {
        y: widget.layout.y - baseY,
        height: widget.layout.height,
      },
    })),
    metrics,
  );
}
