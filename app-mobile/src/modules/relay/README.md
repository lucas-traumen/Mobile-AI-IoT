# relay module

Relay command building + optimistic switch state, corrected by device
feedback.

## Public API (`api/index.ts`)

- `RelayService` — `applyPrefix(prefix)`, `startFeedbackListener()`,
  `handleFeedbackMessage(msg)`, `publish(index, state)`.
- `relayStore` — zustand store: optimistic ON/OFF per relay index (1..3).

## Internal

- `data/relayStore.ts` — optimistic state + feedback reconciliation.
- `internal/services/relayService.ts` — topic builders
  (`<prefix>/cmnd/relay/<n>`) + validation (index 1..3, state ON/OFF).

## Notes

- The devices module delegates `switch` capability commands here via the
  device command service — widgets never publish topics directly.
- `stat/relay/<n>` feedback (optional on the device) corrects optimistic UI.
