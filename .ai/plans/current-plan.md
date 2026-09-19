# Current Task Plan — `settings-mdns-discovery`

Status: APPROVED (user "triển khai nốt cái tính năng kia đi chứ để đồng
bộ backend mDNS" 2026-09-19 — Bước 1 pitch M16: nút "Tìm máy chủ trong
mạng" trong Settings)

## Goal

Lần đầu cài app: vào Cài đặt → bấm **"Tìm máy chủ trong mạng"** → app
quét mDNS trong WiFi LAN → thấy Smart Home Server → tự điền MQTT
host/port/prefix + Influx url/org/bucket. User chỉ gõ tay 2 secret
(MQTT password + Influx token) rồi Lưu. Không ai phải biết IP là gì.

Server side (user, `server-init.sh`): avahi advertise service theo
contract dưới — contract là tài liệu chuẩn 2 phía (mirror vào settings
README kèm ví dụ avahi config hoàn chỉnh để copy).

## mDNS contract (app ↔ server — BINDING; mirror vào
`modules/settings/README.md`)

- **Service type:** `_smarthome._tcp` (domain `local`)
- **Instance name:** tùy ý (hiển thị) — VD `Smart Home Server`
- **Port** = **MQTT WebSocket port** (9001) — 1 advertisement chứa đủ
  mọi thứ, phần còn lại nằm trong TXT records
- **TXT records (tất cả OPTIONAL — app dùng default/keep-current khi
  thiếu):**
  - `prefix` → mqtt.prefix (thiếu → GIỮ NGUYÊN field hiện tại)
  - `influx_port` → port của influx.url (thiếu → default **8086**)
  - `influx_org` → influx.org (thiếu → giữ nguyên field)
  - `influx_bucket` → influx.bucket (thiếu → giữ nguyên field)
- **Fill rule:** CHỈ đè các field non-secret. `mqtt.username`,
  `mqtt.password`, `influx.token` KHÔNG BAO GIỜ bị đụng. KHÔNG
  auto-save — chỉ fill form; user soát lại + bấm Lưu như thường (mDNS
  là unauthenticated — trust-on-first-use trong LAN, user review là
  lớp bảo vệ cuối).

**Ví dụ avahi service file cho server (đưa vào README — server-init.sh
copy):**

```xml
<!-- /etc/avahi/services/smarthome.service -->
<service-group>
  <name replace-wildcards="yes">Smart Home Server</name>
  <service>
    <type>_smarthome._tcp</type>
    <port>9001</port>
    <txt-record>prefix=smarthome</txt-record>
    <txt-record>influx_port=8086</txt-record>
    <txt-record>influx_org=smarthome</txt-record>
    <txt-record>influx_bucket=smarthome</txt-record>
  </service>
</service-group>
```

## Luồng người dùng

```
Settings (native) → [Tìm máy chủ trong mạng]
  → scanning ~10s: "Đang quét mạng LAN…"
  → thấy service(s) → list (tên + host:port) → tap 1 dòng
      → mqtt.host/port(+prefix nếu có TXT) + influx.url/org/bucket filled
      → mqtt.username/password + influx.token GIỮ NGUYÊN (user gõ 2 secret)
      → user bấm Lưu → chip kết nối xanh
  → 10s không thấy → "Không thấy server trong mạng" + hint (cùng WiFi?
      server đang chạy? avahi đã advertise?)
```

## Scope (app side)

1. NEW dependency `react-native-zeroconf` HOẶC maintained fork — coder
   research bước 0 (R1): ưu tiên TS types + Android NsdManager-based +
   Expo 57 prebuild-compatible; cài xong typecheck verify; conflict →
   STOP báo. **Native rebuild bắt buộc sau task.** iOS declare-only:
   `NSLocalNetworkUsageDescription` + `NSBonjourServices`
   (`_smarthome._tcp`) trong app.json infoPlist. Android permission
   theo yêu cầu lib (nếu cần `CHANGE_WIFI_MULTICAST_STATE`).
2. NEW `internal/domain/mdnsDiscoveryContract.ts` + test (pure) —
   service-type constant; TXT parse (map chuỗi → typed fields, khoan
   dung giá trị rác — port không phải số → bỏ qua); mapping
   `applyDiscoveredService(draft, service)` → trả fields cần đè (host,
   port, prefix?, influx url/org/bucket) — KHÔNG đụng secrets; influx
   URL build `http://{host}:{port}`; default 8086.
3. NEW `internal/services/mdnsDiscoveryService.ts` + test (mock zeroconf
   lib qua jest.mock) — scan lifecycle (start → events → stop, cleanup
   MỌI exit path), map resolved service (name/host/port/TXT) → typed
   result, timeout 10s → kết thúc trung thực (empty, không error),
   error map theo Result pattern của module; **web guard**: lazy getter
   + typed TRANSPORT error (pattern `bleManager()` của BLE service —
   zeroconf module KHÔNG import tĩnh trên web path).
4. EDIT `ui/SettingsScreen*` — coder khảo sát cấu trúc form hiện tại
   rồi đặt nút "Tìm máy chủ trong mạng" ở khu broker/MQTT hợp lý: states
   idle/scanning/results/none; results = list (tên + host:port); tap →
   fill form QUA store actions sẵn có (updateMqtt/updateInflux — không
   bypass store); Platform.OS web → nút ẨN.
5. EDIT `core/i18n/strings.ts` — additions-only: nút tìm, đang quét,
   nhãn kết quả, không thấy + hint, reminder 2 secret.
6. EDIT `modules/settings/README.md` — mDNS contract section đầy đủ
   (bảng + fill rule + avahi example XML trên) — tài liệu chuẩn cho
   server side "đồng bộ backend mDNS".

## Out of scope

- Auto-save sau fill (user luôn bấm Lưu tay).
- Điền 2 secret (password MQTT / token Influx) từ bất kỳ nguồn nào.
- Backend/server-init.sh implementation (user — app chỉ pin contract +
   example).
- iOS testing (Android là target; plist declare-only).
- Zeroconf trên web (nút ẩn — BLE pattern).
- Auto-reconnect / auto-scan khi mở Settings (scan là explicit user
  action).
- Đổi settings schema (zod giữ nguyên).

## Architecture decisions (task-level)

- AD-1 (orchestrator-lock): 1 service type `_smarthome._tcp`, port =
  MQTT WS port, phần còn lại qua TXT — không quét nhiều service types,
  server chỉ cần 1 file avahi.
- AD-2: fill KHÔNG auto-save, KHÔNG đụng 3 secret fields — mDNS
  unauthenticated nên user review là bắt buộc.
- AD-3: TXT records optional; thiếu → default (influx_port 8086) hoặc
  keep-current (prefix/org/bucket) — không fail vì server advertise tối
  giản.
- AD-4: service wrapper mockable + web-safe lazy getter (pattern
  bleManager — zeroconf không tĩnh import trên web).
- AD-5: scan 10s timeout → kết thúc "không thấy" trung thực (không
  phải error); multi-result → list + explicit tap-to-fill.
- AD-6: avahi example XML trong settings README là nguồn chuẩn duy nhất
  cho server side (contract 2 phía như GATT pattern).
- AD-7: fill qua settings store actions (updateMqtt/updateInflux) —
  không set state trực tiếp, không bypass validation của form.

## Required tests

`mdnsDiscoveryContract.test.ts` (pure): service-type constant; TXT parse
(đủ records, thiếu records, port rác, prefix rác, TXT trống); mapping
applyDiscoveredService (đủ → đè đúng field; thiếu prefix/org/bucket →
giữ nguyên draft; secrets không xuất hiện trong output); influx URL
build + default 8086.

`mdnsDiscoveryService.test.ts` (mock lib): scan start/stop đúng; resolved
event → typed result đúng map; cleanup mọi exit path (timeout, error,
user stop); 10s timeout → empty result (không error); lib error → typed
error Result; web guard: lazy getter + TRANSPORT error, không construct
lib trên web.

`SettingsScreen*.test.tsx` (extend): nút hiển thị native / ẩn web
(Platform mock); scan states (idle → scanning → results/none); tap
result → form fields đúng (host/port/prefix/influx url/org/bucket) +
secrets GIỮ NGUYÊN (pin); KHÔNG auto-save (save action không được gọi
sau fill — pin); timeout → message + hint. Accounting các test hiện có
nếu signature props đổi.

## Constraints

- TS strict, no `any`, no non-null assertions, no `console.*`; Prettier;
  tokens.smart; strings additions-only.
- Module boundary: settings internal — không import devices; UI không
  import lib zeroconf trực tiếp (qua service).
- Tree SẠCH sau commit BLE v2 (task trước đã accept + commit) — diff chỉ
  scope files này.
- Gates trong `app-mobile/`; Prettier per-file (repo-wide format:check
  đang environmental-fail vì `android/` — ISSUE-023 item 8, không phải
  việc task này).
- GitNexus: index tươi (coder BLE v2 đã analyze); coder vẫn chạy impact
  pre-edit SettingsScreen (kỳ vọng LOW-MEDIUM — form screen dùng rộng)
  + detect_changes pre-DONE.

## Acceptance criteria

1. Nút "Tìm máy chủ trong mạng" hiện trên native, ẩn trên web; bấm →
   scanning state, disable spam.
2. Service advertise đúng contract (mock) → tap → mqtt.host/port +
   prefix + influx.url/org/bucket filled đúng; 3 secrets giữ nguyên.
3. TXT thiếu → default 8086 / keep-current cho prefix/org/bucket.
4. 10s không thấy → honest message + hint; multi-service → list.
5. KHÔNG auto-save sau fill.
6. Settings README có contract + avahi example XML (server copy chạy
   được luôn).
7. Web: nút ẩn, zeroconf không import tĩnh (lazy guard), không crash.
8. Gates xanh (baseline 86 suites / 1432 pass + test mới); scope đúng.

## Risks

- R1 (HIGH): zeroconf lib compatibility Expo 57 / RN 0.86 —
  `react-native-zeroconf` gốc khá cũ (AndroidX/support-lib era);
  research fork maintained trước khi chốt; nếu MỌI candidate conflict →
  STOP báo user (không tự viết native module).
- R2 (medium): NsdManager hành vi OEM/Android-version khác nhau; runtime
  permission nếu lib yêu cầu — eyeball device user sau native rebuild.
- R3 (low): mDNS unauthenticated — đã mitigate bằng AD-2 (fill-only,
  user review + save tay).
- R4 (info): server chưa advertise → app không thấy gì → hint trung
  thực; đó là trạng thái ĐÚNG cho đến khi user chạy avahi config.
- R5 (low): resolve mDNS chậm/lỗi trên vài router (mDNS reflection) —
  10s timeout + retry bằng cách bấm lại.

## Capability contract

- **Classification**: feature (native dependency mới — mức rủi ro cao
  nhất của task là R1 lib compat).
- **GitNexus level**: coder (impact pre-edit SettingsScreen +
  detect_changes pre-DONE); tester/reviewer read-only.

(Role/skill routing chuẩn: coder — Implement Plan + gitnexus-impact;
tester — Verify Changes; reviewer — Code Review; DENY list chuẩn theo
`.ai/capabilities/SKILL_POLICY.md`.)
