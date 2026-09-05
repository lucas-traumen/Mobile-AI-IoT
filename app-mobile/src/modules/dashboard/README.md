# dashboard module

Dashboard Templates, the room-aware grid layout engine, persistence and UI.

A **Template** is one complete presentation/layout profile over the SAME
physical home: it owns an ordered list of references to PHYSICAL rooms
(rooms/devices/MQTT/History identities stay owned by the devices module —
referenced, never cloned) plus each referenced room's widget layout.
Exactly one Template is ACTIVE at a time and drives the Dashboard tab. The
Template → Room → Widget management hierarchy lives INSIDE the Settings
tab (one management entry on the settings root); the Dashboard tab is the
view-only surface.

## Public API (`api/index.ts`)

- `DashboardService` — Template CRUD/duplicate (`createTemplate`,
  `renameTemplate`, `duplicateTemplate` — fresh ids, rooms referenced not
  cloned, `deleteTemplate` with the last-Template guard, `setActiveTemplate`
  with deterministic fallback), ordered room-reference operations
  (`addRoomReference` — a room at most once per Template,
  `removeRoomReference` — removes only the reference + layout, never the
  physical room, `reorderRoomReferences`, `duplicateRoomReference` — into a
  different Template with fresh widget ids), room-scoped widget editing
  (`addWidget`, `applyLayout` — atomic commit for ONE Template-room layout,
  `applyTemplateLayouts` — the draft editor's seam: the WHOLE draft
  end-state (source room + cross-room duplicate/move destinations) in ONE
  atomic multi-room save, `duplicateWidgetToRoom`, `moveWidgetToRoom` —
  atomic, DRAFT-AWARE moves/copies),
  `removeWidgetsForDevice(deviceId)` / `removeWidgetsForBinding(deviceId,
capability)` cascades and `migrateWidgetsFromRoom` (physical-room removal
  cascade). Every mutation persists atomically, stamps the touched
  Template's `updatedAt` (Clock-injected) and publishes `dashboards:changed`.
  Uniqueness invariants are enforced at this interface, not only in UI
  filtering: a sensor-value binding or a switch binding appears at most
  once per Template room.
- `AddWidgetInput` — `{ type, binding, roomId, size }` (Template + room are
  method parameters): the requested size is validated against the
  definition's `supportedSizes` and used as the placement target.
- `dashboardStore` — mirror of the persisted file (Templates + activeId +
  the History compatibility `activeRoomId` seam) and the draft edit seam:
  `enterEdit(templateId, roomId)` copies ALL widgets of the Template into
  `draftWidgets` scoped to exactly ONE Template-room layout, draft
  operations (`moveWidget`, `resizeWidget`, `removeWidget`,
  `renameDraftWidget`, `rebindDraftWidget`, atomic whole-draft
  `setDraftWidgets`), `cancelEdit()` (discard — persistence happens only
  through the service's atomic commit seams; after a successful Save the
  editor stays open with a clean draft).
- Persistence schemas: `DashboardTemplate`/`TemplateRoom`/`DashboardsFile`
  (+ the legacy shapes) with `parseDashboardsFile` discriminating legacy →
  Template migration (deterministic, idempotent, unknown custom fields and
  types preserved); `MIGRATION_GLOBAL_ROOM_ID` for the all-roomless edge.
- View helpers: `groupWidgets`/`sectionBaseY`/`sectionContentHeight`
  (section split), `computeGridMetrics`/`resolveCanvasWidth`/
  `resolvePresentationMode` (responsive grid), `filterWidgetsForRoom` (room
  filter helper).
- `RoomSelector` — controlled room navigation (non-wrapping horizontal
  quick strip + expandable full list), shared with the History screen.

## Internal

- `domain/layout.ts` — pure engine, **room-scoped**:
  `findFreeSlot(base, w, h, roomId)` only sees widgets of that room;
  `compactVertical` compacts each room independently; `validateLayout`
  / `collides` guard persistence.
- `domain/dashboardSchema.ts` — Template persistence schemas + the legacy
  migration (see the Public API section).
- `data/dashboardRepository.ts` — AsyncStorage persistence (zod-validated,
  load discriminates legacy/current).
- `services/dashboardService.ts` — the service implementation (migration
  authority; Clock-injected `updatedAt` stamps).
- `ui/DashboardScreen.tsx` — **view-only Dashboard tab surface**: the
  active-theme gel gradient page, header (app title + global MQTT badge),
  the controlled `RoomSelector` fed with the ACTIVE Template's ordered room
  references (resolved to physical names via the devices module), the
  "Môi trường"/"Thiết bi" section grids for the selected room's Template
  layout and honest empty-state hints. Selecting a room changes the viewed
  room only (presentation state — never persisted, never navigates). No
  add/edit/create entry points and no Template navigation: every mutation
  lives behind the Settings hierarchy.
- `ui/RoomSelector.tsx` — the shared controlled room strip.
- `ui/DashboardGrid.tsx` — renders widgets; edit mode (drag/resize/remove)
  is only enabled by the editor. Card rects and drag snapping share the
  metrics computed from the measured canvas width (`onLayout` →
  `resolveCanvasWidth` → `computeGridMetrics`); the responsive row height is
  clamped to `[GRID_ROW_HEIGHT, GRID_ROW_HEIGHT_MAX]`. Opt-in
  `cardAppearance: 'gel'` (the view screen) paints cards with the pastel
  tints + shadow recipe; `'default'` keeps neutral surfaces (the editor).
  Opt-in `'stacked'` presentation reflows cards one per row on narrow
  canvases WITHOUT reading/rewriting persisted coordinates.
- `ui/TemplateListScreen.tsx` — management hierarchy root (Settings stack):
  back affordance to the settings root, responsive Template cards (name,
  room count, last-updated copy), create entry, per-card
  rename/duplicate/delete menus with destructive confirmation; the last
  Template is protected.
- `ui/RoomListScreen.tsx` — one Template's room cards with the
  `X cảm biến · Y thiết bị` meta line (user decision 2026-09-05:
  measurement-only vs switch/relay device counts — no live values on the
  cards; live state lives inside the room dashboard after tapping),
  long-press drag-to-swap reorder (device-acceptance rework: press-and-hold
  lifts the card, the hovered slot shows the translucent primary highlight,
  dropping on another card SWAPS the two positions through
  `onReorder`; a plain tap still opens the room), rename (renames the
  PHYSICAL room — every referencing
  Template sees the new name), duplicate-to-other-Template and remove-
  reference actions (confirmations keep the dialog open on failure and show
  the actual service error).
- `ui/CreateTemplateScreen.tsx` / `ui/CreateRoomScreen.tsx` — the create
  forms; CreateRoom offers existing physical rooms NOT yet referenced by
  the Template plus a create-new-physical-room path (cross-store
  compensation lives in the app layer).
- `ui/RoomDashboardScreen.tsx` — the preview of exactly ONE Template-room
  layout (back, physical room name, Template name, `Chỉnh sửa`).
- `ui/EditRoomDashboardScreen.tsx` — the room-scoped draft editor:
  `Hủy`/`Lưu` header actions, drag/resize, add (`AddWidgetFlow`), rename,
  configure/rebind (candidates restricted to the room's devices),
  duplicate-to-room, move-to-room, delete. Hủy/back discards the draft —
  never silent persistence.
- `ui/AddWidgetFlow.tsx` — **one-tap, editor-room authoritative**: the flow
  derives the room's projected sensor rows and relay rows (the retired
  `room-device-list` overview is never offered), HIDES every
  already-displayed choice (it receives the current
  draft/persisted widget list) and sends a complete default-size
  `AddWidgetInput` in ONE tap — resize stays an editor action. There are no
  category, device, capability or size steps, no history option
  (`history-chart` is retired — History is a derived tab), and no room step:
  the assembled input ALWAYS carries `roomId = editorRoomId` (a room-A
  editor can never add a room-B source). The absolute overlay is
  inset-aware (`@core/safeArea`): it covers the status-bar strip and keeps
  its footer actions above the bottom system area.
- `ui/ConfirmDialog.tsx` — shared confirmation dialog + `ActionOutcome`
  shape for destructive actions.
- **Room migration merge safety:** `migrateWidgetsFromRoom` (device/room
  removal cascade) retargets widgets and relocates any mover that collides
  inside its new room scope (deterministic, first-free-slot, existing
  widgets of the target room keep their layouts) and validates the layout
  before persisting — a colliding merge can never be committed.
