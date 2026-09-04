/**
 * Dashboard store — zustand ViewModel mirroring the dashboards file.
 *
 * The service pushes the persisted file into this store after every
 * mutation so screens re-render without polling.
 *
 * Draft edit mode (CP3): `enterEdit` copies the active dashboard's widgets
 * into `draftWidgets`; move/resize/remove mutate the draft synchronously via
 * the pure layout engine (a rejected move leaves the draft untouched, which
 * visually snaps the card back). `cancelEdit` discards the draft; persisting
 * happens through `DashboardService.applyLayout` (the app root commits the
 * draft, then calls `cancelEdit` to leave edit mode).
 *
 * CP-R3 room-scoped editor: the draft always retains ALL widgets of the
 * dashboard; `editorRoomId` selects which room's widgets are visible and
 * editable (plus globals). The pure layout engine is room-aware, so draft
 * moves/resizes never touch other rooms' widgets, and Save persists the
 * whole draft atomically.
 */

import { create } from 'zustand';

import type { WidgetConfig, WidgetSize } from '@modules/widgets/api';

import type { Dashboard, DashboardsFile } from '../domain/dashboardSchema';
import {
  applyMove,
  applyResize,
  compactVertical,
  SIZE_DIMENSIONS,
} from '../domain/layout';

interface DashboardUiState {
  /** All persisted dashboards. */
  dashboards: Dashboard[];
  /** Id of the currently displayed dashboard. */
  activeId: string;
  /** Id of the active room filter (`null` = no valid room selected). */
  activeRoomId: string | null;
  /** True when the user is rearranging widgets (transient, not persisted). */
  editMode: boolean;
  /**
   * Working copy of the active dashboard's widgets while `editMode` is true
   * (`null` when not editing). Holds ALL widgets — other rooms included —
   * so a Save preserves them; the editor UI filters by `editorRoomId`.
   */
  draftWidgets: WidgetConfig[] | null;
  /**
   * Room being edited while `editMode` is true (CP-R3). The editor renders
   * the draft filtered to this room + global widgets. `null` = unset
   * (legacy callers / no room exists).
   */
  editorRoomId: string | null;
  /** Replace the whole file (called by the service after mutations). */
  setFile(file: DashboardsFile): void;
  /**
   * Start editing: copies the widgets of `dashboardId` into the draft and
   * records `roomId` as the room being edited. No-op when a draft is
   * already open.
   */
  enterEdit(dashboardId: string, roomId?: string): void;
  /** Switch the room being edited without resetting the draft (CP-R3). */
  setEditorRoom(roomId: string): void;
  /** Discard the draft and leave edit mode. */
  cancelEdit(): void;
  /** Move a draft widget to (x, y); rejected moves leave the draft as-is. */
  moveWidget(widgetId: string, x: number, y: number): boolean;
  /** Resize a draft widget to a supported size; rejects when blocked. */
  resizeWidget(widgetId: string, size: WidgetSize): boolean;
  /** Remove a draft widget (the layout compacts vertically, room-aware). */
  removeWidget(widgetId: string): void;
  /**
   * Rebind a draft widget to another device capability (CP-R3 draft op).
   * No-op outside edit mode / for unknown widgets.
   */
  rebindDraftWidget(
    widgetId: string,
    deviceId: string,
    capability: string,
  ): void;
  /** Append a widget to the draft (built + placed by the service). */
  addDraftWidget(widget: WidgetConfig): void;
  /** All dashboards (convenience selector). */
  getDashboards(): Dashboard[];
  /** The active dashboard id. */
  getActiveId(): string;
  /** The active room filter id. */
  getActiveRoomId(): string | null;
}

/**
 * Authoritative store guards (wired by the dashboard service, fix cycle 1):
 * the room-scoped rebind check keeps a draft rebind from binding a
 * room-scoped widget to a device of a different room — the store alone has
 * no devices knowledge, so the service injects the predicate.
 */
export interface DashboardStoreGuards {
  /**
   * `true` when the widget (living in `widgetRoomId`; `null`/`undefined` =
   * global widget) may rebind to `deviceId`. When omitted, rebinds are
   * unrestricted (legacy behavior for plain store consumers).
   */
  readonly canRebindToRoom?: (
    widgetRoomId: string | null | undefined,
    deviceId: string,
  ) => boolean;
}

/** Create the dashboard UI zustand store. */
export function createDashboardStore(
  initial: DashboardsFile,
  guards?: DashboardStoreGuards,
) {
  return create<DashboardUiState>((set, get) => ({
    dashboards: initial.dashboards,
    activeId: initial.activeId,
    activeRoomId: initial.activeRoomId ?? null,
    editMode: false,
    draftWidgets: null,
    editorRoomId: null,
    setFile: file =>
      set({
        dashboards: file.dashboards,
        activeId: file.activeId,
        activeRoomId: file.activeRoomId ?? null,
      }),
    enterEdit: (dashboardId, roomId) => {
      if (get().editMode) {
        return;
      }
      const dashboard = get().dashboards.find(d => d.id === dashboardId);
      if (!dashboard) {
        return;
      }
      set({
        editMode: true,
        draftWidgets: dashboard.widgets.map(w => ({ ...w })),
        editorRoomId: roomId ?? null,
      });
    },
    setEditorRoom: roomId => {
      if (!get().editMode) {
        return;
      }
      set({ editorRoomId: roomId });
    },
    cancelEdit: () =>
      set({ editMode: false, draftWidgets: null, editorRoomId: null }),
    moveWidget: (widgetId, x, y) => {
      const draft = get().draftWidgets;
      if (!draft) {
        return false;
      }
      const moved = applyMove(draft, widgetId, x, y);
      if (!moved.ok) {
        return false;
      }
      set({ draftWidgets: moved.value });
      return true;
    },
    resizeWidget: (widgetId, size) => {
      const draft = get().draftWidgets;
      if (!draft) {
        return false;
      }
      const widget = draft.find(w => w.id === widgetId);
      if (!widget) {
        return false;
      }
      const dims = SIZE_DIMENSIONS[size];
      const resized = applyResize(draft, widgetId, dims.width, dims.height);
      if (!resized.ok) {
        return false;
      }
      set({ draftWidgets: resized.value });
      return true;
    },
    removeWidget: widgetId => {
      const draft = get().draftWidgets;
      if (!draft) {
        return;
      }
      set({
        draftWidgets: compactVertical(draft.filter(w => w.id !== widgetId)),
      });
    },
    rebindDraftWidget: (widgetId, deviceId, capability) => {
      const draft = get().draftWidgets;
      if (!draft) {
        return;
      }
      const widget = draft.find(w => w.id === widgetId);
      if (!widget) {
        return;
      }
      // Room-scoped binding authority (fix cycle 1): a cross-room rebind is
      // rejected WITHOUT mutating the draft — the UI filters candidates, and
      // the service re-validates at persist time; this guard keeps the draft
      // clean for programmatic callers too.
      if (
        guards?.canRebindToRoom &&
        !guards.canRebindToRoom(widget.roomId, deviceId)
      ) {
        return;
      }
      set({
        draftWidgets: draft.map(w =>
          w.id === widgetId ? { ...w, binding: { deviceId, capability } } : w,
        ),
      });
    },
    addDraftWidget: widget => {
      const draft = get().draftWidgets;
      if (!draft) {
        return;
      }
      set({ draftWidgets: [...draft, widget] });
    },
    getDashboards: () => get().dashboards,
    getActiveId: () => get().activeId,
    getActiveRoomId: () => get().activeRoomId,
  }));
}

/** The zustand store instance shape returned by {@link createDashboardStore}. */
export type DashboardStore = ReturnType<typeof createDashboardStore>;
