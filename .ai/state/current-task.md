# Current Task

Status: COMMITTING (mechanical) — `history-clip-path-web-fix` ACCEPTED;
commits user-authorized "commit ddi" 2026-09-17. Push stays USER manual.

## Last accepted task: `history-clip-path-web-fix` (2026-09-17)

- Regression fix cho `9bdf6ab`: sweep reveal không thật sự clip (victory
  truyền `clipId`, react-native-svg `ClipPath` đọc `id` → url(#…) treo) +
  junk props victory tràn xuống web DOM (error spam mỗi frame). Fix:
  `SafeClipPath` in-app mirror VClipPath. Archive: `.ai/plans/archive/
  2026-09-17-history-clip-path-web-fix.md`. ISSUE-017 mở; ISSUE-015 item 2
  cập nhật lần 3 (eyeball pass phải XÁC NHẬN sweep clip thật post-fix).
- Baseline mới: **82 suites / 1293 pass / 0 fail**.
- Working tree CHƯA COMMIT: 2 file app (HistoryChartCard.tsx +53/−10,
  HistoryScreen.test.tsx +120/−1) + 2 file harness state (gitignored-but-
  tracked, theo convention sẽ vào chore(ai) commit).
- Sessions: coder `ses_f50047aa8ffeID1VPRujzO5ZlU` (DONE), tester
  `ses_f4ff089f8ffeXKTWxpoOK3q1SX` (PASS), reviewer
  `ses_f4fea90edffeIXz0tNsX4TFBUd` (APPROVE).
- Durable fact đã promote vào PROJECT.md: victory-native public `ClipPath`
  export là type/runtime-divergent (.d.ts re-export victory-core web
  primitive, runtime là VClipPath) — không "simplify" mirror in-app thành
  import đó.

## Accepted 2026-09-17 (committed trong `9bdf6ab` + `95ea626`)

1. `history-adaptive-y-axis` + `history-chart-reveal-downsample` — ISSUE-015/
   ISSUE-016; archives `.ai/plans/archive/2026-09-17-*.md`; mechanical
   session `ses_f51df3d19ffe1NWMXcUO2HBe3B`.

## Standing notes

- REMAINING MANUAL STEP: `git push` — user runs it (local main is **7 commits
  ahead** of origin/main; sẽ thành 9 sau khi commit fix này).
- `.ai/memory/*`, `.ai/roadmap/*`, `.ai/plans/archive/*` are intentionally
  NOT committed (gitignored, local-only durable state).
- Full-suite baseline hiện tại: **82 suites / 1293 pass / 0 fail**; lint 0
  errors (4 pre-existing warnings); typecheck clean.
- Known-issue backlogs open: ISSUE-017 (2 minor), ISSUE-015 (item 2 = eyeball
  pass — giờ phải xác nhận sweep THẬT SỰ clip sau fix), ISSUE-016 (4 minor),
  ISSUE-013, ISSUE-014, ISSUE-007/008/009/010/012.
- Next candidate (user-approved direction, chưa plan): `settings-qr-share`.
- Backend đệm (repo Mobile_Backend): M10 integration test chưa chạy; firmware
  DEVICE_ID = ROOM_ID từng board; settings LAN vào app.
- Debug note (2026-09-14): board→broker vẫn transport-connect timeout; bridge
  + app đã nối broker OK. "Malformed sensor topic" trong log app là noise.

## Session continuity (recovery if needed)

- history-clip-path-web-fix (2026-09-17): coder `ses_f50047aa8ffeID1VPRujzO5ZlU`,
  tester `ses_f4ff089f8ffeXKTWxpoOK3q1SX`, reviewer
  `ses_f4fea90edffeIXz0tNsX4TFBUd`.
- Mechanical commit session (2026-09-17): `ses_f51df3d19ffe1NWMXcUO2HBe3B`.
- history-chart-reveal-downsample (2026-09-17): coder
  `ses_f5220d267ffedZmImM0SR1A1R3`, tester `ses_f51f5e593ffeJt16E6yTBmrn16`,
  reviewer `ses_f51ee49f5ffeZthp0SUis1XrJS`.
- history-adaptive-y-axis (2026-09-17): coder `ses_f529abb6cffelbiw1qgdhjCN0I`,
  tester `ses_f5293792effeE7uurfDDNp0KYY`, reviewer
  `ses_f528ea626ffeVGm7MM98ATz4Sq`.
- demo-seed-three-rooms (2026-09-16): coder `ses_f56b57f57ffewwiQT7jrXRaX8i`,
  tester `ses_f56846981ffe4wvaDAZgSxq9f6`, reviewer
  `ses_f5677910effeSqNmY6kA3HiHfZ`.
- boards-topic-contract-v2 (2026-09-16): coder `ses_f5a07c737ffebtj9Sed6aMWL4f`,
  tester `ses_f59c3e401ffeUhUqdIuR6Rq1Vt`, reviewer
  `ses_f57fddbd0ffeS8uvnemyWVMu5j`.
- Historical: 2026-09-14 commit session `ses_f63d97b3effez4rk7bsqU8WrpA`;
  2026-09-16 commit session `ses_f52fa8526fferz39UGLFu3jqgL`.
