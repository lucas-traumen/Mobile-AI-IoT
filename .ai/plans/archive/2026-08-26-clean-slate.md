# Current Plan

Status: APPROVED

Task: `clean-slate` — strip the RN starter app down to a minimal shell and remove unused dependencies, so the user can plan fresh features on a clean base. Supersedes the `greeting-component` plan (which was never implemented).

## Goal

Remove all starter-screen code, the starter test, and the now-unused dependencies, leaving a minimal buildable app shell.

## Current state

- `App.tsx` renders the starter `NewAppScreen` inside `SafeAreaProvider` (uses `@react-native/new-app-screen` and `react-native-safe-area-context`).
- `__tests__/App.test.tsx` is the only test (starter sample).
- `index.js` registers `App` from `App.tsx` via `AppRegistry` (name from `app.json`) — this chain must remain intact.
- Repo has no git commits; all files untracked.

## Target state

- `App.tsx` reduced to a minimal component: a single `View` with placeholder `Text` (no `NewAppScreen`, no safe-area usage).
- `__tests__/App.test.tsx` deleted (`__tests__/` dir removed if empty).
- `package.json` dependencies pruned to `react` + `react-native` only; `package-lock.json` and `node_modules` refreshed via `npm install` (uninstall of `@react-native/new-app-screen` and `react-native-safe-area-context`).
- `npm run lint` passes; `npx tsc --noEmit` passes.

## Scope

1. Rewrite `App.tsx` to a minimal default-exported component (`View` + `Text`, e.g. "Hello, Mobile"), following Prettier conventions.
2. Delete `__tests__/App.test.tsx`.
3. Remove unused deps: `npm uninstall @react-native/new-app-screen react-native-safe-area-context` (updates `package.json` + `package-lock.json`).
4. Verify lint + typecheck pass.

## Out of scope

- No changes to `index.js`, `app.json`, `babel.config.js`, `metro.config.js`, `jest.config.js`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc.js`.
- No changes under `android/` or `ios/` (native projects untouched).
- No new features, no new tests (user will plan next).
- No git commit/push.

## Architecture decisions

- Keep the app buildable: `App.tsx` must remain as the default-exported root registered by `index.js`.
- Keep all devDependencies as-is (RN toolchain); only prune the two runtime deps that become unused.

## Relevant files/modules

- `App.tsx` (rewritten)
- `__tests__/App.test.tsx` (deleted)
- `package.json`, `package-lock.json` (updated by npm uninstall)
- `node_modules` (refreshed)

## Implementation steps

1. Rewrite `App.tsx` minimally.
2. Delete `__tests__/App.test.tsx` (and the now-empty `__tests__/` directory).
3. Run `npm uninstall @react-native/new-app-screen react-native-safe-area-context`.
4. Run `npm run lint` and `npx tsc --noEmit`; fix in-scope failures.
5. Update `.ai/state/current-task.md` checkpoints.

## Constraints

- Formatting must satisfy Prettier/ESLint config (single quotes, trailing commas, arrow parens avoid).
- `npm test` is expected to fail with "no tests found" after cleanup — this is accepted (Jest has no `--passWithNoTests` configured); not a blocker.

## Acceptance criteria

1. `App.tsx` contains no references to `NewAppScreen`, `@react-native/new-app-screen`, or `react-native-safe-area-context`; renders a minimal `View`/`Text`.
2. `__tests__/App.test.tsx` no longer exists.
3. `package.json` `dependencies` contain only `react` and `react-native`; `@react-native/new-app-screen` and `react-native-safe-area-context` are gone from `package.json` and `package-lock.json`.
4. `npm run lint` passes.
5. `npx tsc --noEmit` passes.
6. No files outside scope are modified.

## Required tests

None — the task removes the only existing test by user request. Verification relies on lint + typecheck.

## Risks / open questions

- Jest "no tests found" exit code will make `npm test` fail until new tests are planned — accepted by user intent.
- `react-native-safe-area-context` may be referenced by native autolinking on next native build; since it's removed from `package.json`, autolinking will simply drop it. No manual native edits planned.
