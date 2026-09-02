/**
 * Dashboard module — public facade.
 *
 * The only entry point other modules may use. Everything else lives in
 * `internal/` and must not be imported across modules (enforced by
 * `eslint-plugin-boundaries`).
 *
 * Exposes the pure layout engine, the persistence schemas + seeds, the
 * AsyncStorage repository and the dashboard service (CRUD dashboards +
 * widget editing with registry validation + cascade removal). Also exports
 * the shared `RoomSelector` UI component (used by History too).
 */

import type { Result } from '@core/errors';

import type { WidgetSize } from '@modules/widgets/api';

import type { Dashboard } from '../internal/domain/dashboardSchema';
import type {
  AddWidgetInput,
  WidgetBindingInput,
} from '../internal/services/dashboardService';
import type { DashboardStore } from '../internal/ui/dashboardStore';
import type { WidgetConfig } from '@modules/widgets/api';

/** Layout engine helpers (pure, all returns {@link Result} on failure). */
export {
  applyMove,
  applyResize,
  collides,
  compactVertical,
  findFreeSlot,
  inBounds,
  SIZE_DIMENSIONS,
  validateLayout,
} from '../internal/domain/layout';
export type { GridCell } from '../internal/domain/layout';
/** Grid pixel-math helpers (pure, UI layout — screen-agnostic). */
export {
  computeGridMetrics,
  FALLBACK_GRID_CANVAS_WIDTH,
  GRID_GAP,
  GRID_PADDING,
  GRID_ROW_HEIGHT,
  GRID_ROW_HEIGHT_MAX,
  gridContentHeight,
  pixelRect,
  resolveCanvasWidth,
  snapToGrid,
} from '../internal/domain/gridMetrics';
export type { GridPixelRect } from '../internal/domain/gridMetrics';
/** Dashboards persistence schemas + parsing. */
export type {
  Dashboard,
  DashboardsFile,
} from '../internal/domain/dashboardSchema';
export {
  DashboardSchema,
  DashboardsFileSchema,
  parseDashboardsFile,
} from '../internal/domain/dashboardSchema';
/** First-run seed + constants. */
export {
  DEFAULT_DASHBOARD_ID,
  DEFAULT_DASHBOARD_NAME,
  defaultDashboardsFile,
} from '../internal/domain/seeds';
/** Pure room filter helper (null → all; id → room widgets + global widgets). */
export { filterWidgetsForRoom } from '../internal/domain/roomFilter';
/**
 * Pure section grouping (M2 label fix): visible widgets → environment
 * ("Môi trường": sensor-value + history-chart) / devices ("Thiết bị":
 * switch + others) groups + each section's rebase row and compact content
 * height, so the screen can render a label pill directly above its own grid.
 */
export {
  groupWidgets,
  sectionBaseY,
  sectionContentHeight,
} from '../internal/domain/sectionGroups';
/** AsyncStorage persistence adapter. */
export type { DashboardRepository } from '../internal/data/dashboardRepository';
export { AsyncStorageDashboardRepository } from '../internal/data/dashboardRepository';
/** Dashboard service. */
export { DashboardServiceImpl } from '../internal/services/dashboardService';
/** Input for adding a widget through {@link DashboardService.addWidget}. */
export type {
  AddWidgetInput,
  WidgetBindingInput,
} from '../internal/services/dashboardService';
/** Dashboard mirror store. */
export { createDashboardStore } from '../internal/ui/dashboardStore';
export type { DashboardStore } from '../internal/ui/dashboardStore';
/**
 * Controlled room navigation (☰ expand + non-wrapping quick chip strip +
 * centered full-list modal). Shared UI: the Dashboard screen hosts it and
 * the History screen reuses it for the same one-shared-active-room model —
 * both screens own their selection side effects through `onSelectRoom`.
 */
export { RoomSelector } from '../ui/RoomSelector';

/**
 * Dashboard service — CRUD dashboards + widget editing.
 *
 * Every mutation validates against the widget registry, applies the pure
 * layout engine, persists through the repository and publishes
 * `dashboards:changed { activeId }`.
 */
export interface DashboardService {
  /** The zustand store mirrored to the UI (subscribe for re-renders). */
  getStore(): DashboardStore;
  /** Load the persisted file (seeds defaults on first run). */
  load(): Promise<Result<void>>;
  /** All dashboards. */
  getDashboards(): readonly Dashboard[];
  /** The active dashboard id. */
  getActiveId(): string;
  /** The active dashboard (dashboards[0] fallback). */
  getActiveDashboard(): Dashboard;
  /** Find a dashboard by id (undefined when unknown). */
  findDashboard(id: string): Dashboard | undefined;
  /** Create a dashboard (id generated); becomes active. */
  createDashboard(name: string): Promise<Result<void>>;
  /**
   * Delete a dashboard. Rejected when it is the last one; the first
   * remaining dashboard becomes active when the active one was deleted.
   */
  deleteDashboard(id: string): Promise<Result<void>>;
  /** Set the dashboard shown by the UI (must exist). */
  setActiveDashboard(id: string): Promise<Result<void>>;
  /** The active room filter id (`null` = Tất cả). */
  getActiveRoomId(): string | null;
  /**
   * Set the active room filter (`null` = Tất cả). Non-null ids must exist
   * (checked through the injected room predicate when wired).
   */
  setActiveRoom(id: string | null): Promise<Result<void>>;
  /**
   * Add a widget (registry-validated type + binding); placed in the first
   * free slot at the definition's first supported size.
   */
  addWidget(dashboardId: string, input: AddWidgetInput): Promise<Result<void>>;
  /** Remove a widget + compact the layout vertically. */
  removeWidget(dashboardId: string, widgetId: string): Promise<Result<void>>;
  /** Move a widget to (x, y) — bounds + overlap rejected. */
  moveWidget(
    dashboardId: string,
    widgetId: string,
    x: number,
    y: number,
  ): Promise<Result<void>>;
  /** Resize a widget — size must be supported; relocates when blocked. */
  resizeWidget(
    dashboardId: string,
    widgetId: string,
    size: WidgetSize,
  ): Promise<Result<void>>;
  /**
   * Replace a dashboard's widget list atomically (draft edit mode commit):
   * validates every widget against the registry + the layout engine, then
   * persists + publishes. Nothing is applied on any error.
   */
  applyLayout(
    dashboardId: string,
    widgets: readonly WidgetConfig[],
  ): Promise<Result<void>>;
  /** Rebind a widget to a different device capability (lost-binding repair). */
  updateWidgetBinding(
    dashboardId: string,
    widgetId: string,
    binding: WidgetBindingInput,
  ): Promise<Result<void>>;
  /**
   * Retarget / globalize widgets of a removed room (CP5): `toId` non-null
   * moves them to another room; `null` makes them global.
   */
  migrateWidgetsFromRoom(
    fromId: string,
    toId: string | null,
  ): Promise<Result<void>>;
  /**
   * Remove every widget bound to a device (across all dashboards),
   * compacting each affected dashboard. Cascade for `devices:changed`.
   */
  removeWidgetsForDevice(deviceId: string): Promise<Result<void>>;
}
