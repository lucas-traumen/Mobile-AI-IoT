# Current Task Plan

Status: APPROVED — READY FOR IMPLEMENTATION

## Task ID

room-sensor-derived-history-layout-rework

## Task type

Mixed architecture-sensitive domain refactor + UX refactor + protocol migration
+ bug repair.

## Parent milestone

M2 — Room-based customizable dashboard + template UI.

## Goal

Replace the rejected device/capability/widget interaction with a room-first
model that matches the user's mental model:

```text
Room
├── Sensors (one visible sensor = one metric)
└── Controls (one visible control = one relay)
```

The user chooses a room once. Child lists and creation flows inherit it. A
registered sensor automatically participates in realtime Dashboard data and
History; History has no separate configuration. Dashboard addition is a
one-tap choice from items not already displayed, with duplicate prevention at
both UI and service seams.

## User-approved product decisions

1. A user-facing sensor represents exactly one metric/field, for example
   `Nhiệt độ` (`temperature`) or `Độ ẩm` (`humidity`). Temperature and humidity
   are separate items and consume two sensor slots even if one physical board
   publishes both.
2. Sensor identity and matching are room-scoped: the canonical source identity
   is `{roomId, field}`. At most one registered sensor may use the same field in
   a room. Each room accepts at most ten sensor metrics and ten relays.
3. Realtime telemetry publishes one numeric metric per MQTT topic:

   ```text
   <prefix>/room/<roomId>/sensor/<field> -> numeric payload
   ```

   Examples:

   ```text
   home/room/room-living/sensor/temperature -> 25.6
   home/room/room-living/sensor/humidity    -> 60
   ```

   The correct machine spelling is `temperature`. The app subscribes to the
   room/field wildcard and does not fan one global JSON payload into every
   room.
4. InfluxDB uses the same identity: measurement `sensors`, tag `roomId`, and
   field key matching the sensor field. History queries match `roomId + _field`.
5. History is a derived view, never a configurable widget/layout surface.
   Adding a sensor automatically creates its History card; renaming metadata
   updates display copy; deleting a sensor removes the card from the app but
   never deletes old InfluxDB data. A registered sensor with no points remains
   visible as `Chưa có dữ liệu`.
6. `history-chart` is no longer addable on Dashboard. Existing persisted
   Dashboard history widgets are retired deterministically; the dedicated
   History tab is the sole historical-chart experience.
7. Device management is room-first. The top level lists rooms and has a clear
   `+ Thêm phòng` action. Selecting a room opens that room's detail with only
   `Cảm biến n/10` and `Điều khiển n/10`; there is no `Tất cả`, global-device
   filter matrix, repeated room picker, or binding-kind choice.
8. Adding a sensor inside a room selects exactly one existing metric type. A
   secondary `Tạo loại thông số mới` action may expose the existing curated
   metric form; `Loại dữ liệu` is not a primary top-level tab. Adding a relay
   asks only for its friendly name and an available room-scoped slot 1..10.
9. Successfully creating a room opens the new room immediately. Failures keep
   the form open and show truthful feedback.
10. Dashboard editing remains room-authoritative. `Thêm widget` shows only
    undisplayed sensors, undisplayed relays, and the room overview when absent.
    Selecting an item adds it with a default size; resize remains an editor
    action. There are no category, room, device, capability, or size steps.
11. Within one dashboard/room, a sensor-value binding, relay switch binding, or
    room overview can appear at most once. Existing exact duplicates are
    cleaned on load by keeping the first occurrence and compacting the affected
    room layout. Service validation remains authoritative even if the UI fails.
12. User-created room count stays unlimited. Relay identity/topics remain the
    already implemented room-scoped `{roomId, slot}` contract. The accepted
    Light/Dark Settings and advanced diagnostics work must not regress.
13. User data must not be reset or replaced with seeds. Legacy persisted
    multi-capability telemetry devices remain readable and are projected as one
    logical sensor per capability; all newly created sensor records contain
    exactly one sensor capability. Fresh-install seeds use separate logical
    temperature/humidity sensor records so counters start truthfully at `2/10`.

## Current repository evidence

- The worktree contains the large uncommitted implementation of the superseded
  plan. Automated tester attempt 4 passed 64 suites / 734 tests, typecheck,
  lint, source-scoped Prettier and diff-check, but user visual acceptance failed.
  Preserve the worktree; never reset, checkout, commit, or push.
- `Device.capabilities` is currently an array and first-run `sensor-01` declares
  both temperature and humidity, while `countRoomDevices` counts the enclosing
  device. This produces the rejected `1/10` display.
- `DevicesScreen` currently has primary `Phòng / Thiết bị / Loại dữ liệu`
  subviews, room/type `Tất cả` filters, repeated room selection, binding-kind
  selection, and multi-select sensor capabilities.
- `AddWidgetFlow` currently asks for category → device → capability → size and
  includes both `Tất cả` and `Lịch sử`. It does not receive the current draft
  widget set and therefore cannot hide already-used choices.
- `DashboardServiceImpl.addWidget` validates type/binding/layout but has no
  duplicate invariant. Persisted duplicates are not migrated.
- Telemetry currently subscribes to `<prefix>/tele/sensor`, parses an open JSON
  object, and `DeviceStateSync` fans each field into every telemetry device that
  declares it. This cannot distinguish rooms.
- History is already derived in part: `historyQueryForRoom` calculates fields
  from room devices. However its wire identity is `deviceId + field`, requiring
  a separately configured Influx `deviceId` tag and excluding untagged rows.
- `HistoryScreen` currently renders only returned non-empty series, so a newly
  registered sensor disappears until matching points exist.
- Dashboard and History already share one concrete active room in the UI; the
  internal nullable value remains necessary only for the no-room/bootstrap
  state. No visible `Tất cả` room choice is required.

## Target domain/interface model

### Sensor registration projection

- Keep persisted `Device` read compatibility so the task does not destroy old
  snapshots. Introduce one canonical pure projection for user-facing sensor
  registrations: one entry per telemetry device capability with at least
  `{deviceId, roomId, field}` plus catalog-derived label/unit/icon.
- New telemetry-sensor creation accepts exactly one sensor field. Relay records
  continue to expose only `switch`.
- Sensor counts sum projected metric registrations, not telemetry container
  records. Legacy multi-capability records therefore count and display as
  separate temperature/humidity items.
- The registry authoritatively rejects a new or moved sensor when its
  `{roomId, field}` already exists or when its addition would exceed ten
  projected sensor metrics. Existing legacy over-capacity/duplicate snapshots
  stay loadable; mutations may not worsen them.
- Removing one projected sensor from a legacy multi-capability record removes
  only that capability; the enclosing device is removed only when its last
  capability is removed. The devices-changed contract must carry enough
  binding-level removal information for Dashboard widgets and ephemeral state
  to be cleaned without deleting sibling metrics.

### Realtime telemetry

- Put topic build/parse rules behind pure functions. Subscribe to
  `<prefix>/room/+/sensor/+`, parse and validate `{roomId, field}` from the topic,
  and parse the payload as one finite number.
- Publish a typed event carrying `{roomId, field, value}`. `DeviceStateSync`
  updates only registrations matching that exact room/field. Invalid topics,
  wildcard-like/empty segments, non-finite values and wrong prefixes are
  dropped and logged without mutating stores.
- The old shared JSON telemetry topic is retired rather than dual-subscribed:
  without source identity it would reintroduce cross-room fan-out.

### History derivation

- Change the query/series identity from `deviceId + field` to
  `roomId + field`. The Influx Flux query filters the selected `roomId`, keeps
  the `roomId` column and groups by `roomId, _field`.
- Build requested fields directly from projected registered sensors in the
  active room. No sensors means no query; each registered field means one
  History card regardless of whether the result has points.
- Preserve the stale-request guard, ranges, demo/Influx selector, explicit
  Influx probe semantics, gel visual language, and explicit native SVG
  primitives required by React 19 + victory-native 36.

### Dashboard uniqueness and add flow

- Centralize a pure widget uniqueness key/check. Bound sensor/switch widgets
  are unique by room + widget type + exact binding; unbound room overview is
  unique by room + type.
- Apply the invariant during `addWidget`, draft/persisted `applyLayout`, and
  deterministic load migration. Never rely only on hiding an option.
- `AddWidgetFlow` receives the room's projected sensor/control choices and the
  current draft/persisted widgets. It renders only eligible unused rows and
  sends a complete default-size `AddWidgetInput` in one tap.
- Remove `history-chart` from the default registry and add it to the existing
  retired-widget migration. Preserve unknown custom widget types and all
  non-duplicate, non-retired user layouts.

## Scope

### A. Room-first device-management layout

- Replace the three primary subviews and global filters with room list → room
  detail navigation inside the devices-owned screen.
- Make room creation explicit, await the service result, and open the returned
  room id on success. Retain rename/delete confirmation and migration behavior.
- Room detail has only Sensors and Controls sections/tabs with truthful metric
  and relay counters. All add/edit forms inherit the selected room.
- Sensor add chooses one available catalog sensor field; duplicate/full choices
  are disabled or omitted with clear empty/help copy. Expose custom metric
  creation as a secondary action from this flow, reusing curated presets and
  strict machine-key validation.
- Relay add shows friendly name and available slot 1..10 only. Keep explicit
  delete/error feedback and legacy roomless records manageable in a separate
  migration/legacy affordance rather than a global `Tất cả` filter.
- Add direct regression coverage for the user-reported room-create failure.

### B. Sensor registration invariants and lifecycle

- Add the pure sensor projection/count/duplicate helpers and export only the
  narrow interfaces needed across modules.
- Enforce one field for every new telemetry sensor, room+field uniqueness and
  projected 10-sensor quota in `DeviceRegistryServiceImpl`.
- Add binding-level sensor removal/cascade support so deleting one legacy
  projected metric does not remove sibling metrics.
- Update fresh-install device/dashboard seeds to separate temperature and
  humidity registrations while preserving persisted snapshots without reseed.

### C. Room/field MQTT protocol

- Replace the shared telemetry topic/parser/event shape with the approved
  room-scoped per-field numeric contract.
- Update telemetry store/service, event map, `DeviceStateSync`, composition
  wiring, tests, topic documentation and examples atomically.
- Preserve MQTT connection lifecycle, reconnect behavior, Settings retry/status
  semantics and the independent room-scoped relay protocol.

### D. Automatic History

- Migrate `HistoryQuery`, `HistorySeries`, Flux builder/parser, room-query
  helper, demo source, adapter tests and App wiring to `roomId + field`.
- Make `HistoryScreen` derive cards from registered sensors and pair points by
  field; show `Chưa có dữ liệu` for a registered sensor without points.
- Remove any Dashboard History configuration route/type. Never write/delete
  InfluxDB data; the app remains read-only.

### E. Simplified unique Dashboard addition

- Replace the multi-step AddWidgetFlow with one-tap room-scoped available-item
  rows. Remove `Tất cả`, category/type selection, repeated source selection,
  capability selection and size selection.
- Pass current draft widgets to the flow so used choices disappear immediately.
- Enforce uniqueness in the dashboard service and load/apply migrations; add
  focused regressions for duplicate sensor, relay and room-overview attempts.
- Retire/deterministically remove `history-chart` widgets and update section
  grouping/registry/docs without changing Dashboard view-mode gel styling,
  drag/resize/delete chrome, grid coordinates or save/cancel semantics.

### F. Documentation and verification

- Update affected module READMEs and `app-mobile/README.md` with exact MQTT and
  Influx examples, automatic History behavior, one-field sensor semantics and
  collector migration notes.
- Update stale comments/types/i18n copy only where directly affected.
- Add multi-room tests proving no cross-room telemetry/history fan-out.

## Out of scope

- Supporting two sensors with the same field inside one room; that would need a
  separate stable sensor/source id and a new user decision.
- Dual-reading the ambiguous legacy `<prefix>/tele/sensor` JSON topic.
- Writing, deleting or backfilling InfluxDB data; the collector/firmware must
  emit the new room-tagged contract.
- InfluxDB v1, firmware implementation, broker provisioning, camera,
  automation, cloud sync, multi-user, new navigation library or visual palette
  redesign.
- Reworking accepted Light/Dark Settings, advanced diagnostics, relay
  room/slot protocol or unrelated responsive layout.
- Resetting AsyncStorage, silently replacing existing user records, commit or
  push.

## Relevant symbols and preflight impact

- `AddWidgetFlow`: **HIGH** — 1 direct caller, 3 impacted symbols, 2 affected
  execution flows (`DashboardLayoutEditor`, `SettingsCoordinator`) across 3
  modules. Preserve editor draft/save/cancel and safe-area behavior.
- `DeviceManagementScreen`: LOW in the refreshed graph — 1 direct caller and
  the SettingsCoordinator process, but its large UI/state surface is treated as
  operationally HIGH and requires render/integration tests.
- `DeviceRegistryServiceImpl`: graph LOW, 29 transitive symbols; dynamic facade
  consumers make service tests mandatory.
- `TelemetryServiceImpl`: LOW, 2 direct / 9 total consumers.
- `telemetryTopic` and `parseTelemetryPayload`: LOW, each reaches one telemetry
  service process; protocol break still requires atomic tests/docs.
- `DeviceStateSync`: LOW, 2 direct / 29 total graph consumers; event dispatch is
  dynamically under-attributed, so treat as MEDIUM.
- `historyQueryForRoom`: LOW, 2 direct callers and the `runHistoryQuery` flow.
- `buildFluxQuery`: LOW, reaches the history source/adapter flow.
- `HistoryScreen`: LOW, one App caller.
- `DashboardServiceImpl.addWidget`: graph LOW/under-attributed; it is an
  authoritative persistence seam and is treated as MEDIUM.

The GitNexus index was refreshed during the superseded implementation and its
workspace graph resolves the current uncommitted symbols (1849 symbols / 4941
relationships / 151 flows; indexed commit equals current `main` HEAD). Coder
must check freshness and refresh only if stale, not blindly re-analyze. Coder
must repeat impact before editing every existing symbol and stop/report any new
HIGH or CRITICAL architecture conflict.

## Capability contract

### Orchestrator

- REQUIRED: `Create Plan` — invoked.
- RECOMMENDED and invoked: `codebase-design`, `domain-modeling`,
  `gitnexus-exploring`, `gitnexus-impact-analysis`.
- OPTIONAL: `gitnexus-cli` only if freshness becomes stale.
- DENY: production edits, worker impersonation, non-role delegation,
  commit/push, scope expansion.

### Coder

- REQUIRED: `Implement Plan`, `gitnexus-impact-analysis`,
  `gitnexus-debugging`.
- RECOMMENDED: `tdd`, `codebase-design`, `gitnexus-exploring`;
  `gitnexus-cli` only on proven stale/missing index.
- REQUIRED GitNexus actions: pre-edit impact for all existing symbols changed;
  post-change `detect_changes(scope: all)`.
- DENY: roadmap/memory/governance edits, unrelated repair, nested delegation,
  reset/checkout, commit/push.

### Tester

- REQUIRED: `Verify Changes`.
- OPTIONAL: GitNexus only to clarify affected flows.
- DENY: production repair, delegation, commit/push.

### Reviewer

- REQUIRED: `Code Review`, `gitnexus-impact-analysis`.
- RECOMMENDED: inspect all HIGH/operationally HIGH surfaces and post-change
  execution flows.
- DENY: production repair, nested review delegation, commit/push.

## Ordered implementation steps

1. Inspect the preserved worktree and current tests; verify GitNexus freshness,
   run mandatory pre-edit impacts, and report the known HIGH AddWidgetFlow risk.
2. Write pure/domain regressions first for sensor projection/count/uniqueness,
   one-field creation, topic build/parse, numeric telemetry payload, exact
   room/field dispatch, History room/field queries and widget uniqueness.
3. Implement sensor projection and registry lifecycle/cascade semantics while
   retaining legacy snapshot read compatibility; update truthful fresh seeds.
4. Recompose DeviceManagementScreen into room list/detail and simplify inherited
   sensor/relay forms. Prove add-room success opens the created room.
5. Migrate telemetry topics/events/store/sync atomically to room+field numeric
   messages, preserving MQTT lifecycle and relay behavior.
6. Migrate History query/series/Flux/demo/App/UI to room+field and registered-
   sensor-derived cards, including no-data cards and stale-request safety.
7. Add dashboard uniqueness helpers and service/load/apply guards; retire
   history-chart; replace AddWidgetFlow with one-tap unused choices wired to the
   active draft.
8. Update focused integration/render tests and documentation. Do not repair
   unrelated issues or modify accepted visual tokens.
9. Run focused suites, then full tests, typecheck, lint, source-scoped Prettier
   and `git diff --check`; classify full format check only against known
   generated-Android ISSUE-007.
10. Run `detect_changes(scope: all)` and return structured implementation
    evidence for independent tester and reviewer handoff.

## Acceptance criteria

1. Device management initially shows a room list and `+ Thêm phòng`, not the
   rejected three global tabs. Creating `Phòng làm việc` persists it, opens its
   detail immediately and provides visible success/failure feedback.
2. A room detail exposes only `Cảm biến n/10` and `Điều khiển n/10`. No visible
   `Tất cả`, room filter, repeated room field or binding-kind selector remains.
3. The sensor count is the number of metric registrations. Temperature plus
   humidity displays `2/10`, including for a legacy multi-capability record.
4. Adding a sensor requires exactly one metric and inherits the open room. A
   duplicate `{roomId, field}` or eleventh metric is rejected authoritatively
   without persistence. A different room may register the same field.
5. Adding a relay inherits the open room and asks only for name and one
   available slot 1..10. Existing per-room slot/quota guarantees remain green.
6. MQTT subscribes to `<prefix>/room/+/sensor/+`; a finite numeric message on
   room A/temperature updates only room A's temperature registration. Room B,
   humidity and unrelated registrations remain unchanged. Invalid topic/value
   input changes no state.
7. History for a room is generated from that room's registered sensors with no
   add/edit chart action. Every registration has a card; missing points show
   `Chưa có dữ liệu` rather than removing the sensor.
8. Flux filters `roomId` and `_field`, keeps/groups `roomId + _field`, and the
   parser/adapter never guesses untagged data into a room. Range selection,
   stale-response guard, demo toggle and raw Influx probe remain correct.
9. Dashboard Add shows only unused sensor values, unused relay controls and an
   unused room overview for the editor room. One tap adds at the default size;
   no category/device/capability/size wizard or History option remains.
10. Duplicate add attempts fail in the dashboard service and mutate neither
    draft nor persisted layout. Load migration keeps the first exact duplicate,
    removes later duplicates and retired history-chart widgets, compacts safely,
    is idempotent and does not rewrite unrelated/custom layouts.
11. Removing one logical sensor cleans only widgets/state for that exact
    binding; sibling legacy metrics survive. Removing a sensor does not delete
    InfluxDB data.
12. Fresh seeds expose separate logical temperature/humidity sensors and valid
    dashboard bindings. Existing persisted multi-capability devices remain
    loadable and usable without AsyncStorage reset or reseed.
13. Accepted Settings theme/advanced diagnostics, Dashboard gel view, editor
    drag/resize/delete/save/cancel, room-scoped relays, safe areas and module
    import boundaries do not regress.
14. Relevant focused tests and full `npm test`, `npm run typecheck`,
    `npm run lint`, source-scoped Prettier and `git diff --check` pass. Full
    `format:check` may report only documented generated-Android ISSUE-007.
15. Independent tester passes, reviewer approves Standards + Spec, and the user
    visually accepts room creation, room detail, sensor/relay addition,
    duplicate-free Dashboard addition and automatic History before memory
    promotion.

## Required manual visual check

After automated gates, ask the user to verify on their target device/web:

1. Settings → device management shows the room list; add a room and confirm it
   opens.
2. Inside one room, add Temperature and Humidity without selecting the room
   again; counter becomes `2/10`.
3. Add a relay by name/slot only.
4. In Dashboard editor for that room, add Temperature once and confirm it
   disappears from available choices and cannot be duplicated.
5. Open History and confirm both registered sensors appear automatically,
   including a clear no-data state before Influx points arrive.
6. Publish a sample numeric MQTT value on the new room/field topic and confirm
   only the matching card updates when a real broker is available.

## Risks and mitigations

- **HIGH shared AddWidgetFlow:** use a narrow one-tap interface, retain overlay
  safe-area ownership, and test through DashboardLayoutEditor/SettingsCoordinator.
- **Breaking telemetry protocol:** update topic parser, event types, tests and
  docs atomically; do not dual-read the ambiguous global topic.
- **Collector mismatch:** document exact MQTT and Influx contracts. Demo tests
  prove UI flow, but real History remains empty until the collector writes the
  `roomId` tag.
- **Legacy multi-capability records:** project rather than destructively split;
  new writes use one field, and binding-level cascade prevents sibling loss.
- **Large preserved diff:** coder must inspect existing changes and edit only
  superseded room/sensor/dashboard/history/telemetry surfaces. Tester/reviewer
  assess cumulative behavior; no reset or silent rollback.
- **Visual residual risk:** Jest cannot prove native text/layout. User visual
  acceptance is explicitly required before final acceptance.

## User approval

- Status: approved.
- Approval evidence: after agreeing to per-field room-scoped topics and fully
  automatic History, the user said `ok giờ layout lại tôi kiểm tra` on
  2026-09-04, authorizing implementation of the revised layout for visual
  inspection.
- No unresolved product question remains in this plan. Supporting duplicate
  same-field sensors in one room requires a future explicit architecture task.
