# Current Task Plan — `history-dashboard-layout-sync`

Date: 2026-10-11.
Status: IMPLEMENTED_AND_VERIFIED — History and room-selection follow-up complete; awaiting user acceptance.
Plan approved with “ok” on 2026-10-11.
Classification: contained behavior change across Dashboard composition and History.

## Goal and user contract

The user removes a sensor widget with the “−” button in the room layout and
expects History to show only the sensors still displayed by that Dashboard.
History must derive its card and query field selection from the active
Dashboard Template's saved layout for the selected physical room.

Example: a room registers temperature + humidity; the active Template's saved
layout contains both sensor widgets. Remove humidity and save: Dashboard and
History show temperature only. Add humidity back and save: its History card
returns and can display the already stored points.

## Repository evidence and current state

- `DashboardGrid.tsx` displays “−” and calls `onRemoveWidget(widget.id)`.
- `EditRoomDashboardScreen` wires removal to `onDraftRemove`.
- `hierarchyRoutes.tsx` routes it to the dashboard store's `removeWidget`:
  this changes only the draft. Save commits through `applyTemplateLayouts`;
  Cancel/tab leave discards the draft. Preserve this contract.
- `App.tsx` already subscribes to the active saved Template and devices.
  Its History query and `registeredFields` ignore Template widgets and call
  `historyQueryForRoom` / `sensorFieldsForRoom` with registered devices only.
- `HistoryScreen` renders one chart per supplied field, even with no points.
- The shared History room selection is `activeRoomId`. Its dropdown currently
  includes physical rooms; retain this navigation behavior for this task.
- ADR-017's historical History independence is superseded only for visible
  sensor selection by this user request. Physical rooms, registrations,
  MQTT identity and stored Influx data remain owned by their existing modules.

## Target behavior and decisions

1. Use the active Template's SAVED room reference/widgets, never its draft.
   Unsaved removal, Cancel, failed Save and tab-leave discard do not alter History.
2. Eligible fields come from `sensor-value` widgets with a valid binding to
   an existing telemetry-sensor registration in the selected physical room.
   Validate `deviceId` + capability together; same field in another room,
   missing devices/bindings, relay widgets and unknown widget types do not count.
3. Deduplicate eligible fields and preserve the current registration order
   to keep existing History chart ordering stable.
4. Derive visible cards, queried fields and the no-sensors branch from the
   SAME eligible selection. Cached or delayed responses cannot restore a
   hidden card. Preserve request-id invalidation and room/board tag filters.
5. No matching room reference, empty saved layout, or no eligible sensor
   widgets means zero cards and no network query; never fall back to all
   registered sensors. Explain the empty state as no sensor selected in the
   active Dashboard layout, with guidance to add one through layout editing.
6. Switching active Templates changes History to that Template's saved
   selection. Adding a widget back restores visibility without deleting data.
7. Do not add an enabled flag or remove logical devices. Do not alter the
   editor's delete/save behavior. Do not make live-reading freshness a filter.

## Scope

- `app-mobile/App.tsx`: pass the active saved room's widgets to History field
  and query derivation; use consistent no-sensors behavior.
- `app-mobile/src/modules/history/internal/domain/roomSensorFields.ts`:
  pure valid-binding/layout selection, retaining existing unfiltered helper
  semantics where called without explicit layout scope if needed.
- `app-mobile/src/modules/history/api/index.ts`: TSDoc/re-exports if needed.
- `app-mobile/src/modules/history/ui/HistoryScreen.tsx`: update contract
  comments/empty-state wording where needed; retain chart rendering recipe.
- `app-mobile/src/core/i18n/strings.ts`: only the relevant History empty copy.
- `app-mobile/src/modules/history/README.md`: document saved-layout selection.
- Tests: `roomSensorFields.test.ts`, `src/app/App.test.tsx`, and relevant
  `HistoryScreen.test.tsx` assertions if copy or display contract changes.
- Durable artifacts: current plan/state; memory promotion after acceptance.

## Out of scope

- Original History scope excluded room creation; the user follow-up
  “sau quản lí dash board còn có thể thêm phòng vậy” brings the omitted
  original Dashboard room-creation concern into scope, as detailed below.
- No room dropdown redesign, global selection redesign, new persistence
  schema/dependency, backend/firmware/MQTT/Influx schema change, device deletion,
  native rebuild, commit or push.
- Do not fix accepted backlogs or promote prior pending tasks as accepted.

## Capability contract and roles

- Orchestrator: REQUIRED `Create Plan`; OPTIONAL `gitnexus-exploring`,
  `gitnexus-cli`, `gitnexus-impact-analysis`; REQUIRED `Update Project Memory`
  only after user acceptance. No production edits.
- Coder: REQUIRED `Implement Plan`, `gitnexus-impact-analysis` before editing
  existing symbols; RECOMMENDED `tdd`, `gitnexus-exploring`. No nested delegation.
- Tester: REQUIRED `Verify Changes`; independent, no production repairs.
- Reviewer: REQUIRED `Code Review`, `gitnexus-impact-analysis`; independent
  read-only Standards + Spec review, no nested agents.
- Each worker invokes skills in its own context and reports capabilities_used.
- Maximum 2 automatic coder fix cycles; stop and report blockers after that.
- Record child task_id immediately with role, attempt/status, failure class,
  checkpoint and next action. Resume a valid child ID on retries.

## Ordered implementation and verification

1. Obtain user approval for this concrete plan. Coder inspects worktree,
   durable state and fresh graph, reports upstream impacts before edits.
2. Add tests for valid scoped binding selection and empty layout/no reference
   (must differ from omitted layout). Include custom fields, duplicates,
   stale device/wrong-room bindings, relays and unbound widgets.
3. Implement the pure selection and wire all History paths to the active
   saved Template room widgets. Keep optional/unscoped API compatibility if
   used elsewhere; production History must always pass explicit saved scope.
4. Exercise the App integration with a saved Template containing two sensor
   widgets: baseline both; draft removal unchanged; save one; cancel keeps
   both; re-add restores both; active Template switch scopes correctly;
   all removed gives no cards/no query; unexpected returned fields hidden.
   Update existing App fixtures with real saved sensor layouts, so tests
   cannot pass by an unintended all-registrations fallback.
5. Preserve board-bound and unbound query identity, range/room changes,
   focus refresh, request stale guard, and no extra queries on telemetry ticks.
6. Run focused Jest (`App`, `roomSensorFields`, `HistoryScreen`), typecheck,
   lint, changed-file Prettier, `git diff --check`, and GitNexus detect_changes.
   Run the full Jest suite once because root App wiring changes.
7. Independent tester verifies the final snapshot; reviewer checks Standards
   + Spec and regressions. Route necessary repairs through the same coder.
8. Present verified result for acceptance; promote the superseding visible
   History selection decision only after acceptance.

## Acceptance criteria

- Removing a humidity widget and successfully saving leaves exactly the
  temperature chart in History and excludes humidity from query fields.
- Draft edits and canceled/failed saves do not change History visibility.
- Re-adding and saving restores the card; stored data is never deleted.
- Active Template switch uses its own room sensor widget set.
- An empty/missing saved room layout does not show registered-only sensors.
- Identity and field validation prevent cross-room/device leakage.
- Checks pass; production changes stay in the stated scope; no commit/push.

## Risks and preparation evidence

- App is shared composition wiring; impact results will be recorded before
  approval and rechecked by coder before edits.
- Graph was stale (indexed a5a446a vs HEAD c827057). Incremental refresh failed
  with an inconsistent file FTS index; `analyze --repair-fts --index-only`
  succeeded; index-only analyze then forced a recovery full rebuild.
- Baseline before changes: focused App + roomSensorFields Jest 2 suites /
  23 tests pass (2026-10-11). This is existing-behavior evidence, not proof
  of the requested new selection contract.
- Worktree was clean before planning. Prior sensor creation task remains
  IMPLEMENTED_AND_VERIFIED, awaiting acceptance; its complete plan/state are
  preserved in `plans/archive/2026-10-11-sensor-creation-flow-awaiting-acceptance-{plan,state}.md`.
- `OPENCODE_HARNESS_V2_ARCHITECTURE.md` referenced by AGENTS.md is absent in
  this checkout; the available AGENTS, capability policy and role skills
  provide the concrete workflow. No workflow policy is invented.

## Completed graph impact check (2026-10-11)

Fresh recovery index: 3,571 nodes / 9,504 edges / 204 flows.
Upstream analysis reports LOW for all inspected symbols:
- `sensorFieldsForRoom`: 2 direct callers (`App`, `historyQueryForRoom`),
  3 dependants including `runHistoryQuery`, 1 affected execution flow.
- `historyQueryForRoom`: 2 direct callers (`App`, `runHistoryQuery`),
  1 affected execution flow.
- `HistoryScreen`: 1 direct consumer (`App`), no enumerated flow.
- `App`: no indexed upstream caller; it is the root component, so full
  integration coverage is still required despite the graph's LOW rating.
Coder must also analyze any nested existing function it edits (such as
`runHistoryQuery`) before changing it. These checks are preparation only.

## Final implementation and verification — 2026-10-11

Implemented only the 8 approved application paths. History cards, exact query
fields and empty state follow active saved Template room sensor widgets with
valid registration bindings. Draft/Cancel/failed Save remain isolated. Empty
saved selection stops before the Flux adapter; no data deletion or new schema.

Coder: `01a12a6c-1e32-7313-b7af-8a66aeab541d`; required Implement Plan and
GitNexus impact invoked; TDD used. Focused 3 suites / 70 tests, typecheck,
Prettier and diff checks pass.
Tester: `01a12a6f-a9aa-7312-ae03-70edd84ee9e9`; required Verify Changes used.
Final stable snapshot: focused 7 suites / 124 tests; full 105 suites / 1793
pass (15 added); typecheck pass; lint 0 errors / 4 baseline warnings; changed
application-file Prettier and diff/scope checks pass.
Reviewer: `01a12a73-610b-7db1-b15a-e23cee2fbd8a`; required Code Review and
GitNexus impact used; final APPROVE, Standards PASS, Spec PASS, no findings
or material coverage gaps. Aggregate graph MEDIUM across 25 indexed symbols
and exactly the two expected History selection/rendering flows.

No fix cycle required (0/2). No native/live Influx smoke, commit or push.
Await user acceptance before memory promotion; prior sensor task remains
pending acceptance in preserved archive checkpoints.

## Authorized follow-up — Dashboard selects existing rooms only

Date: 2026-10-11. User's follow-up points out that the original concern about
room creation under Dashboard management remains unresolved. Treat this as
steering/completion of the original task after the earlier “ok”; do not ask
for redundant permission. History work above remains verified and preserved.

Target contract:
- Quản lý Dashboard → Thêm phòng remains the way to include an EXISTING
  physical room in the active Template. It no longer creates physical rooms.
- Remove “Tạo phòng mới”, its text input/submit action and app route callback.
  Room creation stays in Cài đặt → Phòng & thiết bị, with its current behavior.
- Only rooms not already referenced are offered. Empty selector explains
  that rooms are created in Phòng & thiết bị; existing membership may need
  no further action when all rooms are already included.
- Existing-room submission still calls addRoomReference, never addRoom.
  Keep visible failure handling and busy protection when removing the form
  that currently hosts the error Text. Do not change successful-selection
  navigation unnecessarily.
- Do not rename routes/files or restructure unrelated UI. Preserve saved
  History selection, persistence contracts, devices and prior data.

Additional scoped files:
- modules/dashboard/ui/CreateRoomScreen.tsx and its test.
- app/settings/hierarchyRoutes.tsx (CreateRoomRoute callback/imports only).
- app/settings/routes.ts (outdated route documentation only).
- app/settings/SettingsNavigator.test.tsx (existing-room selection/no creation).
- app/settings/addRoomToTemplate.ts and its test: delete obsolete helper and
  tests only after confirming no remaining production callers and upstream
  impact. This cross-store compensation was exclusively for the removed path.
- core/i18n/strings.ts (remove now-unused create-new/partial keys, selector
  guidance only; preserve prior History and sensor/board wording).
- modules/dashboard/README.md (existing-room-only management contract).

Capability routing stays unchanged: sole coder invokes Implement Plan and
upstream impact before every existing symbol edit/deletion; independent
Verify Changes tester and Code Review + impact reviewer, no nested workers.
Reuse previous role session IDs and inspect all current diff before work.
No production edits by orchestrator, no commit/push, maximum 2 fix cycles.

Verification:
1. Screen has existing choices but no TextInput/new-room submit action.
2. Existing selection invokes callback with room id; failure remains visible
   and busy state prevents double submission.
3. Empty/all-referenced list gives useful existing-room guidance.
4. Settings route tests prove dashboard action never calls devices.addRoom,
   while Phòng & thiết bị can still create a physical room.
5. Run targeted CreateRoomScreen/SettingsNavigator/DevicesScreen plus existing
   History regressions, typecheck, lint, changed-file Prettier and diff check.
   Independent tester runs full Jest once on final combined snapshot.
6. Independent reviewer checks cumulative History plus follow-up scope and
   reports final verdict. User acceptance/memory promotion remain pending.

## Final combined result — 2026-10-11

Authorized follow-up complete. Dashboard Thêm phòng selects existing physical
rooms only; new-room UI/callback/exclusive helper and obsolete test removed.
Physical creation remains in Phòng & thiết bị, route regression verified.
Visible errors/retry/synchronous busy guard remain, selector guidance updated.
Seven protected History files and entire History string block unchanged.

Independent tester: focused13 suites338tests pass; full104 suites1795tests
pass (one run); typecheck pass; lint0errors4baselinewarnings; all14remaining
changedappfile Prettier/diff/scope/untracked checks pass; hashes stable.
Counts: prior105/1793 minusobsoletehelper1suite5tests plus7new =>104/1795.
Independent reviewer final APPROVE: StandardsPASS/SpecPASS; no findings/gaps.
Individual runtime impactsLOW; cumulative graphHIGH48symbols6flows recorded
and disclosed. Route-body comparisons prove onlyCreateRoomRoute changed,
other5exported route bodies unchanged; RoomListRoute attributions are shifted
line mapping artifacts, reconciled independently. Full checks passed.
No fix cycle, commit, push, native-device or liveInflux smoke performed.
Await user acceptance before memory promotion; prior pending tasks retained.


## Authorized continuation — board QR restores the visible card (2026-10-12)

User repeatedly authorized repair and continuation. Earlier History/Dashboard
work remains preserved. Classification: functional bug; no renewed approval
needed. Apply Create Plan and Recover Task workflows from project skills.

Evidence: firmware MQTT CONNACK and live telemetry/heartbeat verified in
prior session. Actual QR handler restores absent boards only if a local
deletedBoardCodes marker exists; otherwise it shows an unknown-board sheet.
Existing wiring tests bypass the QR handler. Device ADB list is empty and
no Expo/Metro process is running; actual phone bundle version unverified.

Target: scanning the valid user's QR always brings the board card back,
even with empty inventory or a missing legacy deletion marker. Keep status
honest (seen until MQTT online). Successful BLE provisioning continues to
restore the selected physical board. Deletion remains UI visibility only.

Immediate local work: inspect MQTT WebSocket endpoint and device/runtime
availability. Parallel coder owns bounded actual QR route reproduction,
regression test and fix. Tester independently inspects runtime artifacts;
reviewer examines QR/restore chain read-only, then reviews final diff.

Capabilities: coder REQUIRED Implement Plan, gitnexus-debugging, upstream
gitnexus-impact-analysis before symbol edits; RECOMMENDED diagnosing-bugs
and TDD. Tester REQUIRED Verify Changes; reviewer REQUIRED Code Review
and gitnexus-impact-analysis. No nested workers. Orchestrator makes no
production edits. No commit/push or broker reset.

Scope: BoardsScreen.tsx and its tests; actual SettingsNavigator + real
buildContainer integration regression in app settings/wiring tests; small
related documentation adjustments only as needed. Inventory/registry changes
only if a demonstrated regression demands them and after impact reporting.
Preserve unrelated dirty files and previously implemented fixes.

Steps: build a test that mounts actual SettingsNavigator with real services
and drives scanner through onScanned or CameraView; watch absent/no-marker
case fail. Cover delete/rescan same session, cold inventory, honest status,
retained online/descriptor replacement and error failure retry. Fix route
with minimal diff, preserve BLE access for new/unconfigured board and search
clear/highlight behavior. Run focused tests, typecheck, lint, scoped format,
diff checks; independent verification and read-only review. Max 2 new coder
repair cycles in this continuation. Report native smoke limitation honestly.
