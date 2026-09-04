# relay module

Room-scoped relay command building + optimistic switch state, corrected by
device feedback.

## Topic contract (room-scoped, approved settings-information-architecture plan)

- command: `<prefix>/room/<roomId>/cmnd/relay/<1..10>` with payload `"ON"` /
  `"OFF"`
- feedback: `<prefix>/room/<roomId>/stat/relay/<1..10>` with payload `"ON"` /
  `"OFF"`

Relay identity is the `{ roomId, slot }` value object (`RelayAddress`): the
same slot number can be used independently in different rooms. Out-of-contract
slots (0, 11, …) and malformed rooms (empty, `/`, `+`, `#`) are rejected at
build/parse time. The feedback subscription is a single MQTT wildcard
(`<prefix>/room/+/stat/relay/+`), so room/device changes need no
re-subscription — only prefix changes do (`applyPrefix`). The configured
prefix is regex-escaped during feedback parsing (M2).

## Public API (`api/index.ts`)

- `RelayService` — `setRelay({ roomId, index }, state)` plus
  `applyPrefix(prefix)`, `startFeedbackListener()`, `handleFeedbackMessage(msg)`
  on the implementation.
- `relayStore` — zustand store: optimistic ON/OFF per room-scoped slot,
  keyed by `relaySlotKey(roomId, index)` so equal slots in separate rooms
  never alias.
- Pure builders/guards: `buildRelayAddress`, `buildRelayCommand`,
  `buildRelayCommandTopic`, `buildRelayFeedbackTopic`,
  `relayFeedbackSubscriptionTopic`, `parseRelayFeedbackTopic`,
  `parseRelayStatePayload`, `isRelayIndex`, `isRelayRoomId`, `isRelayState`.

## Internal

- `domain/commands.ts` — address/command value objects + topic builders +
  topic/payload parsers (pure).
- `data/relayStore.ts` — optimistic state + feedback reconciliation keyed by
  room + slot.
- `services/relayService.ts` — publish, wildcard feedback subscription and
  room-scoped feedback parsing.

## Notes

- The devices module delegates `switch` capability commands here via the
  device command service, which derives the address from the device's own
  `roomId` + `binding.index` — widgets never publish topics directly.
  Roomless legacy relay devices are rejected with a validation error (no
  room-scoped topic can be built); assign them to a room first.
- `<prefix>/room/<roomId>/stat/relay/<index>` feedback (optional on the
  device) corrects optimistic UI for exactly the addressed `{roomId, slot}`.
- Migration: persisted legacy relay devices that already carry `roomId` +
  slot 1..3 remain structurally valid and naturally use the new room-scoped
  route — no stored device/dashboard data is rewritten. The topics are a
  BREAKING change for old firmware/automation listening on the legacy
  `<prefix>/cmnd|stat/relay/<n>` topics.
