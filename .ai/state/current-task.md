# Current Task State

Status: USER-AUTHORIZED CHECKPOINT COMMIT/PUSH — NEW PLAN REQUIRED

Plan: pending replacement of `.ai/plans/current-plan.md`

## Task

Implement the Dashboard tab first using the user-supplied hierarchy:

```text
Template list
→ Rooms of one Template
→ One room's widget dashboard
→ Edit that room's widgets
```

Keep exactly three root tabs: Dashboard / History / Settings. Template and Room
must be nested Dashboard screens, not root tabs.

## Classification

- Architecture-sensitive feature + frontend/navigation refactor + persistence
  migration.
- Not a small visual-only change: the current app has no Template entity or
  Dashboard navigation stack, rooms are globally registered, and the editor
  currently lives under Settings.

## Repository state

- Branch: `main...origin/main`.
- The worktree contains the implementation of predecessor task
  `room-sensor-derived-history-layout-rework`. Preserve every pre-existing
  change. The user explicitly requested a checkpoint commit and push on
  2026-09-04 before switching tasks; never reset or checkout.
- Latest GitNexus cumulative diff assessment: CRITICAL by volume — 311 changed
  symbols / 95 indexed files / 120 affected processes.
- GitNexus workspace index resolves current uncommitted code at 1849 symbols /
  4941 relationships / 151 processes; no freshness warning was returned.

## Current implementation evidence

- `App.tsx` renders a hand-written `TabShell`; Dashboard directly renders
  `DashboardScreen`.
- `TabShell` is state-based and the app has no React Navigation dependencies.
- `DashboardScreen` combines a horizontal `RoomSelector` and the selected
  room's widget grid on one screen.
- `DashboardLayoutEditor` combines dashboard chips, room chips and widgets and
  is opened from `SettingsCoordinator`.
- Existing `Dashboard` contains `id`, `name`, and `widgets`; it has no ordered
  room membership or updated timestamp.
- `Room` is globally persisted by the devices module and has no Template
  relationship.
- Existing reusable behavior includes room-scoped widget filtering, live MQTT
  sensor/relay state, draft Save/Cancel, drag, resize, remove, duplicate guards,
  responsive stacked view mode and two-column editor mode.

## Pre-change GitNexus impact

- `App`: LOW, no upstream consumers.
- `TabShell`: LOW, 2 direct consumers / 3 total impacted symbols.
- `DashboardScreen`: LOW, 3 direct consumers / 4 total impacted symbols.
- `DashboardLayoutEditor`: LOW graph risk, but directly affects
  `SettingsCoordinator` and 9 indexed Settings execution flows.
- `DashboardServiceImpl`: LOW graph risk, 4 direct / 16 total consumers.
- `DeviceRegistryServiceImpl`: MEDIUM, 4 direct / 49 total consumers; changing
  room ownership would fan out into App, Settings, History, Dashboard, Widgets
  and tests.

## Capability contract (planning stage)

### Orchestrator

- REQUIRED and invoked: `Create Plan` (planning workflow started; final plan is
  pending normalization after the decisions below).
- RECOMMENDED and invoked: `codebase-design`, `domain-modeling`.
- OPTIONAL and invoked: `gitnexus-exploring`, `gitnexus-impact-analysis`.
- DENY: production edits, worker impersonation, reset/checkout, silent scope
  expansion. Commit/push is allowed only for the user-requested predecessor
  checkpoint, not for future implementation.

### Future coder (only after plan approval)

- REQUIRED: `Implement Plan`, `gitnexus-impact-analysis` before every existing
  symbol edit, `gitnexus-debugging` for migration/integration defects.
- RECOMMENDED: `tdd`, `codebase-design`, `gitnexus-exploring`.
- `gitnexus-cli` only if the index is proven stale.
- DENY: governance/roadmap/memory edits, unrelated cleanup, nested delegation,
  reset/checkout, commit/push.

### Future tester / reviewer

- Tester REQUIRED: `Verify Changes`; read-only.
- Reviewer REQUIRED: `Code Review` + `gitnexus-impact-analysis`; read-only.

## Resolved product decisions

- 2026-09-04: user selected model **1A**. A Template is a presentation/layout
  profile over the same physical smart home. Templates reference shared rooms
  and devices; duplicating a Template copies its room selection/order and
  per-room widget layouts but never duplicates devices, MQTT identities or
  History identities.
- 2026-09-04: user selected scope **2B**. The replacement plan must cover the
  complete Dashboard-tab specification rather than the reduced MVP: Template
  create/rename/duplicate/delete, room add/rename/duplicate/reorder/delete,
  room dashboard, and widget add/rename/configure/duplicate/move-room/delete,
  drag/resize plus Save/Cancel.
- Camera/chart behavior lacks a specified data source in the supplied flow and
  must be made explicit in the plan; workers may not invent a backend.
- The supplied React Navigation structure is accepted as part of the full
  specification: three root tabs plus a native stack under Dashboard.
- Existing rooms/devices remain physically shared. Therefore the suggested
  `Room.templateId` ownership field is intentionally NOT the target model; a
  Template stores ordered room references/membership instead.

## Predecessor task

- Previous plan `room-sensor-derived-history-layout-rework` was approved and
  implemented but ended at independent tester FAIL after fix budget 2/2.
- Known blockers remain: arbitrary unknown top-level widget fields are stripped
  by `WidgetConfigSchema`, and directly affected docs/comments still contain
  stale semantics. Any new persistence migration must include the unknown-field
  preservation fix to avoid durable user-data loss.
- Retained child sessions: coder `ses_f978103a7ffe698hTwwLxhjpqZ`; tester
  `ses_f9735fe7cffe9Rj92SaLBwQzGW`. Do not resume them for the new task until a
  new approved plan/handoff exists.

## Next action

1. Commit and push the preserved predecessor-task worktree as a checkpoint,
   explicitly retaining its known tester blockers; this was directly requested
   by the user and does not constitute acceptance.
2. Replace and normalize `.ai/plans/current-plan.md` with a self-contained plan
   for the resolved 1A/2B model.
3. Ask for explicit plan approval.
4. Only then delegate production implementation to `coder`.
