# Current Task Plan — `sensor-creation-flow`

Status: IMPLEMENTED_AND_VERIFIED — awaiting user acceptance on 2026-10-10.

## Goal

Make `Phòng & thiết bị` treat “Thêm cảm biến” as creation of a new logical
sensor device. The Dashboard layout flow may select an existing device source
when adding a widget; the device-management flow must not present itself as a
source picker.

## Current state

- `DeviceManagementScreen` opens a generic `AddDeviceDialog` from the room
  detail. The room already has `Cảm biến` / `Điều khiển` sections, but the
  dialog asks the user to select `Cảm biến` or `Rơ le` again.
- The sensor body treats catalog entries such as `Nhiệt độ` and `Độ ẩm` as
  picker chips without clearly saying they are data channels/types, not
  existing sensor instances.
- Sensor display name is optional; submission defaults it from the selected
  capability label.
- Custom capability creation is nested in the sensor dialog and exposes the
  catalog fields alongside ordinary sensor creation.
- `sensorFieldTakenInRoom` intentionally allows at most one registration per
  `{roomId, field}`. Deleting a sensor frees its field; selecting that field
  later creates a new device record, but the current UI makes it look like a
  restoration/source selection.

## Target state

- The room detail offers contextual actions: `+ Thêm cảm biến` from the
  sensor section and `+ Thêm điều khiển` from the relay section.
- The add-sensor flow opens directly as a sensor-creation form; no repeated
  kind segmented control appears.
- Sensor name is required and the primary action is `Tạo cảm biến`.
- Existing catalog/descriptor entries are labeled and presented as
  `Kênh dữ liệu` / data types. Selecting one is required to route incoming
  MQTT/Influx data; it does not reuse an old device.
- Custom metric creation remains available as a secondary path, but after a
  successful creation the new metric is selected for the pending new sensor.
  The custom catalog form remains separate from the ordinary sensor form.
- Declared board channels not yet in the catalog can enter the secondary
  metadata form with their key prefilled. Metadata creation for a bound board
  must stay within its declared sensor fields.
- Relay creation remains supported and contextual; its existing name + free
  slot behavior is preserved.
- The existing `{roomId, field}` uniqueness/data contract is preserved. Two
  concurrent sensors cannot use the same field in one room without a separate
  backend/topic/history redesign, which is out of scope.
- Dashboard widget creation remains unchanged.

## Scope

Production/UI:

- `app-mobile/src/modules/devices/ui/DevicesScreen.tsx`
- `app-mobile/src/modules/devices/ui/AddDeviceDialog.tsx` (or a small
  same-module split if needed)
- `app-mobile/src/core/i18n/strings.ts`
- `app-mobile/src/modules/devices/README.md` (only the changed sensor/UI contract;
  preserve the pre-existing board-deletion documentation)

Tests:

- `app-mobile/src/modules/devices/ui/DevicesScreen.test.tsx`
- Add focused dialog tests only if the existing screen tests cannot cover the
  new public interaction contract.

Durable task artifacts:

- `.ai/plans/current-plan.md`
- `.ai/state/current-task.md`

## Out of scope

- No change to MQTT topic grammar, telemetry routing, Influx schema, or the
  room-field uniqueness invariant.
- No change to Dashboard Template/Room/Widget behavior.
- No board discovery or board deletion changes.
- No new dependency, native module, environment variable, or secret wiring.
- No commit or push.

## Relevant symbols and dependencies

- `RoomDetailView`, `SensorsSection`, `ControlsSection` in
  `DevicesScreen.tsx`.
- `AddDeviceDialog`, `CustomMetricForm` and sensor submission in
  `AddDeviceDialog.tsx`.
- `projectSensorRegistrations`, `sensorFieldTakenInRoom`,
  `MAX_SENSORS_PER_ROOM` in the devices domain.
- `DeviceRegistryService.addDevice` and `addCapability` validation.
- `STRINGS.devices` labels used by both UI and tests.

## Capability contract

- Classification: feature + UX correction, contained in the devices UI.
- Coder REQUIRED: `Implement Plan`, `gitnexus-impact-analysis`.
- Coder RECOMMENDED: `tdd`, `codebase-design`, `gitnexus-exploring`.
- Tester REQUIRED: `Verify Changes`.
- Reviewer REQUIRED: `Code Review`, `gitnexus-impact-analysis`.
- Orchestrator REQUIRED: `Create Plan`, `Update Project Memory` after user
  acceptance; no production edits.
- DENY all workers: auto-commit, push, nested delegation, unrelated board or
  Dashboard work.
- GitNexus: run `impact` upstream before editing every existing symbol touched;
  warn if HIGH/CRITICAL. Run `detect_changes()` after implementation and
  before any commit (no commit is planned).

## Ordered implementation steps

1. Coder reads this plan, current state, project memory and git status.
2. Coder runs GitNexus impact for the UI symbols before editing and records
   the blast radius. Refresh is unnecessary unless status changes.
3. Coder updates tests first or alongside the UI for:
   - contextual sensor action opens a sensor-only form;
   - name is required and the submit label/contract says create;
   - the selected field is sent as a new device input;
   - deleting/re-adding a field creates a new device through the callback;
   - custom metric creation selects the new field;
   - relay flow remains available from its own context.
4. Coder implements the smallest coherent UI refactor, preserving service
   inputs and validation boundaries.
5. Coder runs focused Jest tests, typecheck, lint for touched files or the
   project script, Prettier on touched source, and `git diff --check`.
6. Coder runs GitNexus `detect_changes(all)` and reports changed symbols and
   flows.
7. Tester independently reads the diff/plan and runs required verification;
   tester does not repair production code.
8. Reviewer performs Standards + Spec review and reports blockers/majors.
9. Orchestrator integrates any fix cycle (maximum two), then presents the
   verified result for user acceptance.

## Acceptance criteria

1. From a room's sensor section, the user can directly open a new-sensor form
   without choosing the sensor/relay kind again.
2. A sensor cannot be submitted without a name and data channel.
3. The callback receives a newly constructed `NewDeviceInput` with the open
   room id; no existing device id is selected or reused by the UI.
4. Re-adding a field after deleting its prior device invokes the normal add
   path and produces a new device in the test harness.
5. Custom metric creation remains secondary and auto-selects a successfully
   created metric when returning to the new-sensor form.
6. Relay creation from the control section still asks for name and free slot
   and submits the same relay binding contract.
7. Dashboard widget source selection and the devices domain uniqueness rules
   are unchanged.
8. Focused tests, typecheck, lint, formatting and diff checks pass; no
   unrelated production files change.

## Risks and open points

- “Create new sensor” still requires a channel because current telemetry and
  history identity is `{roomId, field}`. The UI must explain that this is a
  data-channel selection, not an existing sensor selection.
- If the user later requires multiple simultaneous temperature sensors in one
  room, a separate architecture plan is required for board/channel identity,
  telemetry resolution and history tags.
- Existing tests assert some legacy testIDs and wording; update them only where
  the approved behavior changes, keeping useful regression coverage.
