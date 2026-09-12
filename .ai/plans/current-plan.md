# Current Plan

NO_ACTIVE_PLAN

(Last completed: `remove-resize-diag-instrumentation` — accepted 2026-09-12,
archived at `.ai/plans/archive/2026-09-12-remove-resize-diag-instrumentation.md`.
ISSUE-011 closed; full-suite baseline is now 75 suites / 1100 pass / 0 fail.
Uncommitted at reset time — user runs the commit: 4 production files +
the 2 tracked `.ai/` files.)

Next candidate task (discussed, not yet planned): backend integration —
contract mapping between `Mobile_Backend` (smarthome/{deviceId}/... →
InfluxDB Cloud Serverless, no HTTP API, TCP-only mosquitto) and this frontend
(`<prefix>/room/{roomId}/sensor/{field}` per-field numeric, relay
cmnd/stat room-scoped, Flux queries that InfluxDB Cloud Serverless cannot
serve). Awaiting user's integration-direction decision (backend bridge /
firmware re-contract / hybrid) before planning.
