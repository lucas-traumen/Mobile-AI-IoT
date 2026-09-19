# Current Task Plan

Status: NO_ACTIVE_PLAN

No active plan. The last accepted plans were archived at:
- `.ai/plans/archive/2026-09-18-boards-ble-wifi-provisioning.md`
  (`boards-ble-wifi-provisioning`, accepted 2026-09-19; BLE WiFi
  provisioning flow — `react-native-ble-plx` new dep, NATIVE REBUILD
  required; the QR watch-list idea DROPPED by user decision; ISSUE-022)
- `.ai/plans/archive/2026-09-18-boards-display-by-type.md`
  (`boards-display-by-type` + 2 live-debugging additions, accepted
  2026-09-18; the DURABLE board display convention; ISSUE-021)
- `.ai/plans/archive/2026-09-18-boards-qr-scan.md` (`boards-qr-scan`,
  accepted 2026-09-18; ISSUE-019)
- `.ai/plans/archive/2026-09-18-boards-image-by-name-layout.md`
  (`boards-image-by-name-layout`, accepted + superseded-in-part
  2026-09-18; ISSUE-020)
- `.ai/plans/archive/2026-09-18-boards-card-layout-search.md`
  (`boards-card-layout-search`, accepted 2026-09-18; ISSUE-018)

The boards onboarding loop is now CLOSED end-to-end: quét QR → board đã
biết = card; board mới = BLE WiFi provisioning (native only) → board nối
broker → card tự xuất hiện. Firmware phải implement BLE GATT contract
(`modules/devices/README.md`) trước khi luồng chạy trên phần cứng thật.

No approved NEXT candidate yet. User-side manual steps pending: `git
push`; `npm run android` native rebuild (expo-camera + ble-plx);
firmware BLE GATT implementation; fresh seed on the OPPO via
`adb shell pm clear com.example.iot`.

A new plan is created by the orchestrator after requirements discussion and
user approval (Harness V2 flow: discuss → classify + capability contract →
plan → user approve → implement → verify → review → accept → promote).
