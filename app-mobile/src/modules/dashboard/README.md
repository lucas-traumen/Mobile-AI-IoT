# dashboard module

Dashboards, room-aware grid layout engine, persistence and UI.

## Public API (`api/index.ts`)

- `DashboardService` — `load()`, `createDashboard(name)`, `deleteDashboard(id)`
  (last dashboard protected), `setActiveDashboard(id)`, `setActiveRoom(roomId)`
  (persisted, shared with History), `addWidget(input)`, `updateWidget(id, patch)`,
  `removeWidget(id)`, `removeWidgetsForDevice(deviceId)` (cascade),
  `applyLayout(dashboardId, widgets)` (editor save).
- `AddWidgetInput` — `{ dashboardId, widgetType, binding, roomId, size }`:
  the requested size is validated against the definition's `supportedSizes`
  and used as the placement target.
- `dashboardStore` — active dashboard + active room + the editor seam:
  `editorRoomId`, `enterEdit(dashboardId, roomId?)`, `beginEdit` draft
  operations (`moveDraftWidget`, `resizeDraftWidget`, `removeDraftWidget`,
  `rebindDraftWidget`), `cancelEdit()` (clears draft + editor room).
- Types: `Dashboard`, `DashboardWidget`, `SlotSize`.

## Internal

- `domain/layout.ts` — pure engine, **room-scoped** (CP-R3):
  `findFreeSlot(base, w, h, roomId)` only sees widgets of that room;
  `compactVertical` compacts each room independently; `validateLayout`
  / `collides` guard persistence. There is no room-level "Tất cả" — the app
  shows one shared active room at a time (see the module list in the app
  README).
- `data/dashboardRepository.ts` — AsyncStorage persistence (zod-validated).
- `ui/DashboardScreen.tsx` — **view-only**: dashboard chips + room chips +
  the grid for the shared active room. No add/edit/create entry points
  (editing lives under Settings).
- `ui/DashboardGrid.tsx` — renders widgets for the active room; edit mode
  (drag/resize/remove) is only enabled by the layout editor. Card rects and
  drag snapping share the metrics computed from the shell's measured canvas
  width (`onLayout` → `resolveCanvasWidth` → `computeGridMetrics`); the
  responsive row height is clamped to `[GRID_ROW_HEIGHT, GRID_ROW_HEIGHT_MAX]`.
- `ui/DashboardLayoutEditor.tsx` — draft editing: add (with room + size
  selection), move/resize/remove, device rebind picker, editor room chips
  (switching rooms keeps the draft), Save (`applyLayout`) / Cancel. `Result`
  failures surface in the editor and keep it open. The header back button
  leaves to the Settings root and discards the draft (coordinator-wired).
- `ui/AddWidgetFlow.tsx` — type → device → capability → room → size; no room
  creation inline, no room-level "Tất cả". The absolute overlay is
  inset-aware (`@core/safeArea`): it covers the status-bar strip and keeps
  its footer actions above the bottom system area.
- **Room migration merge safety (fix cycle 1):** `migrateWidgetsFromRoom`
  (device/room removal cascade) retargets widgets and relocates any mover
  that collides inside its new room scope (deterministic, first-free-slot,
  existing widgets of the target room keep their layouts) and validates the
  layout before persisting — a colliding merge can never be committed.
