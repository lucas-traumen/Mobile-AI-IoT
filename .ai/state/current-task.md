# Current Task

Status: COMMITTING (mechanical) — boards cluster (4 layers + diagnostic +
web-layout fix) ACCEPTED; commits user-authorized 2026-09-18 (lộ trình
"user ok": commit cụm trước → QR onboarding v1 task kế tiếp → BLE sau).
Push stays USER manual.

## Active task: `boards-display-by-type` (Layer 4, 2026-09-18)

- Plan (source of truth): `.ai/plans/current-plan.md` — kèm bảng DURABLE
  board display convention
- Layer 3 `boards-image-by-name-layout` (ảnh theo tên) ĐÃ ARCHIVE kèm ghi
  chú supersede-in-part: `.ai/plans/archive/2026-09-18-boards-image-by-name-
  layout.md`; ISSUE-020 ghi (3 minors, items vẫn đúng phần code survive:
  slugify giờ chạy trên boardType)
- Scope Layer 4: 4 file — boardImages.ts (keying lại theo boardType, giữ
  slugify), BoardsScreen.tsx (title/Id line/gỡ badge/sheet ảnh),
  strings.ts (+idLabel), BoardsScreen.test.tsx (update + accounting)
- Sessions Layer 3: coder `ses_f4bbe8dbeffevaSwjVSc0Yscdy`, tester
  `ses_f4badf70bffeihPULBjnTDtiYh`, reviewer `ses_f4ba4e69affex2sy2D7DPbIwtP`
- Baseline trước Layer 4: 83 suites / 1336 pass / 0 fail
- Subagent sessions Layer 4:
  - coder `ses_f4ae2b0d2ffe561v1aTAka9mU0` (attempt 1, 2026-09-18): **DONE**
    — title=boardType (displayName ignore, pin), Id line gated
    descriptor, badge gỡ sạch (markup + styles), thumbnail + QR sheet
    keying theo boardType slug; 14 test updated (accounting) + 4 new; gates:
    typecheck clean, lint 0 err/4 pre-existing, Jest **83 suites/1340
    pass/0 fail** (xác nhận 3 run liên tiếp sau 1 run transient fail 4
    suites — flag cho tester), Prettier clean; impact LOW; 2 flags:
    AddDeviceDialog board-picker VẪN hiện displayName (ngoài scope —
    ứng viên follow-up); testID boards-type-{code} re-home lên title
  - tester `ses_f4ac984e6ffeMf3uwvsS5RyS1W` (attempt 1, 2026-09-18): **PASS**
    — 2 full-suite run sạch liên tiếp (83/1340/0; transient của coder không
    tái hiện — phân loại environmental); scope union 11 file không đổi,
    Layer 4 bounded bằng mtime (4 file 22:31–22:47, còn lại ≤17:32);
    AddDeviceDialog confirm untouched (displayName surface — candidate
    follow-up); AC1–AC6 PASS; accounting 14+4 coherent (49 it() grep-
    verified); note: sheet-header hint có mã 2 lần trên SHEET (card rule
    exactly-once giữ đúng trên card); hạn chế ghi nhận: byte-identical
    không verify được tuyệt đối vì 4 layer cộng dồn không có intermediate
    git state
  - reviewer `ses_f4ac4a655ffeihE8laZJ1ojWry` (attempt 1, 2026-09-18):
    **APPROVE** — 0 blocker/0 major; zod boardType min(1) đảm bảo title
    fallback không rỗng; 3 discriminator thật (displayName-ignore /
    legacy-slug / sheet-leak đều fail dưới logic cũ); non-null assertions
    prove pre-date HEAD; mtime bound 4 file; impact LOW; 4 minor →
    ISSUE-021 (AddDeviceDialog displayName surface — follow-up tự nhiên;
    sheet-hint code lặp cho descriptor-less; slugifyBoardName rename;
    exactly-once pin đếm tường minh)

- DIAGNOSTIC ADDITION (2026-09-18, live user debugging — QR đúng chuẩn nhưng
  bị reject trên WEB): raw-scanned line — `lastRawScanned` state mirror
  scanError + modal hiển thị payload thô (mono, 80 chars + `…`) dưới dòng
  lỗi, testID `boards-scanner-raw`. JS-only (không cần native rebuild — Metro
  reload đủ, web dùng được ngay). Sessions: coder `ses_f4c192baeffe0MhVG6J3rKYvys`
  (resume, DONE), tester `ses_f4a933e2dffeIqsbjq3cJIaVFp` (PASS — 83
  suites/1342 pass/0 fail), reviewer `ses_f4a8fd88bffe7moaTX96gi08MM`
  (APPROVE — 6 minor test-hardening/backlog items → ISSUE-021 append lúc
  promote memory: distinct-garbage pin, close-reopen clear pin, length-80
  boundary, mono 3rd-consumer trigger, UTF-16 surrogate split, gating
  symmetry).

- Next action: USER ACCEPTANCE → nếu ok: memory promotion (PROJECT.md —
  DURABLE convention cuối, ISSUE-021, archive Layer 4) + commit CỤM 4 LAYER
  boards (hỏi user; 11 file app) + user notes: `npm run android` rebuild +
  firmware flash `boardType: "IoT_ESP32-S2R3"` (không set displayName,
  boardId giữ 0-based) + eyeball + ảnh thật theo slug type

## Accepted 2026-09-18 (NOT committed — pending user commit decision)

1. `boards-card-layout-search` (Layer 1) — archive `.ai/plans/archive/
   2026-09-18-boards-card-layout-search.md`; ISSUE-018; D1 scope amendment
   (SettingsNavigator.test.tsx 5th file).
2. `boards-qr-scan` (Layer 2) — archive `.ai/plans/archive/2026-09-18-
   boards-qr-scan.md`; ISSUE-019; 1 fix cycle (D4+D5 — boolean-return re-arm
   seam + empty-state scan pill); expo-camera@~57.0.5 (NATIVE REBUILD
   required — `npm run android` sau commit).
- Working tree: 11 file app uncommitted (7 modified tracked + 4 untracked)
  + `.ai/*`.

## Standing notes

- REMAINING MANUAL STEP sau commit: `git push` (9 commits ahead + boards
  commits tới) + `npm run android` (native rebuild cho expo-camera) + in nhãn
  QR từ descriptor (tooling phía user).
- `.ai/memory/*`, `.ai/roadmap/*`, `.ai/plans/archive/*` intentionally NOT
  committed.
- Full-suite baseline: **83 suites / 1324 pass / 0 fail**; lint 0 errors (4
  pre-existing warnings); typecheck clean.
- Known-issue backlogs open: ISSUE-019 (5 minor), ISSUE-018 (4), ISSUE-017,
  ISSUE-015 (item 2 eyeball sweep-clip CHƯA CHẠY), ISSUE-016, ISSUE-013,
  ISSUE-014, ISSUE-007/008/009/010/012.
- Next candidates: nickname board in-app (nếu user muốn đặt tên không qua
  firmware); ảnh board thật (user drop theo slug quy 惯例); `settings-qr-share`.
- Backend đệm (repo Mobile_Backend): M10 integration test chưa chạy; firmware
  DEVICE_ID = ROOM_ID từng board; QR label sinh từ descriptor.
- Debug note (2026-09-14): board→broker vẫn transport-connect timeout; bridge
  + app đã nối broker OK. "Malformed sensor topic" là noise.

## Session continuity (recovery if needed)

- boards-image-by-name-layout (2026-09-18): coder DISPATCHED (task_id pending).
- boards-qr-scan (2026-09-18): coder `ses_f4c192baeffe0MhVG6J3rKYvys`
  (attempt 1 + fix cycle 1), tester `ses_f4bf88323ffefXmWrpKWNSZvJ6` (pass 1)
  + `ses_f4be895eaffeA6xC95GahNhN9B` (pass 2), reviewer
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
