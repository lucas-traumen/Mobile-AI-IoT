# dashboard module

Dashboards, room-aware grid layout engine, persistence and UI.

## Public API (`api/index.ts`)

- `DashboardService` — `load()`, `createDashboard(name)`, `deleteDashboard(id)`
  (last dashboard protected), `setActiveDashboard(id)`, `setActiveRoom(roomId)`
  (persisted, shared with History), `addWidget(input)`, `updateWidget(id, patch)`,
  `removeWidget(id)`, `removeWidgetsForDevice(deviceId)` (cascade),
  `removeWidgetsForBinding(deviceId, capability)` (binding-level cascade:
  cleaning ONE projected sensor metric of a surviving legacy device keeps
  sibling metrics), `applyLayout(dashboardId, widgets)` (editor save).
  Uniqueness invariant (approved room-sensor rework): a sensor-value
  binding, a switch binding or the unbound room overview appears at most
  once per dashboard/room — enforced in `addWidget`, `applyLayout` and a
  deterministic load migration (first exact duplicate wins, later ones are
  removed + layouts compacted; `history-chart` is retired on load).
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
- `ui/DashboardScreen.tsx` — **view-only**: header (`IoT Dashboard` left +
  global MQTT badge right), a centered `HH:mm` clock (`DashboardClock`,
  minute-aligned one-shot timers on the injected `Clock`), the controlled
  `RoomSelector` (non-wrapping horizontal quick strip + expandable full
  list) and the grid for the shared active room. The persisted dashboard
  name is not shown here (dashboard switching/renaming live under Settings).
  No add/edit/create entry points (editing lives under Settings).
- `ui/DashboardGrid.tsx` — renders widgets for the active room; edit mode
  (drag/resize/remove) is only enabled by the layout editor. Card rects and
  drag snapping share the metrics computed from the shell's measured canvas
  width (`onLayout` → `resolveCanvasWidth` → `computeGridMetrics`); the
  responsive row height is clamped to `[GRID_ROW_HEIGHT, GRID_ROW_HEIGHT_MAX]`.
  Opt-in `editorChrome`: when set (the editor), the move/delete/resize
  controls render in a dedicated chrome BAR above the content so they can
  never overlap widget icons/titles/values/switches; without it, edit mode
  keeps the legacy overlay controls and view mode is unaffected.
- `ui/DashboardLayoutEditor.tsx` — draft editing: add (device/capability +
  size selection), move/resize/remove, device rebind picker, editor room
  chips (switching rooms keeps the draft), Save (`applyLayout`) / Cancel.
  The content is bounded and centered on wide web canvases
  (`maxWidth: 720`) and the header uses flex gaps so its elements never
  concatenate. General outcomes (create/save/add widget) show in the
  top-center `OperationBanner`; the delete-dashboard action keeps its
  confirmation dialog with the error inside it. The header back button
  leaves to the Settings root and discards the draft (coordinator-wired).
- `ui/AddWidgetFlow.tsx` — **one-tap, editor-room authoritative**
  (approved room-sensor rework): the flow derives the room's projected
  sensor rows, relay rows and the room-overview row, HIDES every
  already-displayed choice (it receives the current draft/persisted widget
  list) and sends a complete default-size `AddWidgetInput` in ONE tap —
  resize stays an editor action. There are no category, device, capability
  or size steps, no history option (`history-chart` is retired — History is
  a derived tab), and no room step: the assembled input ALWAYS carries
  `roomId = editorRoomId` (a room-A editor can never add a room-B source).
  The absolute overlay is inset-aware (`@core/safeArea`): it covers the
  status-bar strip and keeps its footer actions above the bottom system
  area.
- **Room migration merge safety (fix cycle 1):** `migrateWidgetsFromRoom`
  (device/room removal cascade) retargets widgets and relocates any mover
  that collides inside its new room scope (deterministic, first-free-slot,
  existing widgets of the target room keep their layouts) and validates the
  layout before persisting — a colliding merge can never be committed.
