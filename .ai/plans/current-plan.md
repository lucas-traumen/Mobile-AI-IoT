# Current Task Plan — `dashboard-history-board-touch-share`

Status: APPROVED — user said `ok triển khai` on 2026-09-25 after the
orchestrator restated the five-part scope, including both share buttons.

## Task ID

`dashboard-history-board-touch-share`

## Classification

Feature + UI bug. One approved package, four surfaces:

1. Dashboard switch control is too small to tap.
2. History charts become unreadable when sensors publish every second.
3. Hardware-board cards need an explicit assign button plus a reachable
   action sheet (WiFi setup, share code, share config, unassign).
4. Icon-only controls outside Advanced Settings are under the 44pt touch
   minimum.

The Advanced Settings three-step flow is paused and must stay intact except
for one additive status-mode share button.

## Goal

Make the Dashboard switch, History chart, and hardware-board actions usable
on a phone without changing MQTT commands, room binding rules, or the
settings wizard.

## Current state

- `SwitchWidget` renders the platform `Switch`. Width-2 cards put icon, title,
  and switch on one row. Width-1 cards stack the identity row and a trailing
  unscaled switch. Touch size is the platform intrinsic size. ON is teal,
  OFF is neutral gray. Commands stay optimistic with rollback. GitNexus
  upstream impact of `SwitchWidget` is LOW (0 callers).
- History ranges stay `1h` / `24h` / `7d`, labeled `1 giờ` / `24 giờ` /
  `7 ngày`. `buildFluxQuery` has no `aggregateWindow`. The adapter then
  splices each series to `INFLUX_MAX_POINTS` (500), which drops everything
  after the first 500 raw points. The chart then draws at most
  `MAX_RENDER_POINTS` (50) evenly strided points. Stats and the y-domain are
  computed on that already truncated series, so they do not match the window
  the user selected. `buildFluxQuery` upstream impact is LOW (1 direct).
  `downsampleSeries` upstream impact is LOW (1 direct, the chart card).
- A known board card footer shows the room line (or “chưa gán”) and an 18px
  `⋯` with `padding: 4`. The sheet only routes assign / unassign. BLE WiFi
  setup opens only from the “board chưa thấy trên broker” sheet and is lost
  after that modal closes. There is no share action. The app parses board QR
  labels; it does not generate QR.
- Credentials QR is receive-only (`kind: "credentials"`: mqtt username,
  password, influx token). A future `kind: "system"` is documented as a
  separate task and must not be invented here. BLE provisioning already
  prefills broker + MQTT user/password from settings and does not use the
  Influx token.
- Screen insets and card gaps already use the smart tokens (16 / 16, wide
  inset 24). Dashboard and History header menu buttons are already 44×44.
  The undersized controls are the back buttons (`padding: 4`) on room,
  template, create-room, edit-room, and devices screens; the `⋯` menus on
  board cards and template/room cards; Add Device dialog close targets
  (`hitSlop` 4); and the board search-row QR button (`padding: 10`).
- `react-native` `Share` is available. `package.json` has no `expo-sharing`.
  Do not add a dependency.
- The worktree already contains the uncommitted Advanced Settings recovery
  work. Its plan is paused at
  `.ai/plans/archive/2026-09-25-advanced-settings-sequential-recovery-paused.md`.
  Preserve that layer. Do not reset, reorder, or commit.

## Target state

### 1. Dashboard switch

Replace the platform `Switch` with a drawn control in `SwitchWidget` for
both `layout.width === 1` and `layout.width === 2`.

- The pressable bounds are at least 44×44 points. Do not use
  `transform: scale`; scaling does not grow the hit target.
- Track and thumb stay visually a switch: teal track when ON, neutral gray
  when OFF, thumb uses the existing on-primary / surface colors.
- Accessibility keeps `accessibilityRole` equivalent to a switch,
  `accessibilityState.checked`, `accessibilityState.disabled`, and the
  existing accessible value text (on / off / unknown / offline).
- Offline still disables the control and shows `Không thể điều khiển`.
  Connected-unknown still shows `Chưa rõ trạng thái` and does not look like
  a confident OFF.
- Optimistic toggle, sync rollback, async command-error rollback, and the
  inline error row stay byte-for-byte in behavior.
- Width-1 layout stays stacked (identity row, then the control). Width-2
  stays one row. Titles are not truncated.

### 2. History aggregation

Keep the line chart and the three ranges. Aggregate in Flux before the
phone sees the points.

| Range | `aggregateWindow` | Function | Expected points |
|---|---|---|---|
| `1h` | `1m` | `mean` | about 60 |
| `24h` | `15m` | `mean` | about 96 |
| `7d` | `1h` | `mean` | about 168 |

- `createEmpty: false` so empty buckets do not become fake zero points.
- Min, max, and average are computed on the aggregated series. Do not keep
  a second raw-points stats path.
- Remove the “keep the first 500 raw points” behavior for these windowed
  queries. A defensive cap may remain only as a safety net above the largest
  expected window (168). It must not be what makes a 1-hour chart show only
  the first few minutes.
- The 50-point render stride is no longer the readability strategy. Aggregated
  series are small enough to draw. Keep the existing reveal animation only if
  it still settles on the aggregated series rather than a 50-point subset of
  a raw series. If the coarse 10-point reveal fights the new series, drop the
  coarse phase and reveal the aggregated line directly.
- Tooltip still shows one point: time plus the bucket mean. Do not promise
  per-second spikes. Second-level spikes are intentionally invisible at these
  three ranges.
- Labels stay `1 giờ` / `24 giờ` / `7 ngày`. Do not rename the ranges and do
  not change the dropdown into a segmented control.

### 3. Board card actions

On a discovered board card:

- The footer always shows one primary button, at least 44pt tall:
  `Gán vào phòng` when unbound, `Đổi phòng` when bound. It opens the existing
  assign confirm dialog. Do not invent a new assign flow.
- A separate action button, at least 44×44, opens the sheet. The sheet rows
  are at least 44pt tall and are:
  1. `Cấu hình WiFi` — opens the existing BLE provisioning modal for this
     board’s code, including after a previous modal was closed and including
     when the board is already on the broker. Hidden on web, same as today.
  2. `Chia sẻ mã` — `Share.share` with text containing `boardId` and
     `boardType` only. No QR generation.
  3. `Chia sẻ cấu hình` — `Share.share` with text containing the persisted
     MQTT broker address (host and WebSocket port), MQTT username, and MQTT
     password. Do not include the Influx token, org, bucket, or URL.
  4. `Gỡ gán` — only when the board is bound. Same confirm dialog as today.
- Empty share fields stay empty in the text. Never substitute a secret the
  user did not save. Never log the shared text.
- Share failure (user cancel or platform error) stays on the card and does
  not change assignment or open BLE.

### 4. Settings share button

On the post-save `Trạng thái` mode only, add `Chia sẻ cấu hình`.

- Payload text contains MQTT host, WebSocket port, username, password, and
  the Influx URL, org, bucket, and token.
- Visible only when a persisted config exists (the mode itself already
  requires that).
- Does not add a stepper level, does not change save, probe, mDNS, QR fill,
  or recovery behavior.
- Does not render the token on screen. The token exists only inside the
  share payload.
- Setup steps 1–3 do not show this button.

### 5. 44pt icon targets

Give every icon-only pressable outside the Advanced Settings flow a hit
target of at least 44×44. Prefer an explicit `minWidth` / `minHeight` of 44
over `hitSlop` alone when the control is the thing the user aims at. Do not
enlarge the glyph unless the current glyph is what makes the control look
broken; the requirement is the hit target.

In scope:

- Back buttons on `RoomDashboardScreen`, `CreateTemplateScreen`,
  `CreateRoomScreen`, `TemplateListScreen`, `RoomListScreen`,
  `EditRoomDashboardScreen`, `DevicesScreen`.
- Overflow `⋯` on template/room cards and the board card action button
  (the board one is specified in section 3).
- Add Device dialog close / icon-only controls whose only growth today is
  `hitSlop={{ top: 4, bottom: 4 }}`.
- Board search-row QR button (`boards-scan-button` in the search row).

Already 44×44 and not to be restyled: Dashboard header menu, History header
menu.

Out of this sweep: every control inside `AdvancedSettingsScreen` and
`ui/advanced/**`, except the new status-mode share button, which itself
must be at least 44pt tall.

## Out of scope

- No new npm dependency and no native rebuild.
- No QR generation. Share is plain text through `Share.share`.
- No `kind: "system"` credentials QR, no change to the receive-only QR parser.
- No change to Flux measurement, tag filters, `roomId` / `boardId` identity,
  or the History dropdown labels.
- No per-second spike chart and no bar chart.
- No screen-inset or card-gap restyle. Those tokens are already 16.
- No rewrite of the three-step settings wizard, probes, save, or recovery.
- No commit, no push, no worktree reset.

## Task-level decisions

- **AD-1 — Drawn switch, not a scaled platform switch.** Hit target and
  painted size are the same bounds.
- **AD-2 — Aggregate in Influx.** `1m` / `15m` / `1h` means. Stats use the
  returned series. The 500-point head trim is not the chart policy.
- **AD-3 — Two different share payloads.** Board config share is MQTT only.
  Settings status share adds the Influx token. Neither generates a QR.
- **AD-4 — BLE stays available from a known board.** Opening WiFi setup does
  not require the not-found sheet. Web still hides BLE.
- **AD-5 — 44pt is the hit target.** Header menus that already meet it stay
  as they are. Advanced Settings chrome is not part of the sweep.
- **AD-6 — Paused settings layer is preserved.** The only settings behavior
  change is the additive status-mode share button.

## Capability contract

### GitNexus

- Level: REQUIRED for coder before each production edit and for
  `detect_changes` after the change; REQUIRED for reviewer; OPTIONAL for
  tester.
- Repo: `Mobile-AI-IoT`.
- Preflight on this plan: `SwitchWidget` LOW (0 upstream), `buildFluxQuery`
  LOW (1 direct), `downsampleSeries` LOW (1 direct). The index may be stale
  relative to the uncommitted settings layer. Refresh before trusting impact
  on `AdvancedSettingsScreen` or `BoardsScreen`.
- HIGH or CRITICAL on a symbol that is actually edited must be reported
  before that edit. Do not treat the cumulative worktree union as this task’s
  risk.

### Skills

- Required:
  - Orchestrator: `Create Plan`.
  - Coder: `Implement Plan`, `gitnexus-impact-analysis`, `tdd`.
  - Tester: `Verify Changes`.
  - Reviewer: `Code Review`, `gitnexus-impact-analysis`.
- Recommended:
  - Coder: `gitnexus-debugging` if a chart or share test fails for a
    non-obvious reason; `codebase-design` only if a new share helper needs
    an interface decision beyond this plan.
- Optional:
  - Tester: `gitnexus-exploring`.
- Deny:
  - `implement`, `implement-spec`, Matt `code-review`, nested subagents,
    automatic commit, automatic push.

## Relevant files

- `app-mobile/src/modules/widgets/internal/ui/widgets/SwitchWidget.tsx`
- `app-mobile/src/modules/widgets/internal/ui/widgets/SwitchWidget.test.tsx`
- `app-mobile/src/modules/history/internal/domain/fluxQueryBuilder.ts`
- `app-mobile/src/modules/history/internal/domain/fluxQueryBuilder.test.ts`
- `app-mobile/src/modules/history/internal/domain/seriesStats.ts` (only if the
  aggregated series needs a documented contract note; the math stays min/max/mean)
- `app-mobile/src/modules/history/internal/data/influxV2Adapter.ts`
- `app-mobile/src/modules/history/ui/HistoryChartCard.tsx`
- `app-mobile/src/modules/history/ui/seriesSampling.ts` (only if the render cap
  changes)
- `app-mobile/src/modules/history/ui/chartMotion.ts`
- `app-mobile/src/modules/devices/ui/BoardsScreen.tsx`
- `app-mobile/src/modules/devices/ui/BoardsScreen.test.tsx`
- `app-mobile/src/modules/devices/ui/BleProvisioningModal.tsx` (only if the
  existing modal cannot be opened from a known board without a prop change)
- `app-mobile/src/modules/settings/ui/AdvancedSettingsScreen.tsx` (status-mode
  share button only)
- `app-mobile/src/modules/settings/ui/AdvancedSettingsScreen.test.tsx`
- `app-mobile/src/core/i18n/strings.ts`
- Touch-target files listed in section 5, plus their colocated tests when a
  test asserts the old `padding: 4` or `hitSlop` 4.

Reference only, do not edit unless a test cannot reach persisted MQTT fields
any other way:

- `app-mobile/src/modules/settings/internal/domain/secretsQrContract.ts`
- `app-mobile/src/app/wiring/container.ts`
- `app-mobile/App.tsx`

## Ordered implementation steps

1. Read this plan, `AGENTS.md`, and `.ai/state/current-task.md`. Inspect
   `git status` and `git diff`. Do not revert the paused settings layer.
2. Refresh GitNexus if `BoardsScreen` or `AdvancedSettingsScreen` is absent
   or stale. Run upstream impact on each symbol before editing it.
3. Write failing tests first for: switch hit target on width 1 and width 2;
   Flux window per range; stats computed from aggregated points; board sheet
   rows; share payloads; settings share hidden during setup and present in
   status mode; one 44pt assertion per touched icon control.
4. Implement the drawn switch, then Flux aggregation, then board actions,
   then the settings share button, then the touch-target sweep.
5. Run the focused suites, then `npm test`, `npm run typecheck`, and
   `npm run lint` inside `app-mobile/`. Format only touched files. Run
   `git diff --check` and GitNexus `detect_changes`. Attribute the paused
   settings files separately from this task.
6. Stop. Do not commit or push. The orchestrator sends the result to tester,
   then reviewer.

## Acceptance criteria

1. Width-1 and width-2 switch cards expose a pressable at least 44×44, with
   teal ON and gray OFF, and the existing command/error/offline behavior.
2. A `1h` query contains `aggregateWindow(every: 1m, fn: mean`, a `24h` query
   contains `every: 15m`, and a `7d` query contains `every: 1h`. Empty
   buckets are not created.
3. Min, max, and average shown on a card match the aggregated series, not a
   500-point head or a 50-point stride.
4. A bound board shows `Đổi phòng`; an unbound board shows `Gán vào phòng`.
   The action sheet contains WiFi setup (native only), share code, share
   config, and unassign only when bound.
5. Board share-code text has board id and type and no secret. Board
   share-config text has broker host, port, MQTT username, and MQTT password,
   and does not contain the Influx token.
6. Settings `Chia sẻ cấu hình` is visible only in post-save status mode and
   its payload contains the Influx token plus the MQTT fields. The token is
   not rendered as screen text.
7. Each icon-only control listed in section 5 has a hit target of at least
   44×44. Advanced Settings back/close controls are unchanged.
8. No new dependency. Module boundaries, typecheck, and lint stay green.
9. The paused settings wizard behavior (three steps, no auto-rewind, save
   stays on step 3 on failure) still passes its existing tests.

## Required verification

- Focused Jest: `SwitchWidget`, `fluxQueryBuilder`, `HistoryChartCard` or
  `HistoryScreen`, `BoardsScreen`, `AdvancedSettingsScreen`, and the touched
  screen suites that assert touch targets.
- Full `npm test` in `app-mobile/`, twice if the first run shows a
  transient failure.
- `npm run typecheck` and `npm run lint` in `app-mobile/`.
- Per-file Prettier on touched files. Repo-wide `format:check` is known red
  on generated Android and unrelated README files; do not “fix” those.
- `git diff --check`.
- GitNexus `detect_changes` with this task’s files separated from the paused
  settings layer.
- User smoke later: tap the switch on a 1-column and 2-column card; open
  1 giờ / 24 giờ / 7 ngày and confirm the line is a readable trend; assign a
  board; share code; share board config; share settings config; reopen WiFi
  setup from a known board.

## Risks

- Sharing the MQTT password and the Influx token puts secrets into the
  platform share sheet. That is explicitly approved. Do not also log them
  or place them in a QR.
- A board that is already on WiFi may not advertise BLE. The button must
  still open the existing modal; the modal’s current empty-scan hint remains
  the honest explanation. Do not add a new BLE transport.
- `aggregateWindow` column shape must still satisfy `parseFluxCsv`. If mean
  changes the CSV columns, map them in the existing parser rather than
  adding a second query stack.
- The cumulative worktree will look CRITICAL in GitNexus because of older
  uncommitted layers. Attribute by file, not by that label.
- Jest cannot measure native glyph size. Assert layout style bounds. Real
  finger size stays a user smoke check.

## User approval

- Status: approved.
- User: `ok triển khai` (2026-09-25), after confirming Q5 aggregation, Q7
  option A for the board footer, Q8 the 44pt sweep except the settings
  wizard chrome, Q9 the switch in this same package, and Q10 both share
  buttons (board MQTT-only, settings status mode includes the Influx token).
