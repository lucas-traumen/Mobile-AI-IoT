# devices module

Rooms, devices and the capability model — the V2 bridge between widgets and
the MQTT wire format.

## BLE WiFi provisioning contract (boards-ble-wifi-provisioning — SHARED DOC, firmware side implements this)

Board mới rút hộp (chưa có WiFi) được cấu hình mạng qua BLE từ app. Phần
dưới đây là hợp đồng 2 phía: app (đã code) và firmware (cần flash theo
đúng bảng này) — đổi bất kỳ UUID/giá trị nào là đổi CẢ HAI phía.

**Base UUID (cố định, 128-bit):**

| Mục                              | UUID                                   |
| -------------------------------- | -------------------------------------- |
| Service                          | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a01` |
| Device Info (READ)               | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a05` |
| WiFi SSID (WRITE, encrypted)     | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a02` |
| WiFi Password (WRITE, encrypted) | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a03` |
| Command (WRITE)                  | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a04` |
| Status (NOTIFY)                  | `e5f4a3b2-1c0d-4e2f-9a8b-7c6d5e4f3a06` |

**Hành vi firmware (ESP32):**

1. Boot **không có WiFi đã lưu** → bật BLE advertising: service UUID trên +
   local name `IoTBoard-{boardId}` (VD `IoTBoard-0`)
2. **Device Info** (read): trả về JSON y format nhãn QR —
   `{"schemaVersion":1,"boardId":"0","boardType":"IoT_ESP32-S2R3"}` (board
   tự mô tả bằng đúng descriptor của nó)
3. **SSID/Password** chars: `WRITE` + yêu cầu encrypted link
   (ESP_GATT_PERM_WRITE_ENCRYPTED) → lần ghi đầu kích hoạt **pairing Just
   Works + bond** (v1 chấp nhận không MITM — đây là hạn chế đã ghi rõ)
4. **Command** char: nhận `PROVISION` (ASCII) → thử kết nối WiFi bằng
   SSID/pass đã ghi (lưu NVS khi thành công). Giới hạn: SSID ≤ 32 bytes
   UTF-8, pass ≤ 63 bytes (rỗng = mạng mở)
5. **Status** notify (ASCII):
   - `IDLE` (sau khi app connect, chưa PROVISION)
   - `CONNECTING` (đang thử WiFi)
   - `CONNECTED` (đã có IP — firmware tiếp tục nối broker theo .env như
     thường; giữ BLE ~30s nữa rồi tắt)
   - `FAILED:BAD_AUTH` | `FAILED:NO_SSID` | `FAILED:TIMEOUT` |
     `FAILED:ERROR` (app cho sửa pass + gửi lại; chars ghi lại được)
6. Ghi dài (>MTU) dùng write-with-response — firmware reassemble (ATT long
   write chuẩn); app request MTU 128 sau connect (best-effort)

**App side (đã triển khai trong module này):**

- Scan lọc theo Service UUID; board nhận diện qua local name
  `IoTBoard-{boardId}` (`bleProvisioningContract.boardIdFromLocalName`,
  boardId dùng đúng grammar mã board như nhãn QR).
- Thứ tự provisioning: connect → request MTU 128 (best-effort) → discover
  → subscribe Status (TRƯỚC khi ghi) → write SSID → write Password (rỗng
  = mạng mở) → write `PROVISION` — toàn bộ write-with-response, Base64
  UTF-8. Đếm byte bằng UTF-8 thật (`validateWifiCredentials`), không đếm
  ký tự.
- Timeout phía app 30s không thấy `CONNECTED`/`FAILED:*` → báo TIMEOUT
  (`BLE_PROVISION_TIMEOUT_MS`); lỗi firmware trả về dạng typed
  (`BleProvisionError.reason`).
- Sau `CONNECTED` board tự nối broker như thường — descriptor retained
  về là card board xuất hiện trên BoardsScreen.
- App nhớ SSID lần gửi thành công gần nhất (AsyncStorage key riêng
  `devices.ble.lastSsid` — KHÔNG đụng schema registry chính); mật khẩu
  KHÔNG BAO GIỜ được lưu.
- Hạn chế v1 (đã duyệt): WiFi-only (không gửi broker URI/auth qua BLE —
  firmware giữ trong .env); pairing Just Works + bond, không MITM.

## Public API (`api/index.ts`)

- `Room`, `Device`, `DeviceBinding` (`telemetry-sensor` | `relay` with a
  room-scoped slot 1..10), `CapabilityDef`, `CapabilityType`,
  `DeviceCapabilityValue`, `SeriesPoint`.
- `DeviceRegistryService` — load/save rooms + devices + capability catalog.
- `DeviceCommandService` — `switch` capability → room-scoped relay command;
  sensor capabilities are read-only.
- `createDeviceStateStore` — zustand store: live values keyed
  `deviceId:capability` + capped numeric series (`subscribe(listener)` is the
  reactive seam for widgets).
- Sensor projection (approved room-sensor rework): `projectSensorRegistrations`,
  `countRoomSensors`, `countRoomCategory`, `sensorFieldTakenInRoom` — one
  user-facing sensor = ONE metric; identity is `{roomId, field}` (unique per
  room); a legacy multi-capability board projects as separate
  temperature/humidity registrations.
- Per-room capacity contract (service-authoritative): `MAX_SENSORS_PER_ROOM`,
  `MAX_RELAYS_PER_ROOM` (10 + 10), plus pure helpers `countRoomDevices`,
  `maxDevicesPerRoom`, `deviceCategory`, `roomCapacityWorseningError`
  (sensor quota counts PROJECTED metric registrations),
  `relaySlotTakenInRoom` — the UI mirrors them for counters/disabled states.

## Internal

- `domain/` — capability model (kind: sensor/switch; unit, icon, color,
  machine key + editable label), room migration helpers, per-room capacity
  helpers, curated capability icon groups/presets (`capabilityPresets.ts`),
  pure validation.
- `data/deviceRegistry.ts` — AsyncStorage persistence (zod-validated).
- `data/deviceStateSync.ts` — mirrors `telemetry:received` / `relay:*` /
  `relay:commandFailed` bus events into the state store; room/field readings
  dispatch EXACTLY (a `{roomId, field, value}` message updates only the
  matching registrations); relay events match `{roomId, slot}` so equal
  slots in separate rooms stay isolated. A `relay:commandFailed` (M13-4
  timeout) restores the pre-command device value (or clears it to unknown
  when none was known) and stores the per-capability command error;
  the next `relay:command`/`relay:feedback` on the matched device clears it
  (read by widgets through `WidgetServices.getCommandError`).
- `services/boardInventoryService.ts` — descriptor-driven board discovery
  on the shared MQTT client (boards-topic-contract-v2): the RETAINED
  descriptor on `<prefix>/boards/<id>/descriptor` (zod-validated,
  schemaVersion 1, topic/payload id equality, strict `S<n>`/`K1..K10`
  channel grammars, duplicate-channel rejection, replacement-not-union) is
  the authoritative channel source; the RETAINED plain-text status on
  `<prefix>/boards/<id>/status` drives the online/offline badge. Entries
  merge in EITHER order (`seen` = descriptor received, no status yet);
  discovery is descriptor/status-driven ONLY — bus data events never create
  entries. `resolveSensorField(boardId, channel)` is the resolver port the
  telemetry module consumes. No auto-provisioning: descriptors never create
  rooms, devices or capabilities.
- `ui/DevicesScreen.tsx` — `DeviceManagementScreen` (opened from Settings →
  Quản lý) is ROOM-FIRST (approved room-sensor rework): a room list with the
  explicit `+ Thêm phòng` action opens a room's detail with ONLY
  `Cảm biến n/10` and `Điều khiển n/10` sections — no `Tất cả`, repeated
  room chooser or binding-kind chooser. The chosen room is inherited by
  every form: sensor add picks exactly ONE metric (duplicates/full rooms
  omitted, curated custom-metric creation as a secondary action with the
  immutable machine key "Mã trường dữ liệu (MQTT/InfluxDB)"); relay add asks
  only name + free room-scoped slot 1..10. For a room BOUND to a board with
  a descriptor, the add-device dialog offers the DESCRIPTOR's fields
  (catalog label when the field matches, raw field otherwise, filtered by
  the not-taken rule) and the descriptor's K channels ∩ free slots —
  unbound rooms keep the full catalog + slots 1..10. Room rename/delete keep the
  migration dialog; legacy roomless records stay manageable in a dedicated
  room-list section (assign/delete — never a global filter). General
  operation feedback shows top-center (`OperationBanner`); field validation
  stays inline.
- `ui/BoardsScreen.tsx` — the hardware-boards surface (Settings root):
  one card per discovered board with the descriptor `displayName` (the
  stable wire code stays visible as secondary text), the status chip, the
  board type, the declared sensor channels as `S<n> → catalog label` and
  the declared relay channels compressed to K-ranges (`K1–K3`); the
  assign/unassign binding actions are unchanged. The QR not-found sheet
  (a scanned board the broker never saw) now doubles as the BLE
  onboarding entry: a `Cấu hình WiFi qua Bluetooth` handoff (hidden on
  web) opens `ui/BleProvisioningModal.tsx` with the QR label's boardId —
  the modal is a display shell + form over
  `internal/services/bleWifiProvisioningService.ts` (the ONLY BLE-stack
  touchpoint; tests inject fakes through the
  `BleWifiProvisioningServiceLike` seam; the GATT contract itself lives
  in `internal/domain/bleProvisioningContract.ts` — see the contract
  section at the top of this file).

## Key rules

- **Capability label vs machine key:** the UI shows the catalog `label`
  (e.g. "Nhiệt độ"); bindings, MQTT topics and InfluxDB `_field` values carry
  the machine key (`temperature`), fixed at capability creation. NEW keys
  must satisfy the strict ASCII format (`CAPABILITY_KEY_REGEX`); legacy
  persisted keys remain loadable.
- **Per-room capacity (service-authoritative):** every concrete room accepts
  at most 10 PROJECTED sensor metrics (one visible sensor = one metric; a
  legacy multi-capability board consumes two quota units) and 10 relay
  devices — enforced on add and on move/update (excluding the edited
  device). Loaded legacy multi-capability records permit non-worsening
  edits (e.g. rename); any new multi-field write is rejected. A relay slot may be used at
  most once per room; the SAME slot in different rooms is fine. Room count
  itself is unlimited. Over-capacity legacy snapshots stay loadable, and
  mutations may not worsen the violating room (a migration `move` into a
  full room is rejected; `unassign` always remains).
- **New devices require a room:** `NewDeviceInput.roomId` is required and
  must reference an existing room; the persisted `Device.roomId` stays
  optional so roomless legacy records and the room-deletion `unassign`
  migration remain loadable and manageable.
- **Catalog membership enforcement (fix cycle 1):** `addDevice` /
  `updateDevice` reject capability types that are not in the catalog and
  kinds that do not match the binding (`sensor` ↔ telemetry-sensor,
  `switch` ↔ relay).
- **Room removal is migration-only:** there is no plain `removeRoom` on the
  service — deletion always goes through `removeRoomWithMigration`. The
  mutation is two-phase (registry commit → widget migration); when the
  widget migration fails, the registry performs a compensating rollback
  (previous snapshot restored in the repository and mirror store) and
  returns an explicit failure carrying both details — a partial mutation is
  never reported as success.
- **Removal cascade:** deleting a device publishes `devices:changed` with
  `removedDeviceIds`; the composition root removes its widgets from all
  dashboards and drops its live values/series.
- Device deletion with rooms still populated triggers the migration dialog
  (move devices to another room or unassign) — a room is never deleted with
  devices silently orphaned.
