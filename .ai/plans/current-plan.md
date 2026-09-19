# Current Task Plan — `settings-secrets-qr`

Status: APPROVED (user "vậy triển khai đi" + "ok" 2026-09-19 — chốt
stepper 3 chấm + QR secret từ server; máy đầu tiên zero-typing)

## Goal

Đóng Bước 2 của onboarding 2 bước trong Cấu hình nâng cao: sau khi mDNS
điền 6 field non-secret, phần "Mật khẩu & token" nhận giá trị qua 2
đường — **quét QR do server in** (terminal) hoặc nhập tay. Cả luồng
onboarding hiển thị bằng **stepper 3 chấm** (Tìm server → Mật khẩu →
Lưu) theo trạng thái DỮ LIỆU form. JS-only — KHÔNG native rebuild, không
dependency mới (expo-camera có sẵn; app chỉ QUÉT, server mới in).

## Secrets QR contract (server in — BINDING; mirror vào settings README)

```bash
# server-init.sh in ra terminal cho owner quét:
qrencode -t ANSIUTF8 '{"schemaVersion":1,"kind":"credentials","mqttUsername":"...","mqttPassword":"...","influxToken":"..."}'
```

- `kind: "credentials"` — forward-compat: sau này thêm `kind: "system"`
  (full-system-share, task riêng); kind lạ → lỗi trung thực "Loại QR
  không hỗ trợ", KHÔNG thử parse tiếp.
- Field: `mqttUsername` / `mqttPassword` / `influxToken` — string, tất
  cả optional (field vắng/ rỗng → giữ nguyên form, không đè); QR mà
  không field nào có giá trị → lỗi "QR rỗng".
- zod validate như mọi external data (pattern `boardQrLabel` — schema
  version literal pin).
- QR này là **chìa khóa** — chỉ in trên terminal do owner kiểm soát;
  README ghi cảnh báo KHÔNG để server-init.sh ghi secret vào file log
  thường trực.

## Stepper 3 chấm (bố cục đã chốt với user)

```
● ─── ● ─── ●        Tìm server │ Mật khẩu │ Lưu
```

- **Màu theo D3 contract có sẵn** (header AdvancedSettingsScreen): teal
  = hoàn thành, amber = việc cần làm NGAY (bước chưa xong ĐẦU TIÊN),
  xám = chưa tới.
- **Trạng thái suy từ DỮ LIỆU form, không từ lịch sử tương tác**:
  - Bước 1 ✓ ⇔ `mqtt.host` non-empty (đến từ mDNS HOẶC gõ tay)
  - Bước 2 ✓ ⇔ `mqtt.password` non-empty VÀ `influx.token` non-empty
  - Bước 3 ✓ ⇔ bước 1+2 ✓ VÀ draft == persisted (dùng `mqttDirty` /
    `influxDirty` props có sẵn; edit sau khi lưu → mất ✓, về amber)
- Tap chấm ✓ → mở lại khối nội dung bước đó; chấm amber/gray không
  điều hướng.
- Khi bước 3 ✓: toàn khu setup thu gọn 1 dòng "✓ Đã cấu hình — Chỉnh
  sửa" → mở lại được.
- **Active block** = nội dung bước amber (một khối active tại một thời
  điểm); các bước teal thu gọn header.
- Form 8 ô phía dưới KHÔNG đụng — đường gõ tay vĩnh viễn, dots tự nhích
  theo dữ liệu.

## Bước 2 — khối nội dung

```
[ 📷 Quét QR từ server ]   [ ⌨ Nhập tay ]
```

- Unlock khi bước 1 ✓ (host có giá trị); trước đó mờ + dòng nhỏ "Tìm
  server trước".
- **Nhập tay** → focus vào ô password (ref focus — affordance đơn giản).
- **Quét QR** → mở scanner modal (mới, xem scope) → parse contract →
  điền username/password/token qua `onUpdateMqtt`/`onUpdateInflux` →
  đóng modal. KHÔNG auto-save.

## Bước 3 — khối nội dung

Nút LƯU to (cùng handler `onSave` sẵn có, cùng điều kiện enabled như nút
Lưu của form — KHÔNG tạo logic save thứ hai). Text nhắc "Soát lại cấu
hình rồi lưu".

## Scope (app side)

1. NEW `core/ui/QrScannerModal.tsx` + test — camera scanner shell
   GENERIC (expo-camera; props: title/hint, `onScanned(raw) → boolean`
   re-arm seam theo pattern BoardsScannerModal v2; payload thô từ chối
   hiển thị dòng diagnostic mono 80 chars + `…`; nút đóng; testID
   pattern). NOTE: devices' BoardsScannerModal KHÔNG đụng — migration
   sang primitive chung là backlog riêng. Camera hoạt động cả trên web
   (đã verify live ở boards scanner).
2. NEW `settings/internal/domain/secretsQrContract.ts` + test — zod
   schema kind:credentials; parse → typed result; garbage / kind lạ /
   QR rỗng → typed error.
3. EDIT `ui/AdvancedSettingsScreen.tsx` + test — stepper + active
   blocks + gating + thu gọn + khối bước 2 (2 nút + focus) + khối bước 3
   + wire scanner modal.
4. EDIT `core/i18n/strings.ts` — additions-only: nhãn bước, nút quét/nhập
   tay, unlock hint, dòng thu gọn, scanner title/hints, lỗi kind/QR
   rỗng, cảnh báo README-side không cần string.
5. EDIT `modules/settings/README.md` — QR secret contract: bảng field +
  lệnh qrencode cho server + cảnh bảo chìa khóa/log + forward-compat
  kind:system note.

## Out of scope

- `kind: "system"` full-system-share (phòng + dashboard qua QR — task
  riêng sau, cần spike nén).
- Migration BoardsScannerModal sang core/ui primitive (backlog).
- Đổi settings schema; auto-save; broker anonymous.
- Generate QR phía app (chỉ server in; app chỉ scan).
- iOS testing; đổi 2 card trạng thái (MQTT live/Influx probe).

## Architecture decisions (task-level)

- AD-1: stepper data-derived (host/password/token/dirty từ store) —
  không interaction history; hai đường (auto + tay) cùng feed một
  nguồn sự thật.
- AD-2: QR contract kind-discriminated; credentials chỉ 3 field secret;
  field optional keep-current; kind lạ honest error.
- AD-3: scanner generic đặt `core/ui` (shared primitive chuẩn repo —
  OperationBanner precedent); devices migration backlog.
- AD-4: bước 2 unlock theo bước 1 (data); form tay chỉnh trực tiếp
  bất cứ lúc nào (không bị gate).
- AD-5: bước 3 ✓ = saved && !dirty (reuse mqttDirty/influxDirty); nút
  bước 3 dùng handler onSave duy nhất.
- AD-6: thu gọn sau hoàn tất; "Chỉnh sửa" mở lại toàn bộ stepper.
- AD-7: quét QR khả dụng cả web (camera web-capable — precedent boards
  scanner chạy thật trên web).

## Required tests

`secretsQrContract.test.ts` (pure): parse đầy đủ/1 field; field rỗng →
keep-current; QR rỗng → error; kind lạ → error; garbage JSON → error;
schemaVersion sai → error.

`QrScannerModal.test.tsx` (mock camera lib theo pattern BoardsScanner
test): render title/hint; scan valid → onScanned nhận raw + return
false giữ modal + dòng diagnostic raw 80 chars; return true đóng; nút
đóng; re-arm (scan lại sau diagnostic).

`AdvancedSettingsScreen.test.tsx` (extend): stepper 5 trạng thái pin
theo dữ liệu — (a) form trống: dot1 amber, dot2/3 gray; (b) host filled
(gõ tay!): dot1 teal, dot2 amber; (c) +password+token: dot3 amber, nút
Lưu bước 3 enabled; (d) saved (draft==persisted): 3 teal + thu gọn "✓
Đã cấu hình"; (e) edit sau lưu: dot3 về amber. Khối bước 2: gating mờ
khi chưa có host; nút Nhập tay focus password (focus spy); quét QR
(mock scanner/service) → điền đúng 3 field qua store actions, KHÔNG
gọi onSave (no-auto-save pin); tap chấm ✓ mở lại khối. Accounting các
test hiện có (form test phải sống nguyên).

## Constraints

- TS strict, no `any`, no non-null assertions, no `console.*`; Prettier;
  tokens.smart (D3 colors — không màu mới); strings additions-only.
- Module boundary: settings import `@core/ui` OK; KHÔNG import devices.
- Test cũ của AdvancedSettingsScreen được phép update tối thiểu nếu
  layout wrapper đổi (accounting — form behaviors phải pin sống).
- Tree phải SẠCH sau commit mDNS (task trước accepted + committed).
- Gates trong `app-mobile/`; Prettier per-file (repo-wide environmental
  fail — ISSUE-023 item 8).
- GitNexus: coder chạy impact pre-edit `AdvancedSettingsScreen` (symbol
  có trong index từ trước — OK) + `SettingsNavigator`; nếu symbol cần
  impact không có trong index (files mDNS chưa index) → chạy
  `node .gitnexus/run.cjs analyze` trước (preflight có điều kiện).
  detect_changes pre-DONE.

## Acceptance criteria

1. Stepper 3 chấm đúng màu D3 theo dữ liệu form — pin 5 trạng thái
   (a)–(e); gõ tay form cũng nhích dots (data-derived).
2. Khối bước 2: gating theo host; Nhập tay focus password; Quét QR mở
   scanner.
3. Quét QR đúng contract → điền đúng 3 field qua store actions; KHÔNG
   auto-save; QR sai kind/garbage → diagnostic raw + re-arm.
4. Bước 3 nút Lưu dùng handler duy nhất; ✓ chỉ khi saved && !dirty.
5. Hoàn tất → thu gọn "✓ Đã cấu hình — Chỉnh sửa" → mở lại được.
6. Settings README có contract + lệnh qrencode + cảnh báo.
7. Web: quét QR hoạt động; không crash; stepper render đúng.
8. Gates xanh (baseline 88 suites / 1464 pass + test mới); JS-only
   (không native rebuild); scope đúng.

## Risks

- R1 (low): stepper render trong màn hình form dài — cân scroll layout;
  test dùng pattern flattenStyle/allText sẵn.
- R2 (low): camera focus web khác OEM — precedent boards scanner đã
  chạy thật trên web.
- R3 (info): server chưa in QR → user nhập tay (đúng hành vi — không
  chết ngõ).
- R4 (low): focus ref trên một số Android keyboard — test pin qua spy,
  runtime eyeball user.

## Capability contract

- **Classification**: feature (UI + contract mới; KHÔNG dependency mới,
  KHÔNG native rebuild — JS-only).
- **GitNexus level**: coder (impact pre-edit + detect_changes pre-DONE);
  tester/reviewer read-only.

(Role/skill routing chuẩn: coder — Implement Plan + gitnexus-impact;
tester — Verify Changes; reviewer — Code Review; DENY list chuẩn theo
`.ai/capabilities/SKILL_POLICY.md`.)
