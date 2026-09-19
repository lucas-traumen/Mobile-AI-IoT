# Current Task

Status: COMMITTING mDNS (mechanical) → DISPATCHING
`settings-secrets-qr` — user "vậy triển khai đi" + "ok" 2026-09-19:
accept mDNS + authorize commit dọn tree (không push), rồi làm task
mới (stepper 3 chấm + QR secret server — JS-only). Plan APPROVED tại
`.ai/plans/current-plan.md`.

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
  - coder: DISPATCHED sau khi commit mDNS xong (task_id pending)

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
- ACCEPTED 2026-09-19 (user "vậy triển khai đi" + "ok" sau summary
  gates/findings). Memory promoted: PROJECT.md mDNS entry (contract +
  fill security posture DURABLE), ISSUE-024 (5 minors). Archive →
  `.ai/plans/archive/2026-09-19-settings-mdns-discovery.md`. Commit
  (user-authorized): 1 feat (11 file app) + 1 chore(ai) (current-plan +
  current-task). NATIVE REBUILD user-side.

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
