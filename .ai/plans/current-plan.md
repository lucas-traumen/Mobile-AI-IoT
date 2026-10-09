# Current Task Plan — `project-guideline-and-docs`

Status: PROPOSED — chờ user duyệt (chưa implement).
Task ID: `project-guideline-and-docs`

## Parent milestone

M2 docs close-out + M3 hardening. Không thuộc milestone code nào; là task documentation thuần túy.

## Goal

Phân tích code hiện tại (HEAD `5d884dd`) và viết guideline + document tiếng Việt bằng cách MỞ RỘNG các README hiện có, bao phủ đúng 4 mảng user đã chọn:
1. Kiến trúc + quy ước module,
2. Quy trình dev + verify,
3. MQTT/Influx contract (boards protocol v2, discovery/QR/BLE),
4. Onboarding contributor mới.

## Why — current state (verified 2026-10-08)

- Code đã commit sạch tại `5d884dd` (worktree clean, ahead origin/main 1, chưa push). Task mDNS `mdns-link-local-address-filter` ở trạng thái IMPLEMENTED chờ smoke máy thật — ledger an toàn trong git history + `.ai/state/current-task.md` (1695 dòng), KHÔNG được coi là accepted khi làm task này.
- README gốc `app-mobile/README.md` (~484 dòng) đã có setup, architecture, data flow, dashboard engine, MQTT contract, InfluxDB, nhưng thiếu guideline contributor (boundary luật, DI, EventBus, thêm module/widget mới), thiếu quy trình verify chuẩn (test/lint/typecheck/format + smoke phân biệt JS-only vs native-rebuild), và các contract mới (mDNS DNSSD + `pickHost`, QR credentials 11-field, BLE v1/v2, cleartext plugin) nằm rải rác trong code + `.ai/memory` chưa dồn về README.
- Các module README (`settings/telemetry/relay/history/devices/widgets/dashboard`) tồn tại nhưng không đồng đều: thiếu purpose + public `api/` facade + contract + ví dụ mở rộng.
- GitNexus index `Mobile-AI-IoT` STALE sau commit `5d884dd` (index cũ hơn HEAD). Coder phải refresh trước khi implement (`node .gitnexus/run.cjs analyze` từ repo root).
- Quy ước durable: TS strict, no `any`, no `console.*` ngoài `core/logger`, Prettier `singleQuote/trailingComma all/arrowParens avoid`, boundary `core` + `api/`-only (eslint-plugin-boundaries), Zod mọi dữ liệu ngoài, wiring chỉ ở composition root, không commit/push tự động.

## Target state

- `app-mobile/README.md` mở rộng thành guideline tổng: kiến trúc Modular Monolith + Hexagonal, luật boundary + DI + EventBus, quy trình dev/verify/smoke, contract MQTT/Influx/mDNS/QR/BLE/cleartext, onboarding thêm widget/module mới — toàn tiếng Việt, không secret, link nội bộ sống.
- Mỗi module README có cấu trúc chung: Mục đích + Public API (`api/`) + Contract/Event + Cách mở rộng + Test seam. Không tạo thư mục `docs/` mới, không bản tiếng Anh.
- Diff CHỈ chạm `*.md` (+ `.ai/*` của harness). Không đổi production code.

## Scope

- `app-mobile/README.md` (mở rộng, giữ cấu trúc hiện có).
- `app-mobile/src/modules/{settings,telemetry,relay,history,devices,widgets,dashboard}/README.md` (chuẩn hóa theo khung chung).
- `app-mobile/src/core/README.md` MỚI ở mức tối thiểu (eventbus/di/errors/time/logger/topics/constants/theme/i18n) — vì core chưa có README mà guideline cần nơi neo quy ước dùng chung.
- `.ai/plans/current-plan.md` (file này) + `.ai/state/current-task.md` (checkpoint).

## Out of scope

- Mọi thay đổi production code (`src/**/*.ts(x)` ngoài README), schema, topic, Flux, native config, dependency mới.
- Thư mục `docs/` mới, bản tiếng Anh/song ngữ, video/hình minh họa mới.
- Memory promotion (`PROJECT/DECISIONS/CONVENTIONS/KNOWN_ISSUES`) — chỉ sau user accept task này.
- Commit/push bởi worker; accept task mDNS cũ; smoke thiết bị.
- Viết lại toàn bộ README từ scratch — phải giữ nội dung đúng hiện có, chỉ bổ sung + sắp xếp lại.

## Relevant files/modules/symbols

- `app-mobile/src/core/`: `eventbus/`, `di/` (Container/TOKENS), `errors/` (Result/AppError), `time/` (Clock), `logger/`, `topics.ts`, `constants.ts`, `theme/`, `i18n/strings.ts`, `net.ts` (`normalizeBrokerHost/formatHostForUrl/normalizeInfluxBaseUrl`).
- Modules `api/` facades + `internal/` + `ui/`; composition root `src/app/wiring/container.ts`, shell `RootTabs.tsx` + `TabFocusRefresh.tsx`, `App.tsx` bootstrap + AppState lifecycle.
- Contracts: boards protocol v2 (`{prefix}/boards/{boardId}/...`, descriptor/status/sensor/relay-state/set), Flux `aggregateWindow` + tag `boardId`, mDNS `_smarthome._tcp` + `pickHost`/`mapResolvedService` + DNSSD, QR `CredentialsQrSchema` 11-field, BLE GATT v1/v2 + `expo-network` provider, cleartext plugin `plugins/withAndroidCleartextTraffic.js`.
- Nguồn durable: `.ai/memory/{PROJECT,DECISIONS,CONVENTIONS,KNOWN_ISSUES}.md`, `.ai/roadmap/PROJECT_ROADMAP.md`.

## Architecture constraints

- Tài liệu phải khớp code HEAD `5d884dd`, không mô tả tính năng không tồn tại. Mọi topic/field/event ghi trong README phải có đối chứng file:dòng.
- Giữ luật boundary trong văn bản: module chỉ import `core` + `api/` module khác; wiring chỉ ở composition root; domain pure, side-effect ở adapter.
- Không ghi secret/token/host cá nhân vào README. Ví dụ dùng host placeholder (`192.168.x.x`, `http://<server>:8086`).
- Prettier từ `app-mobile/`; lệnh format repo-wide dính `android/` generated (ISSUE-007) nên plan yêu cầu coder chạy source-scoped trên file chạm.
- Phân biệt JS-only (Metro reload) vs native-rebuild (expo-camera/ble-plx/zeroconf/expo-network/splash) trong mục smoke.

## Capability contract

- Classification: documentation.
- GitNexus: coder chạy `query`/`context` để đối chứng kiến trúc + luồng (telemetry→devices sync, relay command/ack, history query, mDNS discovery) trước khi viết; `detect_changes(all)` sau viết để chứng minh diff chỉ chạm `*.md` (+ `.ai/*`). Index stale → refresh trước (`node .gitnexus/run.cjs analyze`).
- Orchestrator: `Create Plan` REQUIRED (file này); `Update Project Memory` REQUIRED sau accept; RECOMMENDED `codebase-design` (khung module), `domain-modeling` (thuật ngữ/CONTEXT); OPTIONAL `gitnexus-exploring`, `research`, `ask-matt`; DENY `implement`, `implement-spec`, Matt `code-review`, `setup-*`, `triage/wayfinder/to-tickets/loop-me`, `claude-handoff`.
- Coder REQUIRED: `Implement Plan`, `gitnexus-impact-analysis` (pre-edit, chứng minh README là LOW/no-blast-radius).
- Coder RECOMMENDED: `gitnexus-exploring`, `codebase-design`.
- Coder OPTIONAL: `gitnexus-cli` (refresh index), `gitnexus-guide`.
- Tester REQUIRED: `Verify Changes` (read-only; xác nhận AC + không đổi code).
- Reviewer REQUIRED: `Code Review` (project skill Title Case, hai trục Standards + Spec).
- DENY toàn worker: auto-commit/push, delegate subagent khác, sửa production code, đụng `.ai/memory`, workflow-owner skills, push.

## Implementation steps

1. Coder đọc plan + state + git (`status`, `log --oneline -5`, `diff --stat` phải rỗng ngoài `.ai/*` khi bắt đầu); refresh GitNexus index; invoke REQUIRED skills; ghi pre-edit impact (dự kiến LOW/none cho `*.md`).
2. Phân tích code qua GitNexus (`query` các luồng chính + `context` các symbol neo) và đọc filesystem đối chứng: container, EventMap, topics, settings/telemetry/relay/history/devices/widgets/dashboard facades, mDNS/QR/BLE/cleartext seams.
3. Viết theo thứ tự: `core/README.md` mới → `app-mobile/README.md` (4 mảng) → 7 module README theo khung chung. Giữ văn phong tiếng Việt, code block có language identifier, `inline code` cho định danh.
4. Tự rà: mọi khẳng định contract có file:dòng đối chứng; không secret; link tương đối sống; thuật ngữ nhất quán với `STRINGS`/memory.
5. Verify từ `app-mobile/`: Prettier check trên đúng file chạm; `git diff --check`; `git diff --name-only` chỉ `*.md`; đọc lại render thô. Không commit/push.

## Acceptance criteria

1. `app-mobile/README.md` có đủ 4 mảng: kiến trúc + quy ước module (boundary/DI/EventBus/Zod), quy trình dev + verify (lệnh `npm start/test/lint/typecheck/format:check`, phân biệt JS-only vs native-rebuild, `git diff --check`), contract MQTT/Influx/mDNS/QR/BLE/cleartext khớp code HEAD, onboarding thêm widget/module mới từng bước.
2. Đủ 7 module README + 1 `core/README.md` mới theo khung chung (Mục đích + Public API + Contract/Event + Mở rộng + Test seam).
3. Toàn bộ tiếng Việt; không secret/token/host thật; không thư mục `docs/` mới; không file production code nào đổi (`git diff --name-only` chứng minh).
4. Prettier trên file chạm PASS; `git diff --check` sạch.
5. Tester `Verify Changes` PASS + reviewer `Code Review` APPROVE (0 blocker/major) trước khi trình user accept.

## Required tests / verification

- Không thêm test Jest mới (task docs). Tester chạy `Verify Changes` + kiểm tra AC1–AC4 từ diff (không tin summary coder).
- Coder chạy từ `app-mobile/`: `npx prettier --check` đúng file `*.md` đã chạm; `git diff --check`; `git diff --name-only` (chỉ `*.md` + `.ai/*`).
- Typecheck/lint/full Jest KHÔNG bắt buộc (không đổi code); nếu chạy thì ghi rõ kết quả baseline, không được rào accept bằng lỗi ngoài scope.
- Device smoke KHÔNG áp dụng cho task này.

## Risks / open questions

- Scope rộng (8+ README) dễ phình diff → coder giữ mỗi module README gọn, chi tiết sâu để ở README tổng + link.
- README drift sau này (code đổi, doc cũ) → ghi rõ HEAD đối chứng `5d884dd` trong plan/commit để lần sau diff.
- Ghi đè checkpoint mDNS: ledger mDNS an toàn trong git (`5d884dd`) + state file giữ nguyên phần ledger cũ, chỉ đổi dòng Status; smoke mDNS vẫn nợ, không được accept gộp.
- GitNexus stale → coder refresh trước khi phân tích; nếu refresh thất bại thì dùng filesystem evidence và ghi rõ.
- Prettier repo-wide đỏ do `android/` generated (ISSUE-007) → chỉ chạy source-scoped, không sửa script ngoài scope.

## User approval

- Status: PROPOSED — chờ user duyệt scope (4 mảng, mở rộng README, tiếng Việt) rồi mới dispatch coder.
