# Current Task

Status: IDLE (commits authorized by the user 2026-09-16 — "ok tạm commit và
push"; push itself remains a USER manual step — env denies `git push` for
both orchestrator and coder)

Last completed task (2026-09-16): `demo-seed-three-rooms` — ACCEPTED +
memory promoted locally (no new ADR — 4 seed-content decisions in the
archived plan; ISSUE-014 opened; PROJECT.md seed descriptions + baseline
79 suites / 1270 pass / 0 fail). Plan archived at
`.ai/plans/archive/2026-09-16-demo-seed-three-rooms.md` with full session
record (0 fix cycles: coder attempt 1 DONE, tester pass 1 PASS, reviewer
attempt 1 APPROVE).

Previously accepted same day: `boards-topic-contract-v2` (ADR-023; ISSUE-013
opened; ISSUE-012 item 9 closed by `container.test.ts`; roadmap
backend-owns-Influx superseded by direct-Influx `boardId` contract) —
archive at `.ai/plans/archive/2026-09-16-boards-topic-contract-v2.md`.

## Commits (user-authorized, executed via coder mechanical session)

1. `feat(app): migrate to boards MQTT contract + three-room demo seed` —
   ALL app-mobile changes (63 files: 61 tracked modified + 2 new untracked
   test files `container.test.ts`, `seeds.test.ts`). Both accepted tasks
   committed together: their working-tree layers interleave in 5 shared
   test files, so per-task staging would break bisectability. Gates at this
   tree: typecheck clean; lint 0 errors (4 pre-existing warnings); Jest 79
   suites / 1270 pass / 0 fail; source-scoped Prettier clean.
2. `chore(ai): accept boards-contract-v2 + demo-seed tasks, update harness
   state` — `.ai/plans/current-plan.md`, `.ai/state/current-task.md`,
   `.opencode/agents/reviewer.md` (model fix `xkiro/z-ai/glm-5.3`).
   Repo convention (since `daf3b16` + `15c8210`): `.ai/` is gitignored
   EXCEPT these two tracked state files; memory/roadmap/archives stay
   LOCAL-ONLY by design.

Hashes recorded in the post-commit standing note below (kept uncommitted
until the next AI-state chore, per precedent).

## Standing notes

- REMAINING MANUAL STEP: `git push` — user runs it (upstream origin/main
  already set; before this chore local main was 3 commits ahead, after these
  2 commits it is 5 ahead).
- `.ai/memory/*`, `.ai/roadmap/*`, `.ai/plans/archive/*` are intentionally
  NOT committed (gitignored, local-only durable state — precedent `daf3b16`
  "Ignore .ai agent state" + `15c8210` chore).
- Full-suite baseline hiện tại: **79 suites / 1270 pass / 0 fail**.
- Known-issue backlogs open: ISSUE-013 (boards minors), ISSUE-014
  (demo-seed minors), plus older accepted items (ISSUE-007/008/009/010/012).
- Next candidate (user-approved direction, not yet planned):
  `settings-qr-share` — QR chia sẻ cấu hình (generate + scan + apply; MQTT +
  Influx settings có version; security: QR chứa credentials, chủ động bấm).
- Backend đệm (repo Mobile_Backend): M10 integration test chưa chạy; user
  việc: flash firmware DEVICE_ID = ROOM_ID từng board + nhập settings LAN vào
  app (web phải clear localStorage trước khi nhập để nhận seed mới + prefix
  `smarthome` mặc định).
- Debug note (2026-09-14): board→broker vẫn transport-connect timeout; bridge
  + app đã nối broker OK (app prefix `smarthome` đúng). Chưa có telemetry nào
  qua bridge (không có retained sensor topic). Cần: firmware broker URI =
  `mqtt://<IP-LAN>:1883` + auth theo .env + DEVICE_ID ≡ ROOM_ID ≡ mã board gán
  trong app. Cảnh báo "Malformed sensor topic" trong log app là noise (fan-out
  dispatch), không chặn dữ liệu.

## Session continuity (recovery if needed)

- demo-seed-three-rooms: coder `ses_f56b57f57ffewwiQT7jrXRaX8i` (attempt 1
  DONE), tester `ses_f56846981ffe4wvaDAZgSxq9f6` (pass 1 PASS), reviewer
  `ses_f5677910effeSqNmY6kA3HiHfZ` (attempt 1 APPROVE).
- boards-topic-contract-v2: coder `ses_f5a07c737ffebtj9Sed6aMWL4f` (initial +
  fix cycle 1), tester `ses_f59c3e401ffeUhUqdIuR6Rq1Vt` (2 passes), reviewer
  `ses_f57fddbd0ffeS8uvnemyWVMu5j` (attempt 5 post-restart APPROVE).
- Historical (2026-09-14 commit session): `ses_f63d97b3effez4rk7bsqU8WrpA`.
