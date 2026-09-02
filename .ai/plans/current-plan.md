# Current Task Plan

Status: IMPLEMENTED_AND_COMMITTED (project PAUSED for re-plan; commit `e146c71` pushed to `origin/main` on 2026-09-02)

## Task ID

dashboard-theme-layout-fixes

## Parent milestone

M2 — Room-based customizable dashboard + template UI

## Goal

Three small fixes, all confirmed from the user's device screenshots:

1. **Theme mode switcher does nothing** (Cài đặt → Giao diện): `updateUi` writes only the zustand `draft`, but `App.tsx` reads the theme from `current.ui.theme`, and the theme buttons never call `save()`. Fix: `updateUi` writes `current` + persists immediately (theme is an apply-immediately setting).
2. **Section labels detach from their card groups**: "Môi trường" and "Thiết bị" pills render as stacked plain elements ABOVE the whole grid, while cards are absolute-positioned — so both labels bunch at the top and the first card sticks right under them ("dính nhau"). Fix: split the dashboard into two sections, each = label pill directly above its OWN grid (sensors under "Môi trường", switches under "Thiết bị").
3. **Switch cards show generic "Công tắc"** instead of "Đèn"/"Quạt": seed widgets have no `title`, and `SwitchWidget` falls back to the capability label. Fix: fall back to the bound DEVICE name (relay-1 = Đèn, relay-2 = Quạt) before the capability label — works for existing persisted data without a reset.

## Why (root causes, verified from code)

- Theme: `settingsStore.updateUi` → `draft.ui` only; `App.tsx` subscribes `state.current.ui.theme`; `save()` (the only draft→current path) is never called by theme buttons. Button highlight reads draft (looks selected) but `ThemeProvider` never gets the new mode.
- Labels: `DashboardScreen` renders both `<Text>` labels as flow siblings before a single absolute-positioned `DashboardGrid` — labels cannot sit above their groups.
- Title: `SwitchWidget` title = `config.title ?? def?.label ?? STRINGS.widgets.switch`; seed sets no title → capability label "Công tắc".

## Target state

- Tapping Sáng/Tối/Hệ thống immediately re-themes the app AND persists (survives restart). MQTT/Influx keep draft + explicit save.
- Dashboard layout per section:
  ```
  [Môi trường]      ← pill
  [Nhiệt độ][Độ ẩm] ← sensor grid
  [Thiết bị]        ← pill
  [Đèn]             ← switch grid
  [Quạt]
  ```
- Grouping rule: `sensor-value` + `history-chart` → "Môi trường"; `switch` + all other types → "Thiết bị". A section (label + grid) renders only when its group is non-empty.
- Switch widget title: `config.title ?? deviceName ?? def?.label ?? STRINGS.widgets.switch` (deviceName resolved from the bound deviceId via widget services).

## Scope

1. `app-mobile/src/modules/settings/internal/ui/settingsStore.ts` — `updateUi` writes current + draft + persists (fire-and-forget `service.save`, error-tolerant). MQTT/Influx unchanged.
2. `app-mobile/src/modules/settings/internal/ui/settingsStore.test.ts` — updateUi updates `current.ui.theme` immediately + persists.
3. `app-mobile/src/modules/dashboard/ui/DashboardScreen.tsx` — group widgets into environment/devices; render per-section label pill + grid; remove the two stacked labels; measure canvas width on a shared wrapper so both grids share metrics.
4. `app-mobile/src/modules/dashboard/ui/DashboardGrid.tsx` — add optional `layoutYOffset` prop: render rects with `y - layoutYOffset`; call `onMoveWidget(id, x, y + layoutYOffset)` so persisted absolute coords stay correct. Default 0 → DashboardLayoutEditor unaffected.
5. `app-mobile/src/modules/widgets/internal/ui/widgets/SwitchWidget.tsx` — title fallback chain adds bound device name.
6. Tests: DashboardScreen section structure (label above its own grid; sections conditional); DashboardGrid yOffset render + move-callback math; SwitchWidget title fallback; settingsStore theme persistence.

## Out of scope

- MQTT/Influx settings flow; relay/MQTT contract; seed changes (no data reset needed); History/Settings visuals; `.opencode/`; commit/push.

## Architecture constraints

- DashboardGrid stays reusable; `layoutYOffset` optional (default 0) so the layout editor is untouched.
- Theme tokens only; Prettier style; TS strict; no `any`; no `console.*`.
- Grouping/rebasing logic pure where possible (groupWidgets helper + tests).

## Capability contract

### GitNexus
- REQUIRED (pre-edit impact on `settingsStore`, `DashboardScreen`, `DashboardGrid`, `SwitchWidget`; post-change `detect_changes`).

### Skills
- Required: `Implement Plan`, `gitnexus-impact-analysis`, `tdd`
- Recommended: `codebase-design`
- Deny: nested-subagent/workflow skills, auto-commit/push/governance skills

## Acceptance criteria

- [x] Theme switch (Sáng/Tối/Hệ thống) applies immediately AND persists across restart.
- [x] "Môi trường" pill sits directly above sensor cards; "Thiết bị" pill directly above switch cards; no stacked labels, no stuck cards.
- [x] Switch cards show "Đèn"/"Quạt" (bound device name) without a data reset.
- [x] DashboardLayoutEditor still works unchanged (layoutYOffset default 0).
- [x] `npm test`, `typecheck` pass; only in-scope files changed. (Lint not re-run at pause; 53/53 suites, 560/560 tests green.)

## Outcome at pause

- Commit `e146c71` "feat: dashboard section pills, gel glass theme, optimistic switch, instant theme apply" (15 files, +1351/−106) pushed to `origin/main`.
- Not yet done: reviewer review, user accept, Update Project Memory. Superseded by upcoming re-plan.

## User approval

- Status: approved
- Notes: User reported theme switch broken + labels/cards stuck + generic "Công tắc" titles from device screenshots; root causes verified in code before planning.
