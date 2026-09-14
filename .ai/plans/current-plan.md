# Current Plan

NO_ACTIVE_PLAN

(Last completed: `board-discovery-binding` — accepted 2026-09-13, archived at
`.ai/plans/archive/2026-09-13-board-discovery-binding.md` (ADR-022; 2 fix
cycles; final 77 suites / 1173 pass). Sibling accepted same session:
`section-scoped-cross-room-placement` → archive/2026-09-13-section-scoped-cross-room-placement.md
(ISSUE-012 item 2 closed; retroactive reviewer APPROVE attempt 7.)

Next candidate (user-approved direction, not yet planned): `settings-qr-share`
— QR chia sẻ cấu hình (generate QR từ settings máy đã setup, máy khác quét để
áp dụng; QR chứa MQTT + Influx settings có version; libs: react-native-qrcode-svg
+ expo-camera; security note: QR chứa credentials — hiện chủ động, không auto).

Đệm backend (repo Mobile_Backend, việc của orchestrator bên đó): M10
integration test chưa chạy (code bridge + mosquitto WS listener đã có); user
flash firmware DEVICE_ID = ROOM_ID từng board + nhập settings LAN vào app.
