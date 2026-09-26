# Current Task

Status: APPROVED — dispatching coder for `dashboard-history-board-touch-share`.
The user approved implementation with `ok triển khai` on 2026-09-25.
Plan: `.ai/plans/current-plan.md`.

Paused underneath, not reverted: `advanced-settings-sequential-recovery`.
Its plan is at
`.ai/plans/archive/2026-09-25-advanced-settings-sequential-recovery-paused.md`.
The only settings change allowed in the new task is the additive post-save
`Chia sẻ cấu hình` button. Do not reset that layer.

## Active task: `dashboard-history-board-touch-share`

- Classification: feature + UI bug.
- Scope: drawn Dashboard switch (≥44pt, both card widths); Flux
  `aggregateWindow` mean at 1m / 15m / 1h for the 1h / 24h / 7d ranges, stats
  on the aggregated series; board card primary assign button plus action sheet
  (WiFi, share code, share MQTT config, unassign); settings status-mode share
  including the Influx token; 44pt hit targets on icon-only controls outside
  Advanced Settings chrome.
- Fix cycle: 0 / 2.
- Coder `ses_f2685728dffeY7YJyYHLHNuMNl` (attempt 1, 2026-09-25): DONE.
  Drawn switch ≥44 on both widths; Flux `aggregateWindow` mean 1m/15m/1h
  with `createEmpty: false`; 500-point head trim removed (defensive cap
  2000); render cap 50→200 so the reveal settles on the aggregated series;
  board footer assign button plus sheet rows WiFi / share code / share MQTT
  config / unassign; settings status-mode share includes the Influx token;
  44pt sweep on the listed back/overflow/dialog/QR controls. Full Jest
  102 suites / 1647 pass, twice. Typecheck clean. Lint 0 errors / 4
  pre-existing warnings. Prettier 32/32 touched files. `git diff --check`
  clean. detect_changes CRITICAL is the cumulative worktree union.
  Pre-edit impact LOW except RoomDashboardScreen and EditRoomDashboardScreen
  HIGH heuristic (one route caller each; style-only). Reviewer must confirm.
  `aggregateWindow` drops the plain `boardId` column; parser pairs by
  `roomId`. No commit, no push.
- Tester `ses_f264fb8acffexsngChKbD1u5QT` (attempt 1, 2026-09-25): PASS.
  Verify Changes invoked. Focused 15 suites / 376 pass. Full Jest 102
  suites / 1647 pass, twice. Typecheck clean. Lint 0 errors / 4
  pre-existing warnings. Prettier 32/32 task files. `git diff --check`
  clean. AC1–AC9 mapped from the diff, not from the coder summary.
  Cumulative GitNexus CRITICAL is the paused worktree union. Coverage
  notes, not failures: stats fixture is 120 points not >200; Influx token
  still exists as a masked field in the collapsed status form; Devices
  back rows set minHeight 44 without an explicit minWidth; labeled chips
  in Add Device still use hitSlop 4 and were outside the icon-only list.
- Reviewer `ses_f264a7244ffeyj0fzGq3Ng95go` (attempt 1, 2026-09-25): APPROVE.
  Code Review + gitnexus-impact-analysis invoked. 0 blockers, 0 majors.
  AC1–AC9 pass. Task-only risk LOW. The two HIGH labels are heuristic
  (one route caller each, style-only back buttons). Cumulative CRITICAL
  is the paused worktree union. Minors, no fix cycle: Flux comment can
  be misread if roomId ever diverges from board code; AC3 fixture is
  120 points not >200; token-not-rendered test scans Text nodes only;
  footer/sheet rows are minHeight 44 by design; one stale "native
  switch" comment in SwitchWidget.
- Next gate: USER ACCEPTANCE and on-device smoke. Do not promote memory,
  archive this plan, commit, or push.

## Paused task record begins below

Status at pause: APPROVED AMENDMENT — mDNS LAN address selection in
`advanced-settings-sequential-recovery`. The user had approved that
implementation with `triển khai` on 2026-09-25. That plan is no longer
`.ai/plans/current-plan.md`.

## Coder checkpoint (2026-09-25, attempt 1 — pre-implementation)

- Required capabilities invoked: `Implement Plan`, `gitnexus-impact-analysis`,
  `gitnexus-debugging`, `tdd` (RECOMMENDED `codebase-design`/`gitnexus-exploring`
  not needed — design is fixed by the approved plan).
- GitNexus index was STALE relative to the worktree (uncommitted
  `wizardSessionStore`/probe services/`ui/advanced/` absent from the graph) →
  refreshed via `node .gitnexus/run.cjs analyze` (3,407 nodes / 9,036 edges).
- Pre-edit upstream impact: `AdvancedSettingsScreen` LOW (1 direct caller);
  `getWizardSessionStore` HIGH-heuristic and `CompletionStep` HIGH-heuristic —
  exact d=1 callers enumerated via cypher: ALL inside the approved scope
  (AdvancedSettingsScreen.tsx + the two colocated test files); the HIGH labels
  come from the SettingsNavigator 9-subprocess fan-out on the same screen
  (same pattern as prior task ledgers). No out-of-scope consumer; proceeding,
  rationale recorded for reviewer confirmation.

## Coder result (2026-09-25, attempt 1): DONE

- Implementation (13 task-attributed files + this state file):
  `AdvancedSettingsScreen.tsx` (mode model: setup/status, no sub-tab bar, all
  automatic fallback removed — triggerFallback/60 s timer/keyed effect/
  connectionSince prop deleted; goToStep/reconfigure helpers; saveError state
  with stay-on-step-3 policy; epoch bump on every draft mutation, no-auth
  toggle and user step transition; QR no longer auto-probes; mDNS select no
  longer advances); `wizardSessionStore.ts` (`activeTab`→`mode`, `setTab`→
  `setMode`, `WizardTab`→`WizardMode`, no broker-loss override); NEW
  `ui/advanced/RuntimeRecoveryNotice.tsx` (+test) — setup-mode recovery
  notice (failed: danger + Thử lại + Cấu hình lại; reconnecting: calm, no
  actions, no timer); `ServerDiscoveryStep.tsx` (explicit `Tiếp tục` =
  `setup-continue-server` when draft host/port valid; select stays on step 1);
  `CompletionStep.tsx` (`saveError` prop → inline error + `Thử lại` primary
  label; `onEditAuth` + conditional `onEditServer` replace `onEdit`);
  `SettingsNavigator.tsx` (connectionSince wiring removed); `strings.ts` (+
  runtimeLostNotice, runtimeReconnectingNotice, reconfigureAction,
  editAuthAction, editServerAction; − setupTab, statusTab, editFullConfig,
  mqttLostFallbackNotice, editConfig); settings README flow section rewritten.
  ConfigurationStepper/AuthenticationStep/MqttStatusCard/InfluxDbStatusCard/
  ConnectionWidget intentionally UNCHANGED. telemetryStore untouched
  (connectionSince field retained, now unused by settings).
- Gates: focused 11 suites/113 tests; FULL Jest 102 suites/1607 pass/0 fail
  ×2 (baseline 101/1596 → +1 suite +11 tests); typecheck clean; lint 0
  errors/4 documented pre-existing warnings; per-file Prettier 13/13;
  `git diff --check` clean; detect_changes(all) CRITICAL = expected
  multi-layer cumulative worktree union (pre-existing Devices/Widgets/
  Telemetry/package layers + this task's settings surface) — task-attributed
  files listed above; numstat cannot separate stacked layers inside the same
  settings files (reviewer must attribute by content).
- Notes for reviewer: (1) `savedOk` remains the session seal (set on save
  success) but is now unobservable in setup mode (the only path back is
  Cấu hình lại, which unseals) — kept as the plan's "records all three steps
  complete" mechanism; (2) the recovery notice requires a PERSISTED config
  (nothing to lose on first run); (3) `setup-continue-server` and the manual
  fallback's `Tiếp tục` share the same zod host/port gate.
- Next action: dispatch independent tester (same task_id; Verify Changes).

## Tester result (2026-09-25, attempt 1): PASS_WITH_NOTES

- Required `Verify Changes` invoked. Focused Advanced Settings/UI suites:
  10 suites / 107 tests passed. Settings contract suites: 11 suites / 93
  tests passed. Full Jest: 102 suites / 1607 tests passed, run twice.
- Typecheck passed. Lint: 0 errors and 4 documented pre-existing warnings.
  Task-attributed Prettier checks passed. `git diff --check` passed.
- Acceptance behavior confirmed: three official setup steps, no status tab
  split, save→status mode, draft-only mDNS/QR, explicit gates, non-blocking
  Influx failure, Step 3 save retry/manual edit without auto-back, no runtime
  60-second yank, real retry lifecycle, and stale probe protection.
- Non-blocking note: repository-wide format check remains red on generated
  Android and unrelated README baseline files; touched settings files pass.
- Cumulative GitNexus CRITICAL is union noise from unrelated uncommitted
  Devices/Widgets/Telemetry/package/documentation layers; not task-only risk.
- Next action: dispatch independent reviewer with Standards + Spec review.

## Reviewer result (2026-09-25, attempt 1): APPROVE

- Required `Code Review` and `gitnexus-impact-analysis` invoked; recommended
  settings/runtime seam inspection also completed. Review was read-only and
  changed no files. Standards and Spec axes found no blocker or major issue.
- Acceptance criteria AC1–AC11 were mapped and passed: exactly three official
  stepper levels, setup/status mode transition without a tab bar or fourth
  step, explicit gates, non-destructive Step 3 save retry/manual edit,
  no automatic runtime rewind, real telemetry retry, stale-probe protection,
  contract preservation, and verification gates.
- Scope attribution confirmed the task's 13 implementation files plus the
  state checkpoint. The GitNexus CRITICAL result is cumulative worktree union
  noise from unrelated Devices/Widgets/Telemetry/package/documentation layers.
- Minor notes, no fix cycle: unused `runDualProbeRef` in
  `AdvancedSettingsScreen.tsx` (remove on a future touch), two missing
  step-specific runtime-notice assertions, and Android/web visual smoke still
  user-gated. Pre-existing string-literal and async-unmount hygiene notes are
  out of scope.
- Next action: user acceptance and Android/web smoke. Do not promote memory,
  archive the plan, commit, or push before acceptance.

## Follow-up diagnostic input (2026-09-25): server healthy, client path pending

- User reports the server side is healthy: `avahi-daemon` is active,
  `/etc/avahi/services/smarthome.service` is installed, and
  `avahi-browse -t _smarthome._tcp` sees `Smart Home Server` on the Wi-Fi and
  Docker interfaces over IPv4/IPv6.
- Repository inspection confirms the mobile client already browses the same
  contract: `MDNS_SERVICE_TYPE = 'smarthome'`, protocol `tcp`, domain `local.`
  → native `_smarthome._tcp.`. iOS `NSBonjourServices` and the service tests
  pin the same type. Do not “fix” this by guessing `_mqtt._tcp` or adding a
  second service type.
- Runtime update (2026-09-25): the user installed and opened a native debug
  APK on a physical Samsung `SM_A107F` (`com.example.iot/.MainActivity`), so
  Expo Go is ruled out for this run. The app repeatedly logs
  `Mqtt: connecting to ws://192.168.2.28:9001` and does not log `connected`
  or a classified MQTT error in the supplied output. This confirms the saved
  host/port but does not prove mDNS discovery succeeded or failed.
- Remaining hypotheses are therefore runtime/network: the phone and server may
  not share the effective LAN path, multicast `224.0.0.251:5353` may be blocked
  by guest/AP/VPN networking, or the MQTT WebSocket connection is failing for
  an auth/network reason not yet visible in the supplied logs. The installed
  native binary also still needs confirmation that it includes the current
  Android permissions and zeroconf cleanup patch.
- Diagnostic classification to collect: native error state vs clean 10-second
  empty result vs resolved event rejected by host/port mapping. Required user
  evidence: physical device/emulator, Wi-Fi/subnet, native Service Browser for
  `_smarthome._tcp`, and logcat around `RNZeroconf`/`NsdService`. A native
  rebuild is required if the installed binary is stale or the app is running
  in Expo Go; Metro reload is not enough.
- LAN-address amendment (2026-09-25): coder continued
  `ses_f28259bfeffeF1DetzXqIDX2sN` and changed only
  `mdnsDiscoveryService.ts` and `mdnsDiscoveryService.test.ts`. `pickHost`
  now prefers the first LAN-reachable IPv4 and skips loopback, link-local,
  Docker `172.16–31.*`, and Tailscale CGNAT `100.64–127.*`; if every address
  is unreachable it keeps the first IPv4 instead of dropping the service.
- Coder evidence: focused `mdnsDiscoveryService` 14/14, typecheck clean,
  per-file Prettier clean, `git diff --check` clean. Pre-edit impact LOW.
  Orchestrator independently inspected the exact diff; the runtime address
  list resolves to `192.168.100.3`.
- Runtime update after the LAN-address fix: the reloaded app still logs
  `Mqtt: connecting to ws://192.168.2.28:9001` followed by
  `Mqtt: error connack timeout`. That host is persisted settings, not the
  current mDNS selection; the current Wi-Fi server is `192.168.100.3`.
  `connack timeout` means TCP/WebSocket reaches a peer but no MQTT CONNACK
  returns before timeout.
- UX amendment (2026-09-25): Step 2 now renders editable InfluxDB URL, org,
  bucket, and masked token fields. Existing QR parsing fills `influxToken`
  into that draft; mDNS continues to fill non-secret URL/org/bucket. No save
  or probe happens from field edits or QR. Coder evidence: focused 63/63,
  typecheck and Prettier clean.
- UX amendment (2026-09-25, user `ok`): `Chọn máy chủ này` now fills the
  non-secret draft and immediately calls `goToStep(2)`. It still does not
  save or probe. Manual entry remains behind its explicit `Tiếp tục`.
  Coder evidence: focused screen/component suites 48/48 after a red-to-green
  cycle, typecheck and targeted Prettier clean. Orchestrator confirmed the
  new callback in `AdvancedSettingsScreen.tsx`.
- Runtime update after saving the new host: startup still uses the stale
  `192.168.2.28`, then `settings:changed` switches to
  `ws://192.168.100.3:9001`. Subscriptions then fail with `Connection closed`
  and there is no logged MQTT error. This means the socket closes before the
  MQTT session is usable; credentials and broker acceptance still need
  verification. The empty mDNS result remains a separate native discovery
  issue because manual host entry works and Avahi is confirmed correct. No
  commit/push.

## Active task: `advanced-settings-sequential-recovery`

- User request: redesign the current three-step Advanced Settings UI and make
  failure recovery non-destructive.
- User correction: the flow MUST remain sequential so the user knows the
  current state.
- Revised target: keep the three-step guided flow with visible current /
  completed / locked states. After successful confirmation/save, transition to
  a separate post-save `Trạng thái` mode (informally “step 4”, NOT an official
  step and NOT a fourth stepper level). Remove the current two-tab split;
  `Thiết lập` and `Trạng thái` become modes of one flow, not user-selectable
  tabs.
- Navigation proposal: mDNS/QR fill only; explicit `Tiếp tục` and successful
  MQTT probe unlock the next step; previous steps can be reopened explicitly.
- Recovery proposal: probe/save/live MQTT failures preserve the draft and stay
  in the current official step or post-save status mode; live loss shows
  explicit `Thử lại` / `Cấu hình lại`; no 60-second timer may reset or navigate
  the user without consent. `Cấu hình lại` is the only explicit transition
  from status mode back to setup Step 1.
- Step 3 save-error policy: do not auto-navigate backward. Keep the user on
  Step 3 with `Thử lại` as the primary action; offer explicit
  `Chỉnh sửa xác thực` / `Chỉnh sửa máy chủ` actions when the user wants to
  edit. Manual edits invalidate dependent probe gates, but preserve the draft.
- Classification: UI/flow refactor + reliability improvement.
- Plan: `.ai/plans/current-plan.md`.
- Status: approved; coder dispatch is the next checkpoint. Tester/reviewer
  have not been dispatched. No production file was edited by the orchestrator.
- The approved save-error policy is: Step 3 save errors stay on Step 3 with
  `Thử lại` primary; contextual manual edit actions may return to Step 2/1;
  no automatic backward navigation or draft loss.
- GitNexus preflight lower bound: current committed-head index reports LOW for
  `AdvancedSettingsScreen`, `SettingsNavigator`, and `applySettings`; the
  Advanced Settings implementation is uncommitted and the index must be
  refreshed before coder impact is trusted.

## Paused task: `dashboard-editor-switch-compact-layout`

The switch compact-layout task remains implemented and reviewed but awaits the
user's Android smoke/acceptance. Its plan was preserved at
`.ai/plans/archive/2026-09-23-dashboard-editor-switch-compact-layout-paused-for-advanced-settings.md`.
Do not promote memory or commit it while the user is redirecting attention to
Advanced Settings.

## Active task: `dashboard-editor-switch-compact-layout` (2026-09-23)

- Classification: bug — responsive UI/layout regression in `SwitchWidget`.
- Goal: prevent seeded relay names (`Đèn`, `Quạt`) from splitting at arbitrary
  characters in narrow editor cards; preserve full title text, native switch
  semantics, and persisted layout behavior.
- Approved scope: `SwitchWidget.tsx` + `SwitchWidget.test.tsx` only, focused
  layout regression coverage, and required verification. No grid/store/seed
  changes, no dependency/native changes, no commit/push.
- Root cause: the widget always puts a fixed 40pt icon chip, flexible title,
  and intrinsic native `Switch` in one horizontal row. A logical 1x1 card is
  too narrow for all three; React Native wraps short Vietnamese names. The
  editor chrome is already a separate flow row and is not to be changed.
- GitNexus preflight: `SwitchWidget` upstream impact LOW (0 callers/processes);
  `WidgetCard` context LOW (7 affected symbols, reference-only). Index is at
  current committed HEAD; no refresh is required before this target-only edit.
- Fix cycle: 0 / 2.
- Coder `ses_f30fe67daffer4RHTiM7Q8TsiX` (attempt 1, 2026-09-23): DONE —
  changed ONLY `SwitchWidget.tsx` (+127/−76) and
  `SwitchWidget.test.tsx` (+163/−0). `config.layout.width === 1` now renders
  identity (40pt icon + full title/caption) in its own row and the unscaled
  native `Switch` in a trailing control row below; `2x1` preserves its
  original single-row anatomy. No truncation/ellipsis, grid/store/seed/API,
  dependency, native, or unrelated production change. Required capabilities
  invoked: `Implement Plan`, `gitnexus-impact-analysis`, `tdd`; independent
  pre-edit impact LOW (0 production callers/processes), no index refresh.
  Coder gates: focused SwitchWidget 48/48; full Jest **101 suites / 1600
  pass / 0 fail** twice after implementation (first earlier full attempt had
  3 non-reproducing transient failures); typecheck clean; lint 0 errors / 4
  documented pre-existing warnings; Prettier 2/2; `detect_changes(all)` HIGH
  only from the pre-existing multi-task worktree union. Task-attributed files
  independently numstat-verified as the two sanctioned widget files. No
  commit/push/reset/stash. User Android visual smoke remains required because
  Jest cannot measure native glyph/font scaling.
- Tester `ses_f30d63357ffe5SaF5szsM1M8S9` (attempt 2, resumed after
  connection reset): PASS_WITH_NOTES. Required `Verify Changes` invoked;
  focused 1/48 pass; full Jest 101/1600 pass twice; typecheck clean; lint 0
  errors / 4 documented non-target warnings; repository-local Prettier 2/2;
  `git diff --check` clean. Scope accounting confirms only the two approved
  widget files are task-attributed; cumulative worktree has 45 path entries
  from pre-existing Settings/Devices/telemetry/AI layers. Non-blocking notes:
  no dedicated Bơm assertion; structural tests cannot measure Yoga/native glyph
  wrapping; repo-wide format check remains the known generated-Android/tooling
  baseline issue. Tester recommends Android visual smoke before acceptance.
- Reviewer: PENDING independent dispatch. Required skills: `Code Review`,
  `gitnexus-impact-analysis`; must review Standards + Spec axes, actual diff,
  tester evidence, and cumulative-scope accounting without editing.
- Reviewer `ses_f308ed0a2ffe402mLdDDyARmcf` (attempt 1, 2026-09-23): APPROVE —
  `Code Review` + `gitnexus-impact-analysis` invoked; 0 blockers, 0 major,
  task-only risk LOW. Standards axis: structural reflow is idiomatic and the
  native Switch remains unscaled/accessibility-safe; JSX extraction preserves
  state/effects byte-for-byte. Spec axis: persisted width 1 is the correct
  discriminator, width 2 remains one-row, title is not truncated, and scope is
  exactly two files. Four minor notes: Android/native visual smoke and
  font-scale remain user-gated; widgets README has a stale one-row sentence
  outside scope; no dedicated Bơm assertion; one harmless test self-documenting
  nit. Reviewer requests no fix cycle.
- Verification: PASS_WITH_NOTES. Focused 48/48; full 101 suites/1600 tests
  twice; typecheck clean; lint 0 errors/4 pre-existing warnings; Prettier 2/2;
  diff check clean. The repo-wide format command remains red on generated and
  non-target baseline files (ISSUE-007), not on task files.
- Next gate: USER ACCEPTANCE. Ask the user to perform Android smoke in the
  dashboard editor for 1x1 `Đèn`, `Quạt`, and `Bơm` (including larger font
  scale if possible), confirm the title is not split, the switch in the lower
  row is easy to tap, and the resize badge still denotes the next size. Do not
  promote memory, archive this plan, or commit until the user accepts.
- Tester: PENDING — independent `Verify Changes` gate after coder.
- Reviewer: PENDING — independent `Code Review` + GitNexus impact after tester.

## Paused underlying task (preserved, not replaced)

The prior uncommitted `advanced-config-stepper-redesign` work remains intact
and is not part of this bug fix. Its full plan was moved to
`.ai/plans/archive/2026-09-22-advanced-config-stepper-redesign-in-progress.md`;
the historical detail below remains as recovery context. Do not reset, reorder,
or declare that task accepted while this task runs.

## Active task: `advanced-config-stepper-redesign` (2026-09-21)

- 3-step guided flow (Máy chủ → Xác thực → Hoàn tất) replacing the 3-tab bar;
  slim inline-mDNS step-1 card (modal retired); step 2 = username/password +
  no-auth option + kept QR affordance + REAL one-shot MQTT probe (new
  `mqttProbeService`, isolated from the telemetry client); step 3 = summary +
  Lưu cấu hình/Chỉnh sửa; MQTT status card BELOW the stepper with per-state
  actions; InfluxDB area with CHỈ ĐỌC badge + 4-field Cấu hình form (D3
  reversal); status cards + Influx area HIDDEN until something is persisted
  (first-run = title + stepper + step card only). Component split into
  `ui/advanced/` (7 components); file/route name kept (D6).
- Decisions: D1 inline mDNS / D2 keep QR / D3 Influx form back / D4 real
  probe / D5 prefix only in manual fallback / D6 keep names. Supersessions to
  record in memory at acceptance: modal→inline, 3-tab→stepper,
  no-Influx-form→form, collapse line→Chỉnh sửa.
- Builds on the uncommitted worktree (now 4 stacked layers). JS-only; no
  native rebuild needed for THIS task.
- Fix cycle: 0 / 2
- Child sessions:
  - coder `ses_f3b879563ffeIDRsRhiFJhKAxM` (attempt 1, 2026-09-21): **DONE**
    — thin composition screen (1839→~860 dòng) + 17 NEW files (7 spec
    components + FieldRow shared primitive + 7 component tests +
    mqttProbeService + test; ≈3558 dòng mới). REAL one-shot MQTT probe
    (throwaway client, settled-guard cleanup, web-guard; never touches
    telemetry client). First-run visibility rule via NEW optional
    `persistedMqtt` prop (+`SettingsNavigator` +4 lines, additive).
    Gates: typecheck clean, lint 0 err/4 pre-existing, FULL **98 suites /
    1542 pass / 0 fail** (+8 suites/+32: 63 new − 49 old screen + 18
    rewritten; run twice), Prettier 23/23, impact LOW, detect_changes HIGH =
    5-layer worktree union (expected). Strings +39/−14. 5 deviations
    (persistedMqtt prop; FieldRow 8th file; web keeps 2a gate; mount-resolves
    first incomplete step; simplified retry-timer test). Risks flagged:
    probe cleanup double-resolve/leak scrutiny, test-churn accounting,
    superseded contracts for memory promotion, classify duplication note.
- AMENDMENT 1 (2026-09-22, user "ok"): A1 monotonic stepper (`savedOk`
  reset on Chỉnh sửa + fallback; invariant pins); A2 broker-loss fallback
  60 s hybrid (telemetryStore ADDITIVE `connectionSince` episode timestamp
  — the ONLY telemetry file pair touched; SettingsNavigator +optional prop;
  mount-resolve + runtime effect; immediate on 'failed'; jump to step 1
  from step 2 OR 3, banner-only at step 1; in-flight probe invalidation
  guard); A3 Influx draft probe method C (NEW influxProbeService + R1 spike
  with STOP condition on history public api; step-2 dual probe + auto-run
  once after QR; CompletionStep influx row; post-save Influx card seeding;
  `statusUnknown` '—' → 'Chưa kiểm tra'). User decisions: 60 s threshold /
  method C / jump from step 2 too / merged into this task, one combined
  verify cycle.
- Amendment coder: RESUMED `ses_f3b879563ffeIDRsRhiFJhKAxM` (attempt 2,
  2026-09-22): **DONE** — A1 savedOk resets + sealed step3 + monotonic
  pins; A2 telemetryStore `connectionSince` (+28/−2, the ONE sanctioned
  telemetry touch; +68 test lines / 5 episode pins; same-state = zustand
  no-op → no consumer churn), SettingsNavigator +12 optional prop, mount +
  keyed-effect fallback (immediate 'failed', 60 s arming for
  'reconnecting', effect-cleanup clears), banner + jump-to-step-1 from
  steps 2/3 + banner-only at step 1, `probeEpochRef` race guard; A3 NEW
  influxProbeService (+138; R1 path 1: throwaway `InfluxV2Adapter` per
  probe via history PUBLIC api + FetchLike abort wrapper, ~8 s, web guard,
  settle-once; +10 tests) — dual probe (MQTT gate unchanged, influx
  concurrent, honest skip, both settle ≤ 8 s before presenting), QR
  auto-run once (nonce + consumed-ref), CompletionStep influx row,
  post-save seeding (ok AND fail, honest). Strings +6 / 1 value-change
  (`statusUnknown` '—' → 'Chưa kiểm tra'); testIDs +2
  (`advanced-influx-probe-result`, `completion-influx`). Gates: typecheck
  clean, lint 0 err/4 pre-existing (compiler-era hooks errors redesigned
  away), FULL **99 suites / 1579 pass / 0 fail** (+1/+37, run twice),
  Prettier clean, impact LOW ×2 (AdvancedSettingsScreen exact,
  setConnection 0-upstream leaf), detect_changes HIGH = 6-layer cumulative
  union (expected, numstat-attributed). 5 deviations (adapter-class R1,
  both-probes settle before advance, fail-seeding, hooks-lint idioms,
  constant in screen file) — all reasoned, none plan-breaking. JS-only —
  Metro reload đủ, KHÔNG native rebuild.
- **A4** (user review 2026-09-22: "quay về bước 1 2 không nên hiện, chỉ hiện
  sau khi xác nhận"): MQTT card + Influx area render ⟺ `hasPersistedConfig
  && (discovery === null || currentStep === 3)` — web carve-out keeps
  persisted-only; fallback/Chỉnh sửa hide; step-3 reveal; Influx form
  step-3-only; liveMqtt derivation untouched (pre-save card = old persisted
  config, truthful). Same session attempt 3: **DONE** — 3 files (screen
  ~+20/−14 + rule v2 comments, 8 test pins rewritten ±0 count + `reachStep3`
  helper, README wording v2); gates IDENTICAL to A3 baseline (99/1579/0,
  lint 0/4, typecheck clean, Prettier 3/3); **no deviations**; A4 touched
  NO telemetry file. 7th stacked layer; detect_changes file set unchanged.
- **AMENDMENT 2** (2026-09-22, user "ok" after reporting: "khi xác nhận mất
  tab Kết nối thành công, hiển thị 2 trạng thái kết nối" + widget redesign
  sketch + "khi nhấn vào cấu hình nâng cao vẫn phải giữ được step đang
  làm"): root causes traced — X1 runtime fallback fires mid-reconfiguration
  (old client still failing while draft fix pending), X2 screen-local
  currentStep lost on remount. B1 suppression (`probing || (step 3 &&
  !savedOk)`, transition-keyed, re-arm on save/manual-return, mount rule
  unchanged); B2 wizard session store (currentStep+savedOk, module-scope,
  NO AsyncStorage, A2 mount-fallback overrides stored position); B3
  ConnectionWidget ×2 (color+name+short status+Kiểm tra lại, no Cấu hình
  button) + centered detail panels (MQTT: state/host:port/auth/error+retry
  [+Cấu hình when unconfigured → step 1]; Influx: status + 4-field form
  moved inside + hint + Kiểm tra) — CompletionStep + visibility v2
  unchanged; NO telemetry changes (B1 is screen-side gating only).
- Amendment 2 coder: RESUMED `ses_f3b879563ffeIDRsRhiFJhKAxM` (attempt 4,
  2026-09-22): **DONE** — B1 keyed-effect redesign (deps
  `[connectionState, connectionSince, probing, currentStep, savedOk]`,
  per-key consumed-suppression, ref-mirrored fire-time gate check;
  mount rule + post-save arm untouched); B2 NEW
  `internal/ui/wizardSessionStore.ts` (70 lines, `currentStep:
  WizardStep | null`, module-scope, NO AsyncStorage; mount: broker-loss
  override → stored → host-resolve); B3 NEW shared
  `ui/advanced/ConnectionWidget.tsx` (283) + MqttStatusCard/
  InfluxDbStatusCard restructured (Influx 4-field form moved INSIDE its
  detail; info box folded in; group title stays). Strings ZERO additions;
  testIDs new `advanced-*-status-body/-detail*`, `mqtt-detail-*`,
  `influx-detail-check`; retired `advanced-mqtt-connecting`,
  `advanced-influx-configure`, `advanced-influx-form*`,
  `advanced-influx-title`. Gates: typecheck clean, lint 0/4, FULL **101
  suites / 1596 pass / 0 fail** (+2 suites/+17 tests, run twice),
  Prettier 10/10, detect_changes HIGH = 8-layer union (unchanged file
  set + untracked adds; telemetry byte-untouched since A2). 2
  interpretation notes (no quick action when MQTT unconfigured;
  null-position semantics), 0 deviations. 8th stacked layer; JS-only.
- **AMENDMENT 3** (2026-09-22, user "ok" on iterated wireframe): C1 sub-tab
  `Thiết lập | Trạng thái` (widgets MOVE into Trạng thái; segmented row
  hidden first-run, appears after first persist; web = Trạng thái content
  only; supersedes A4 position rule); C2 save→auto-switch Trạng thái,
  re-enter Thiết lập keeps sealed step 3, fallback→Thiết lập step 1 from
  either tab, `Chỉnh sửa cấu hình` in Trạng thái, B2 store +activeTab
  (mount: fallback-override → stored → Trạng thái default); C3 buttonless
  widgets (dot+name+label+`›`, whole body ≥44px opens detail; check
  buttons relocate INTO panels, same testIDs).
- Amendment 3 coder: RESUMED `ses_f3b879563ffeIDRsRhiFJhKAxM` (attempt 5,
  2026-09-22): **DONE** — C1 segmented subtabs
  (`advanced-subtabs`/`subtab-setup`/`subtab-status`, 44px, shown only
  after first persist; first-run look unchanged; widgets live ONLY in
  Trạng thái; web = hint + widgets only; A4 visibility-v2 superseded
  cleanly); C2 wizardStore +`activeTab`/`setTab` (mount: broker-loss →
  stored → fresh default persisted→Trạng thái; save auto-switch; sealed
  step-3 return; fallback→Thiết lập 1 from any tab; `status-edit-config`
  → setup+step1+unseal; unconfigured MQTT `Cấu hình` lands on wizard
  tab); C3 buttonless widgets (dot+name+label+`›`, whole body ≥44px
  opens detail; retry/check relocated INSIDE panels, same testIDs).
  Strings +3 (`setupTab`, `statusTab`, `editFullConfig`). Gates:
  typecheck clean, lint 0/4, FULL **101 suites / 1595 pass / 0 fail**
  (−1 net: ConnectionWidget −2, wizardStore +1, screen count unchanged),
  Prettier clean, detect_changes HIGH = 9-layer cumulative union
  (expected). 3 interpretation notes (Cấu hình→setTab+setStep; B2
  visit-2 draft world; test-count accounting), 0 plan deviations; no
  telemetry change. 9th stacked layer; JS-only.
- Amendment fix cycle: 0 / 2
- Tester: PENDING — combined gate covers the FOUR settings layers (modal-
  layout, 3-tab, crash-fix, stepper-redesign + Amendment 1) + the separate
  devices-room-actions-modal layer; full-suite rerun + numstat attribution
  across the 6-layer union required.
- Reviewer: PENDING — scrutinize probe cleanup paths (MQTT + NEW Influx),
  the deviations, the telemetryStore episode semantics, the fallback race
  guard, and per-layer scope isolation.

## mDNS on-device saga (2026-09-21) — RESOLVED, "ok nhận được rồi"

Three stacked causes, all fixed: (1) zeroconf MulticastLock crash → patch
(task below); (2) APK missing CHANGE_WIFI_MULTICAST_STATE — `android/` was
prebuilt before app.json gained permissions → user ran `npx expo prebuild -p
android` + rebuild (environment fix, NOT a repo change); (3) ColorOS
NsdManager/mdnsd daemon stuck after repeated failed scans → device restart
resolved. Server side verified healthy throughout (avahi TXT correct, ufw
5353 allowed, Docker-published ports bypass ufw). Backend reviewed clean.

## Task superseded as ACTIVE plan: `mdns-android-multicastlock-crash`

- Root cause (evidence-verified on user device, 2026-09-21):
  `react-native-zeroconf@0.14.0` Android `NsdServiceImpl.stop()` releases the
  ref-counted MulticastLock without `isHeld()` and nulls the reference AFTER
  the release — one unbalanced release throws `under-locked`, skips the
  null-out, and every subsequent `scan()` (which calls stop() first) crashes
  before starting discovery. Device sends zero mDNS packets (2× tcpdump: no
  packets from phone `.9` while LAN multicast healthy — Spotify/Chromecast
  chatter visible, avahi TXT correct, ufw 5353 allowed). The typed
  `unavailable` error renders the same "Không thấy server" state as an empty
  scan, masking the crash.
- Fix: patch-package patch of `NsdServiceImpl` (isHeld guard + try/catch +
  always-null) OR upstream upgrade if a fixed release exists (coder checks;
  expect none); modal gains a distinct honest error state ("Không quét được
  trên thiết bị này") + retry + `Nhập tay địa chỉ` fallback in BOTH
  none-states; KNOWN_ISSUES entry.
- NATIVE REBUILD mandatory after patch (user runs `npm run android`); then
  user's on-device acceptance: scan lists
  `Smart Home Server — 192.168.2.28:9001`.
- Fix cycle: 0 / 2
- Child sessions:
  - coder `ses_f3be8fbcdffeSkJxEHzIYqa9mJ` (attempt 1, 2026-09-21): **DONE**
    — upstream check: 0.14.0 is newest (no fixed release) → patch path.
    Patched `NsdServiceImpl.stop()` (isHeld-guarded release, try/catch,
    ALWAYS null-out) as `patches/react-native-zeroconf+0.14.0.patch`
    (patch-package@^8.0.1 dev-dep + postinstall; scoped regeneration after
    build-artifact bloat; patches/ not gitignored; reapply proven twice incl.
    full reinstall). Honest error UI: `scanState` + `'error'` variant,
    distinct copy (`findServerErrorTitle/Hint`), retry + `Nhập tay địa chỉ`
    fallback in BOTH none+error states. Gates: focused 49/49, mdns 25/25,
    FULL 90 suites/1510 pass/0 fail (+2, exact accounting), typecheck clean,
    lint 0 err/4 pre-existing, Prettier 6/6. Impact LOW ×2;
    detect_changes HIGH = cumulative 4-layer worktree union (expected).
    2 deviations (no new testID — existing IDs reused in both states;
    scoped patch regeneration). Draft ISSUE-026 entry in report.
- Tester: PENDING — combined gate should cover BOTH this task AND the
  pending `advanced-settings-3tab-setup` layer (same screen/modal), plus the
  rolled-in `advanced-mdns-modal-layout` gate. Full-suite rerun required.
- Reviewer: PENDING — verify numstat attribution across the 4 stacked
  layers; scrutinize the Java patch (compile check only happens at the
  user's native rebuild).
- MANUAL USER GATE (AC4): `npm run android` native rebuild, then on-device
  scan must list `Smart Home Server — 192.168.2.28:9001`. Metro reload is
  NOT enough (Android source change).

## Coder result — `advanced-settings-3tab-setup` (2026-09-21)

- coder `ses_f3c89e32dffewiWgx194OYqBae` (attempt 1): **DONE**
  — 3-tab quick-setup implemented on the uncommitted worktree base.
  4 files (screen 1806 lines, test 1666/47 tests, strings +4/−3, README
  flow section). Gates: focused 47/47, mDNS/QR 4 suites/45, FULL 90
  suites/1508 pass/0 fail (+6, run twice), typecheck clean, lint 0 err/4
  pre-existing, Prettier 4/4. GitNexus: index fresh, impact LOW
  (SettingsNavigator/App), detect_changes HIGH = known 3-task worktree
  union (settings symbols = this task; DevicesScreen = room layer,
  numstat-verified). Modal state machine + contracts untouched; public
  props unchanged. 5 deviations (status cards stay outside tab area;
  `advanced-save` testID dropped for single `setup-save`; default tab
  resolved at mount — no typing auto-advance; QR affordances web-hidden;
  probe tests edit token not URL). Risks flagged: on-device smoke test,
  deviation 2+3 scrutiny, `{n}/3` includes optional username.
- Plan archived: `.ai/plans/archive/2026-09-21-advanced-settings-3tab-setup.md`.
- Tester: PENDING — combined gate covers this task + the rolled-in
  `advanced-mdns-modal-layout` tester gate (modal unchanged inside tab 1).
- Reviewer: PENDING — scrutinize deviations 2/3 and the AD-4 supersession.

## Task superseded as ACTIVE plan: `advanced-mdns-modal-layout`

## Review checkpoint (2026-09-21)

- Reviewer `ses_f3d315011ffegp2qlxIFNQZtLA` (attempt 1, first dispatch was
  cancelled and re-dispatched): **APPROVE** — 0 blocker / 0 major.
- Task isolation verified independently: DevicesScreen numstat matches the
  room-task ledger exactly; mDNS service/contract/SettingsNavigator byte-
  preserved; strings additions are exactly 3 mDNS keys; screen delta ≈
  +240/−3 over the QR task's recorded totals; full-suite +4 tests match.
- Correctness code-traced: closeDiscoveryModal freezes scanAliveRef BEFORE
  stop() (the sync partial-delivery race guard); secrets structurally
  unreachable in the patch; modal follows the AddDeviceDialog recipe.
- 4 minors (no fix cycle required): (1) screen-level sync-stop race unpinned
  — fake stop() only counts calls, so reordering the freeze-before-stop
  lines would pass tests; (2) result-row a11y label lacks host:port;
  (3) results state has no in-place rescan (close+reopen — design note);
  (4) modal unmount-on-close skips fade-out (cosmetic).
- Gates NOT independently rerun (reviewer bash restricted to read-only git);
  coder evidence assessed and numerically consistent. Task-scoped impact
  LOW; cumulative detect_changes HIGH = 3-task worktree union.

## Previous task: `devices-room-actions-modal`

- Status: implemented and reviewer-approved; tester/user acceptance remained
  pending when the user redirected attention to Advanced Settings/mDNS.
- Its production changes remain uncommitted in the worktree and must not be
  reverted or silently folded into this task.

## Current implementation checkpoint: `advanced-mdns-modal-layout`

- Changed task files reported by coder: `AdvancedSettingsScreen.tsx`,
  `AdvancedSettingsScreen.test.tsx`, `core/i18n/strings.ts`, and settings
  README wording. mDNS service/contract were intentionally untouched.
- Coder behavior: compact native action row opens a centered modal with idle,
  scanning, results, none/error + retry; result selection preserves secrets
  and never saves; close/scrim/back freezes the late-result guard before stop;
  web gate remains intact.
- GitNexus: fresh index; pre-edit `AdvancedSettingsScreen` impact LOW. Post-
  change cumulative detect_changes HIGH because the worktree combines the
  prior room/settings tasks; coder isolated this task's expected settings
  surface. Reviewer must independently confirm scope.

## Active task: `devices-room-actions-modal` (2026-09-21)

- Goal: hide persistent room-card edit/delete icons behind a selected-room
  action menu; preserve card-body navigation; keep sensor/relay entry in a
  centered modal.
- Scope: devices UI + focused tests only. Existing unrelated
  `settings-secrets-qr` worktree changes are preserved and are not part of this
  task.
- User approval: received (`ok`).
- Next checkpoint: independent tester verification. The harness tester role is
  user-triggered in this environment; await the user's explicit verification
  request before dispatching it.
- Fix cycle: 0 / 2
- Child sessions:
  - coder `ses_f3f5bc108ffeybdE7iHvKLRmpP` (attempt 1, 2026-09-21): DONE —
    implemented approved room action menu + centered rename dialog; kept
    AddDeviceDialog unchanged; focused 41/41, full 90 suites/1498 pass; type,
    lint, per-file Prettier clean; GitNexus refreshed via repair-fts/full
    rebuild, impact and detect_changes run.
  - reviewer `ses_f3f49d8ffffeXkUrQi9tq2p2LJ` (attempt 1, 2026-09-21): APPROVE
    — no blocker/major; standards and spec axes pass. Six minor/backlog notes:
    stale rename JSDoc, unpinned menu scrim/back tests, dead `editRoom` key,
    blank-name save no-op, generic/undersized action a11y label/target, and a
    local fallback string. Reviewer recommends optional cheap doc/test fix;
    no request-changes cycle was required.

## Durable handoff ledger

- Orchestrator: plan created; no production files edited by orchestrator.
- GitNexus preflight: MCP available; context reports index 4 commits behind
  HEAD. Earlier provisional impacts: DeviceManagementScreen LOW;
  RoomsView/RoomDetailView HIGH; AddDeviceDialog LOW. Refresh required before
  coder relies on those labels.
- Existing worktree: `.ai/state/current-task.md` plus the settings QR files
  listed by `git status` are pre-existing task changes and must be preserved.
- Coder changed only the approved devices UI/tests plus four device strings;
  GitNexus generated stats refreshes in `AGENTS.md`/`CLAUDE.md` are tooling
  side effects. No commit/push occurred.
- Refreshed GitNexus impact: `DeviceManagementScreen` LOW,
  `AddDeviceDialog` LOW, `RoomsView`/`RoomDetailView` HIGH heuristic labels;
  public props remain unchanged and the latter are module-private. Coder
  reported the HIGH labels and compatibility rationale; reviewer must confirm.
- Review checkpoint: approved. The current remaining gate is independent
  tester verification; tester dispatch is intentionally not automatic because
  the available tester role is user-triggered in this environment. Do not
  promote memory or declare DONE until verification and user acceptance.

## Previous task record

The prior `settings-secrets-qr` task remains documented in the historical
section below; it is not reopened by this task.

## Active task: `settings-secrets-qr` (2026-09-19)

- Plan (source of truth + secrets QR contract + stepper design):
  `.ai/plans/current-plan.md`
- Stepper 3 chấm data-derived (D3 colors); khối active theo bước
  amber; tap chấm ✓ reopen; thu gọn "✓ Đã cấu hình" sau save; form tay
  vĩnh viễn.
- QR contract: kind:credentials — mqttUsername/mqttPassword/influxToken
  optional keep-current; kind lạ honest error; server in bằng
  qrencode -t ANSIUTF8; README cảnh báo chìa khóa/log.
- Scope: NEW core/ui/QrScannerModal + secretsQrContract + tests; EDIT
  AdvancedSettingsScreen + test, strings, settings README. JS-only.
- Baseline: 88 suites / 1464 pass / 0 fail; tree phải SẠCH sau commit
  mDNS (đang chạy mechanical).
- Subagent sessions:
  - coder `ses_f45457750ffeAgCh6bFaqqbGDQ` (attempt 1, 2026-09-19): **DONE**
    — 8 file (4 NEW: core/ui/QrScannerModal.tsx +256 test, settings
    domain/secretsQrContract.ts +171 test; 4 EDIT:
    AdvancedSettingsScreen +543/−80, screen test +503/−7, strings +21
    additions, settings README +61); gates: typecheck clean, lint 0/4
    (1 react-hooks warning mới xuất hiện lúc implement đã tự fix —
    render-derived diagnostic), Jest **90 suites/1496 pass/0 fail**
    (+2 suites/+32 tests; không transient), per-file Prettier 8/8;
    impact AdvancedSettingsScreen + SettingsNavigator LOW (props
    interface không đổi); detect_changes MEDIUM 5 file/15 symbols đúng
    scope settings+core/ui; AC1–AC8; 6 deviations (lỗi version/
    malformed tách string riêng; stepFindServerWebHint cho web; raw-
    diagnostic thuộc modal generic; testID host/token input; locked
    dimmed preview bước 2; reopen bound data-signature — chặt hơn
    AD-1); index không cần refresh
  - tester `ses_f451fb8caffeOKpOlZ9XAKq2OQ` (attempt 1, 2026-09-19):
    **PASS-with-notes** — gates ×3 identical (90/1496/0, không transient;
    lint 0/4 pre-existing untouched; Prettier 8/8; typecheck clean);
    scope 8 file + state đúng, numstat khớp; CONTRACT 10/10 PASS (zod
    literal pins, empty-strip keep-current + secrets không trim, fill
    qua props + saves()===0, README qrencode verbatim + cảnh báo, dot
    derivation đúng 3 rule + dirty props THẬT dùng (dòng 596-600),
    reopen = data-signature else firstIncomplete, step-2 gating +
    form không bao giờ khóa, step-3 cùng handler handleSave, collapse
    + expand, QrScannerModal generic không import @modules/*, web hint
    + scan); AC1–AC8 PASS; +32 tests khớp từng số; 6 mDNS tests =
    fixture-only (diff từng file); no-regression PASS (fingerprint/
    status-card/save-dirty byte-identical); GitNexus claims reproduce;
    4 notes non-blocking: comment-duplicate QrScannerModal:200-207;
    expand-stays-expanded edge qua edit→save chu kỳ (comment nói
    auto-collapse nhưng signature "111" match — untested edge);
    2 coverage nits (reopen-scan session, diagnostic reset on close);
    STRINGS.settings namespace trong core primitive (coupling danh
    nghĩa)
  - reviewer `ses_f45177b8bffegvQ4TyLjlMhaao` (attempt 1, 2026-09-19):
    **APPROVE** — 0 blocker/0 major; 4 minor + 1 nit (toàn comment/
    doc-level, 0 behavioral defect 2 trục); reopen signature-binding
    judged SOUND; react-hooks fix pattern = React idiom chuẩn (adjust
    state during own render, converging guard); impact LOW reproduce;
    6 deviations + 4 tester notes verdict đủ (ACCEPT×vài, FIX-comment×4);
    1 nit design-observation: raw diagnostic có thể hiện secret
    cleartext khi QR đúng-format-bị-reject (plan-mandated, ghi nhận
    future redaction)
  - fix cycle 1 (coder resumed `ses_f45457750ffeAgCh6bFaqqbGDQ`,
    2026-09-19): **DONE** — doc-only 2 file: xóa comment duplicate
    QrScannerModal (400→398 dòng), header label-ownership đúng sự
    thật (v1 pragmatism + future label-props), comment stay-expanded
    semantics + overclaim "ANY data change" thu hẹp; prettier + typecheck
    clean; insurance 2 suites/45 tests pass (không behavior change)

- Next action: USER ACCEPTANCE → nếu ok: memory promotion (PROJECT.md
  secrets-qr entry + QR contract fact, ISSUE-025: label-props
  hardening + 3 missing tests + raw-diagnostic redaction note) +
  commit (1 feat 8 file + 1 chore(ai)) + user notes: server-init.sh in
  QR secret bằng qrencode theo README, native rebuild cho mDNS/ble-plx
  (task này JS-only), git push

## Commits (ledger)

2026-09-19 mDNS: `9c367fe` (feat, 11 file) + `9d7e80b` (chore(ai), 2
file) via `ses_f45482f53ffegeyK6zP1xEsFAC`. BLE v2: `0b84d59` +
`6fa7821` via `ses_f45bab636ffepD0BXT6shYAXbd`. BLE v1: `9458e4a` +
`e55986f` via `ses_f47779a60ffeOIF8aCPBfU3Nqt`.

## Last task: `settings-mdns-discovery` (2026-09-19, accepted)

- Plan (source of truth + mDNS contract + avahi example):
  `.ai/plans/current-plan.md` — Bước 1 pitch M16
- Contract: `_smarthome._tcp`, port = MQTT WS 9001, TXT
  prefix/influx_port(8086)/influx_org/influx_bucket; fill KHÔNG
  auto-save, KHÔNG đụng 3 secrets; 10s timeout honest; web ẩn nút;
  README settings = tài liệu chuẩn server side.
- Scope: 6 nhóm (dep zeroconf research R1 + native rebuild note; NEW
  contract/service + tests; EDIT SettingsScreen + strings + settings
  README).
- 7 decisions AD-1..7 (xem plan). R1 HIGH: lib compat — STOP nếu mọi
  candidate conflict.
- Baseline: 86 suites / 1432 pass / 0 fail; tree phải SẠCH sau commit
  BLE v2 (đang chạy mechanical).
- Subagent sessions:
  - coder `ses_f45b81567ffePiVpznYN9lcY7g` (attempt 1, 2026-09-19): **DONE**
    — dep `react-native-zeroconf@0.14.0` + `@types/react-native-zeroconf@0.13.1`
    (2025-12-31 release, Android 15+/16KB alignment, NsdManager-based;
    loại @dawidzawada/bonjour-zeroconf vì cần nitro-modules; install sạch
    + typecheck sạch ngay; web-safe: lib chỉ đọc NativeModules.RNZeroconf
    → undefined trên web); 4 file NEW (contract+service ~1077 dòng) +
    7 EDIT (AdvancedSettingsScreen + test, strings +11, settings README
    contract + avahi XML verbatim, app.json iOS plist + 3 Android
    permissions, package/lock); gates: typecheck clean x2, lint 0/4,
    Jest **88 suites/1464 pass/0 fail** (+2 suites/+32 tests; 4 run
    liên tiếp xanh — run ĐẦU có 3 transient fail, flag tester), per-file
    Prettier 10/10; impact AdvancedSettingsScreen LOW (d1
    SettingsNavigator, d2 App); detect_changes 8 file/10 symbols MEDIUM
    scope settings/mDNS đúng; AC1–AC8 PASS; 3 deviations nhẹ
    (AdvancedSettingsScreen là form thật — đúng ý plan survey-first;
    applyDiscoveredService keep-current semantics; service không
    add/removeDeviceListeners pairing vì lib ném 'error' chưa handle
    khi add lại — constructor-owned subscription + per-scan handlers,
    cleanup vẫn verify mọi exit path); NATIVE REBUILD bắt buộc sau task
  - tester `ses_f459b8f1fffeQHtvmejTuCTvs3` (attempt 1, 2026-09-19):
    **PASS-with-notes** — gates: typecheck clean, lint 0/4 pre-existing,
    Jest 5 full run (run 1 có 1 fail HistoryScreen transient — 3 run
    liên tiếp sau đó 88/1464/0 sạch + 3 targeted 30/30; phân loại
    environmental flake pre-existing theo KNOWN_ISSUES dòng 101),
    Prettier 11/11 (kể cả lock); scope 4 new + 7 modified đúng;
    CONTRACT PASS (service-type exact, TXT tolerant + zod single
    authority cho prefix, structural secret-unreachability qua output
    type không có key, cleanup 4 exit path + listenerCount 1→0 + late
    event inert, store actions + no-auto-save pin, web lazy guard +
    lib source check NativeModules.RNZeroconf, avahi XML VERBATIM
    identical programmatic diff, app.json đủ); AC1–AC8 PASS; +32 tests
    khớp claim; 3 deviations verified CORRECT (AdvancedSettingsScreen là
    form thật; keep-current semantics; constructor-owned listeners là
    design AN TOÀN HƠN — lib tự ném 'error' khi re-add, lib README liệt
    kê chính issue này); 2 coverage notes: không có UI test 2 result
    rows (structural-only), hostname .local fallback documented ở JSDoc
    + tests chứ không README; native rebuild MANDATORY confirmed
  - reviewer `ses_f45925b01ffelvv5X75YObEP7H` (attempt 1, 2026-09-19):
    **APPROVE** — 0 blocker/0 major; 5 minor + 2 nit; spot-check 3 claim
    tester confirm (avahi XML verbatim, structural secret
    unreachability 3 tầng, constructor-owned listeners SAFER từ lib
    source); 5 known items: ACCEPT×3, BACKLOG×1, NOTE user native
    rebuild; impact reproduce LOW/MEDIUM đúng coder; không fix-cycle
    cần thiết — 5 minor đều backlog (error-path gộp messaging + không
    log error Result; 2-row UI pin; .local README note; web-bundle lib
    cùng class ISSUE-022#3; ACCESS_NETWORK_STATE thừa so lib cần)
- COMMITTED 2026-09-19 via mechanical session
  `ses_f45482f53ffegeyK6zP1xEsFAC` (detect_changes pre-commit: medium
  risk, 10 symbols/9 files — settings scope đúng): commit 1 `9c367fe`
  (full `9c367feb41d91537f416a0114118b7c2a0ece761`) feat — 11 file,
  +1721/−4; commit 2 `9d7e80b` (full `9d7e80bec489e2f422787ccbee195
  531c351d7c9`) chore(ai) — 2 file. Tree clean; KHÔNG push (user
  manual).

## Last task: `ble-provisioning-v2-broker-push` (2026-09-19, accepted)

- Plan (source of truth + GATT contract v2): `.ai/plans/current-plan.md`
- Contract v2: 3 char MỚI `…3a07` broker (plain WRITE, `host[:port]`
  mặc định 1883 TCP) / `…3a08` MQTT user / `…3a09` MQTT pass (encrypted);
  sequence 6 ghi; status thêm `FAILED:BAD_BROKER`; CONNECTED = WiFi IP +
  broker MQTT; README mirror — firmware implement theo README.
- 7 quyết định AD-v2-1..7 (3 cái đầu user-delegated orchestrator-lock:
  3-char-riêng, host:port/1883, plain-vs-encrypted) — xem plan.
- Scope: 6 nhóm file (contract, service, modal, BoardsScreen + 3 test
  file, strings, README) — tất cả EDIT, không file mới, không dep mới.
- Baseline: 86 suites / 1402 pass / 0 fail; tree chỉ
  `.ai/state/current-task.md` modified (local pattern).
- GitNexus: index STALE (BLE symbols sau 9458e4a chưa index) — coder
  chạy `node .gitnexus/run.cjs analyze` trước edit.
- JS-only: KHÔNG native rebuild sau task (Metro reload đủ).
- Subagent sessions:
  - coder `ses_f465ca7ccffe8SJ29NCe9K1R1t` (attempt 1, 2026-09-19): **DONE**
    — 12 file EDIT +1420/−168 (0 file mới, 0 dep mới); gates: typecheck
    clean, lint 0 err/4 pre-existing, Jest **86 suites/1432 pass/0 fail**
    (+30: contract +14, service +4/~9 mod, modal +5/3 mod, BoardsScreen
    +7); impact pre-edit: modal dàn LOW nhưng label HIGH-heuristic
    (fan-out SettingsNavigator 8 sub-processes cùng screen — biện luận
    additive signatures, sole consumer BoardsScreen); detect_changes 14
    file/60 symbols đúng scope BLE; 6 deviations: (1) AGENTS/CLAUDE.md
    1-dòng tool-generated stats refresh từ preflight analyze (2589→3060)
    — keep, block tự-maintain; (2) `ble.success` VALUE đổi (v1 text sai
    dưới semantics v2 — strict-additions exception có lý do); (3) thêm
    app-side VALIDATION reason + `validationFailed` string +
    `BLE_BROKER_DEFAULT_PORT` (bắt buộc theo plan behavior); (4)
    format:check repo-wide fail 185 file — ENVIRONMENTAL: `android/`
    build output (native rebuild user) bị prettier quét + 2 README
    non-compliant pre-existing trên HEAD — 10 file changed verify clean
    riêng lẻ; (5) MQTT pass field chưa có show/hide toggle — để reviewer;
    (6) broker validator từ chối IPv6 literals (documented); firmware
    R4: chưa implement
  - tester `ses_f46399131ffeJ7ynkyOHqQkmQa` (attempt 1, 2026-09-19): **PASS**
    — gates 2 run identical (86/1432/0; lint 0/4 pre-existing ở file
    untouched; typecheck clean; 10/12 app file Prettier-clean, 2
    README/AGENTS pre-existing ngoài scope format:check); scope 14 file
    = 12 coder + 2 orchestrator-owned, numstat +1420/−168 khớp;
    CONTRACT CONFORMANCE PASS (9 UUID char-by-char, sequence 6 ghi +
    base64 payload pins, encrypted là firmware-side perm — app pins
    char-targeting + README note, byte-limits + boundary, BAD_BROKER
    distinct, README mirror đầy đủ behavior 4' + BOOT-5s); AC1–AC8 PASS;
    security PASS (AsyncStorage chỉ LAST_SSID_KEY; secureTextEntry pin);
    accounting PASS (+30 = 1432−1402, mọi modified là sanctioned/
    strengthening, v1 pins giữ đủ); 6 deviations benign (ble.success là
    duy nhất value-change, có lý do); web-safe PASS; 2 discrepancies
    immaterial (~10 vs ~9 modified; 180 vs 185 file format-check);
    1 reviewer-note: README list item 4' thụt lề cosmetic
  - reviewer `ses_f46300cc1ffe8JTUj3V4VWFx3D` (attempt 1, 2026-09-19):
    **APPROVE** — 0 blocker/0 major; 2 minor + 6 nits; 6 known items
    verdict ACCEPT×5 + FIX-cheap×1 (README 4' nesting); spot-check tester
    claims độc lập (no-persist, WS-port, 6-write payload, HIGH-heuristic
    biện luận xác nhận); impact real LOW (1 consumer BoardsScreen,
    prefill optional → backward-compatible); missing tests: none
    material (encrypted-flag là firmware-side — thỏa substance qua
    UUID-target + README); recommend README 1-line fix + NVS note TRƯỚC
    khi user viết firmware
  - fix cycle 1 (coder resumed `ses_f465ca7ccffe8SJ29NCe9K1R1t`,
    2026-09-19): **DONE** — doc-only 1 file devices README: 4' re-nest
    thành top-level step (CommonMark: `4'.` không phải list marker hợp lệ
    nên phải ngắt list + blank lines, start=4 giữ nguyên; content
    byte-identical, whitespace-only) + NVS plain-text note vào khu hạn
    chế; prettier file PASS; git status 14 file không đổi; orchestrator
    eyeball diff trực tiếp — contract v2 đầy đủ (9 UUID, formats,
    sequence, statuses, behavior 4', BOOT-5s, NVS note)

- COMMITTED 2026-09-19 via mechanical session
  `ses_f45bab636ffepD0BXT6shYAXbd` (detect_changes pre-commit: 14 file/60
  symbols/6 processes — BLE-v2 scope đúng; risk HIGH = cumulative label
  đã được reviewer biện luận + user accept): commit 1 `0b84d59` (full
  `0b84d59fabbdcbd47dc7f441d543f8ffaf09533e`) feat — 10 file +1423/−166;
  commit 2 `6fa7821` (full `6fa782108fce7f8d43c4fa1d4f46fd349432baeb`)
  chore(ai) — 4 file +329/−49 (kèm AGENTS/CLAUDE stats line). Tree clean.

## Last task: `boards-ble-wifi-provisioning` (2026-09-18, accepted 2026-09-19)

- Plan (source of truth + GATT contract firmware): `.ai/plans/current-plan.md`
- GATT contract base UUID `e5f4a3b2-…3a01..06`; firmware side = user
  (advertise service + `IoTBoard-{boardId}` local name; device-info JSON =
  QR format; SSID/pass write-encrypted (Just Works bond); PROVISION
  command; status notify IDLE/CONNECTING/CONNECTED/FAILED:*; giữ BLE 30s)
- Scope: 9 nhóm file — ble-plx dep + app.json permissions (Android BLE +
  iOS plist), NEW contract/service/modal + tests, EDIT BoardsScreen (sheet
  not-found + nút BLE gating web), strings, devices README (contract doc)
- AC7 quan trọng: ble-plx import phải an toàn trên web (guard/lazy)
- Baseline: 83 suites / 1342 pass / 0 fail; tree CLEAN sau `d8c6244`
- Firmware note (user việc): chưa có BLE service — flash theo contract
  trong plan; R4 sheet hint "board chưa ở chế độ cấu hình"
- Subagent sessions:
  - coder `ses_f4848d9e6ffe3bA2Yl0YI7e8vt` (attempt 1, 2026-09-18): **DONE**
    — react-native-ble-plx@3.5.1 (không peer-conflict; web-safe qua lazy
    bleManager() getter + TRANSPORT error; modal chỉ import types từ
    service; BoardsScreen inject service qua prop theo DI pattern sẵn);
    6 file mới (contract+service+modal + 3 test) + 7 modified; 60 test mới;
    gates: typecheck clean, lint 0 err/4 pre-existing, Jest **86 suites/
    1402 pass/0 fail**, Prettier clean (11 file); impact LOW;
    detect_changes đúng scope. 4 deviations ghi nhận (neverForLocation
    flag cần config plugin — backlog; zod duplicate domain; test files tách
    riêng; scan-list dùng localName — DeviceInfo không đọc mỗi quảng bá)
  - tester `ses_f481705f4ffeuo3RSR2FnpxqCL` (attempt 1, 2026-09-18): **PASS**
    — gates tái tạo (86 suites/1402 pass/0 fail; lint đúng 4
    pre-existing; Prettier clean); scope đúng 13 file; CONTRACT
    CONFORMANCE PASS (UUID/statuses/byte-limits/README verbatim; sequence
    instrumented order test); AC1–AC7 PASS; security PASS (không có API
    nào lưu password; secureTextEntry default); 4 deviations acceptable;
    1 phát hiện: coder claim "README notes neverForLocation" là SAI (grep
    0 matches — residual chỉ nằm trong harness state) → A1 reviewer
  - reviewer `ses_f48110107ffehDEs9hxP89eYBD` (attempt 1, 2026-09-18):
    **APPROVE** — 0 blocker/0 major; UUID đối chiếu character-by-character
    với plan; ble-plx claims verify độc lập với node_modules source;
    Base64/UTF-8 codec hand-traced (surrogate-pair đúng); cleanup mọi exit
    path; zod duplication đúng layering nhưng header comment overstate
    (cross-pin là backlog); impact LOW; 5 minor → ISSUE-022
    (neverForLocation README line + KNOWN_ISSUES; zod cross-pin; web
    lazy-import ble-plx; runtime permission request flow Android 12+;
    modal polish — disable Send sau success, scrim pin, progressText
    transient, cancel-on-close)

- COMMITTED 2026-09-19 via mechanical session
  `ses_f47779a60ffeOIF8aCPBfU3Nqt` (detect_changes pre-commit: 15 files /
  9 changed-files / risk MEDIUM, scope thuần BLE-boards — không symbol
  ngoài dự kiến): commit 1 `9458e4a` (full `9458e4a7f7431d97352e46ef21dbc
  8e0e1354da5`) feat — 13 files +3317/−3; commit 2 `e55986f` (full
  `e55986fb76e779ca774edd6a34806983b59ad363`) chore(ai) — 2 files
  +162/−98.   Tree clean sau commit; KHÔNG push (user manual). State này được
  update local sau commit (sẽ theo chore(ai) commit của task kế tiếp,
  theo pattern sẵn có).

## Commits (user-authorized, via coder mechanical sessions)

2026-09-18 boards cluster (4 layers + diagnostic + web fix):
1. `9dccf7d` (full `9dccf7d3b2de20de5a2023229d456441bf1f62e1`) —
   `feat(app): boards screen rework — search, QR scanner, display-by-type` —
   11 files, 2870+/218−.
2. `d8c6244` (full `d8c6244141d7e0c3f91ad10b7578246a23d04f75`) —
   `chore(ai): accept boards cluster, update harness state` — 2 files,
   123+/64−.

Earlier 2026-09-17 history-chart commits: `9bdf6ab` + `95ea626` (y-axis +
reveal) and `eb98cc5` + `7252892` (clip-path fix) via sessions
`ses_f51df3d19ffe1NWMXcUO2HBe3B` / `ses_f4fb9ffc8ffeo401EssSJ4q1yk`.

Tree CLEAN after all. detect_changes pre-commit: boards-surface symbols
only, medium cumulative (expected).

## Accepted 2026-09-18 — the boards cluster (committed)

1. `boards-card-layout-search` — ISSUE-018; archive
   `.ai/plans/archive/2026-09-18-boards-card-layout-search.md`.
2. `boards-qr-scan` — ISSUE-019; archive
   `.ai/plans/archive/2026-09-18-boards-qr-scan.md` (1 fix cycle).
3. `boards-image-by-name-layout` (superseded-in-part) — ISSUE-020; archive
   `.ai/plans/archive/2026-09-18-boards-image-by-name-layout.md`.
4. `boards-display-by-type` + 2 live-debugging additions (diagnostic
   raw-line; web `flex: 1` title-column fix) — ISSUE-021; archive
   `.ai/plans/archive/2026-09-18-boards-display-by-type.md`.

DURABLE board display convention (see PROJECT.md): title = boardType
(`IoT_ESP32-S2R3`), labeled `Id: {code}` line, one image per type slug,
displayName display-deprecated, discovery-only cards. Board-identity QR
label: JSON `{schemaVersion:1, boardId, boardType}` (from descriptor).

## Accepted 2026-09-19 — `boards-ble-wifi-provisioning` (committed)

5. `boards-ble-wifi-provisioning` — ISSUE-022; archive
   `.ai/plans/archive/2026-09-18-boards-ble-wifi-provisioning.md`;
   react-native-ble-plx@3.5.1 NEW DEP (native rebuild). 13 files (6 new +
   7 modified), 60 test mới. Commits: `9458e4a` (feat) + `e55986f`
   (chore(ai)).

2026-09-19 BLE provisioning commits:
3. `9458e4a` — `feat(app): BLE WiFi provisioning for boards` — 13 files,
   +3317/−3 (6 create mode).
4. `e55986f` — `chore(ai): accept boards-ble-wifi-provisioning` — 2
   files, +162/−98.

## Roadmap note (2026-09-19)

`boards-qr-onboarding` watch-list DROPPED (user decision 2026-09-18) —
BLE provisioning giải quyết triệt để đường board mới; QR not-found sheet
CHÍNH LÀ cửa vào onboarding. Vòng onboarding đã đóng trọn: QR → found =
card / not-found = BLE provisioning → board lên broker → card tự xuất
hiện. Không có NEXT candidate được duyệt; ý tưởng mở:
`settings-qr-share`, runtime BLE permission request (ISSUE-022 item 4),
web lazy-import ble-plx (ISSUE-022 item 3).

## Standing notes

- REMAINING MANUAL STEPS (user): `git push` (local main **11 commits
  ahead** của origin/main + 2 commit BLE sắp tạo); `npm run android`
  NATIVE REBUILD (expo-camera + ble-plx — mandatory, Metro reload không
  đủ; udev/adb đã debug 2026-09-19 — máy OPPO enumerate vendor 18d1 chế
  độ MIDI, cần USB mode MTP/Charging + rule 18d1 nếu còn lỗi permission);
  **FIRMWARE implement BLE GATT contract** (devices README — bảng UUID +
  hành vi 1–6) trước khi luồng BLE chạy end-to-end; flash firmware
  `boardType: "IoT_ESP32-S2R3"` (no displayName, boardId 0-based); sinh
  nhãn QR Text thuần (qrencode — KHÔNG dùng me-qr vì bọc URL redirect);
  ảnh board → `assets/boards/iot-esp32-s2r3.png` + 1 dòng map; seed 3
  phòng trên OPPO cần `adb shell pm clear com.example.iot` (AsyncStorage
  còn dữ liệu cũ từ bản trước → seed first-run không chạy).
- `.ai/memory/*`, `.ai/roadmap/*`, `.ai/plans/archive/*` intentionally NOT
  committed (gitignored, local-only durable state).
- Full-suite baseline: **86 suites / 1402 pass / 0 fail**; lint 0 errors (4
  pre-existing warnings); typecheck clean.
- Known-issue backlogs open: ISSUE-022 (5 minor BLE — neverForLocation/
  zod cross-pin/web lazy-import/runtime permission/modal polish),
  ISSUE-021 (5 minor + diagnostic test hardening), ISSUE-020 (3),
  ISSUE-019 (5), ISSUE-018 (4), ISSUE-017, ISSUE-015 (item 2 eyeball
  sweep-clip CHƯA CHẠY), ISSUE-016, ISSUE-013, ISSUE-014,
  ISSUE-007/008/009/010/012.
- Board→broker debug (2026-09-14 note still current): transport-connect
  timeout — firmware broker URI `mqtt://<IP-LAN>:1883` + auth .env +
  DEVICE_ID ≡ board id. "Malformed sensor topic" là noise. App ↔ broker OK
  (card board "0" hiển thị — descriptor retained đã về).

## Session continuity (recovery if needed)

- Mechanical commit BLE (2026-09-19): `ses_f47779a60ffeOIF8aCPBfU3Nqt`
  (9458e4a + e55986f; detect_changes MEDIUM scope-verified; tree clean).
- boards-ble-wifi-provisioning (2026-09-18): coder
  `ses_f4848d9e6ffe3bA2Yl0YI7e8vt`, tester
  `ses_f481705f4ffeuo3RSR2FnpxqCL`, reviewer
  `ses_f48110107ffehDEs9hxP89eYBD`.
- Mechanical commit boards cluster (2026-09-18): `ses_f4872d732ffei77KLDirwfinEK`.
- boards-display-by-type (2026-09-18): coder `ses_f4ae2b0d2ffe561v1aTAka9mU0`,
  tester `ses_f4ac984e6ffeMf3uwvsS5RyS1W`, reviewer
  `ses_f4ac4a655ffeihE8laZJ1ojWry`.
- Diagnostic raw-line (2026-09-18): coder `ses_f4c192baeffe0MhVG6J3rKYvys`
  (resumed), tester `ses_f4a933e2dffeIqsbjq3cJIaVFp`, reviewer
  `ses_f4a8fd88bffe7moaTX96gi08MM`.
- Web header fix (2026-09-18): coder `ses_f4c192baeffe0MhVG6J3rKYvys`
  (resumed), tester `ses_f4a5e958affeMTHKVnSY2zbEbk`.
- boards-image-by-name-layout (2026-09-18): coder
  `ses_f4bbe8dbeffevaSwjVSc0Yscdy`, tester `ses_f4badf70bffeihPULBjnTDtiYh`,
  reviewer `ses_f4ba4e69affex2sy2D7DPbIwtP`.
- boards-qr-scan (2026-09-18): coder `ses_f4c192baeffe0MhVG6J3rKYvys`
  (attempt 1 + fix cycle 1), testers `ses_f4bf88323ffefXmWrpKWNSZvJ6` (pass
  1) + `ses_f4be895eaffeA6xC95GahNhN9B` (pass 2), reviewer
  `ses_f4be45d82ffenErwuj31kDonKR`.
- boards-card-layout-search (2026-09-18): coder `ses_f4c558c3affeilQ5wk8hkaI4ER`
  (attempt 1 + D1 amendment), tester `ses_f4c346992ffew9dJHu8ktEXYeG`,
  reviewer `ses_f4c2ee848ffepEKRErJUwTZDLA`.
- history tasks (2026-09-17): y-axis `ses_f529abb6cffelbiw1qgdhjCN0I` /
  `ses_f5293792effeE7uurfDDNp0KYY` / `ses_f528ea626ffeVGm7MM98ATz4Sq`; reveal
  `ses_f5220d267ffedZmImM0SR1A1R3` / `ses_f51f5e593ffeJt16E6yTBmrn16` /
  `ses_f51ee49f5ffeZthp0SUis1XrJS`; clip-path `ses_f50047aa8ffeID1VPRujzO5ZlU`
  / `ses_f4ff089f8ffeXKTWxpoOK3q1SX` / `ses_f4fea90edffeIXz0tNsX4TFBUd`;
  commit sessions `ses_f51df3d19ffe1NWMXcUO2HBe3B` +
  `ses_f4fb9ffc8ffeo401EssSJ4q1yk`.
- Older (2026-09-16): demo-seed `ses_f56b57f57ffewwiQT7jrXRaX8i` /
  `ses_f56846981ffe4wvaDAZgSxq9f6` / `ses_f5677910effeSqNmY6kA3HiHfZ`;
  boards-v2 `ses_f5a07c737ffebtj9Sed6aMWL4f` /
  `ses_f59c3e401ffeUhUqdIuR6Rq1Vt` / `ses_f57fddbd0ffeS8uvnemyWVMu5j`;
  commit session `ses_f52fa8526fferz39UGLFu3jqgL`; historical
  `ses_f63d97b3effez4rk7bsqU8WrpA` (2026-09-14).
