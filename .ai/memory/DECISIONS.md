# Project Memory — Decisions

Store durable architectural/product decisions here.

## ADR-001 — Adopt Vibe Coding V1 role-based workflow
- Status: accepted
- Date: 2026-08-26
- Context: Bootstrap of a new React Native repository needed a durable, model/provider-neutral agent workflow.
- Decision: Use orchestrator + coder/tester/reviewer roles with durable artifacts under `.ai/` and definitions under `.opencode/`.
- Rationale: Role-stable, model-replaceable, provider-replaceable; recoverable from durable artifacts.
- Consequences: All tasks follow discuss → plan → approve → implement → verify → review → accept → memory promotion. No auto commit/push.
- Related files/modules: `AGENTS.md`, `.opencode/agents/`, `.opencode/skills/`, `.ai/`

## ADR-002 — Clean-slate baseline: remove RN starter screen, starter test, and unused runtime deps
- Status: accepted
- Date: 2026-08-26
- Context: User wanted the starter code and sample test removed to reduce noise before planning real features.
- Decision: `App.tsx` reduced to a minimal `View`+`Text` shell; `__tests__/App.test.tsx` deleted; `@react-native/new-app-screen` and `react-native-safe-area-context` uninstalled (runtime deps now only `react` + `react-native`). All devDependencies kept, including now-unused `react-test-renderer` / `@types/jest` / `@types/react-test-renderer` (useful when new tests are planned).
- Rationale: Minimal buildable base for fresh feature planning; keep the `index.js` → `App.tsx` registration chain intact.
- Consequences: `npm test` fails with "no tests found" until tests exist (accepted). Native autolinking simply drops removed packages on next build.
- Related files/modules: `App.tsx`, `package.json`, `package-lock.json`

## ADR-XXX — <title>
- Status: accepted | superseded | deprecated
- Date:
- Context:
- Decision:
- Rationale:
- Consequences:
- Related files/modules:

Do not invent historical decisions during bootstrap.
