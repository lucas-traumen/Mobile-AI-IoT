# Current Task

Status: COMMITTING (mechanical) — `boards-ble-wifi-provisioning` ACCEPTED
(user "ok" 2026-09-19); memory promoted (PROJECT.md + ISSUE-022); plan
archived; 2 commits user-authorized (feat app + chore ai). Push stays USER
manual. Sau commit xong → reset IDLE.

## Active task: `boards-ble-wifi-provisioning` (2026-09-18)

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

- ACCEPTED (user "ok" 2026-09-19). Memory promoted: PROJECT.md (BLE
  provisioning entry + onboarding loop closed; watch-list dropped),
  KNOWN_ISSUES ISSUE-022 (5 reviewer minors). Plan archived →
  `.ai/plans/archive/2026-09-18-boards-ble-wifi-provisioning.md`;
  current-plan reset NO_ACTIVE_PLAN. Next: coder mechanical commit
  (commit 1 feat — 13 file app; commit 2 chore(ai) — current-plan +
  current-task), sau đó reset IDLE.

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

## Accepted 2026-09-19 — `boards-ble-wifi-provisioning` (committing)

5. `boards-ble-wifi-provisioning` — ISSUE-022; archive
   `.ai/plans/archive/2026-09-18-boards-ble-wifi-provisioning.md`;
   react-native-ble-plx@3.5.1 NEW DEP (native rebuild). 13 files (6 new +
   7 modified), 60 test mới.

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
