# AGENTS.md

## Stack

- React Native 0.87.0, React 19.2.3, TypeScript 6.0.3, Node `>= 22.11.0` (enforced via `package.json` `engines`).
- Lint / format / test: ESLint 8, Prettier 2.8.8, Jest 29.
- App and package name: `mobile` (see `package.json` and `app.json`).

## Setup (first clone)

- `npm install` — required before any other command; `node_modules/` is gitignored.
- iOS only, first time and after any native-dep change: `bundle install`, then `bundle exec pod install`. `.bundle/config` pins `BUNDLE_PATH: vendor/bundle`, so gems stay inside the repo.
- Android: `local.properties` is gitignored; Android tooling generates it on first build. Run with an emulator or device attached.

## Commands

- `npm start` — Metro dev server (start first; `android` / `ios` builds need it).
- `npm run android` / `npm run ios` — build and launch.
- `npm run lint` — ESLint over the repo via `@react-native/eslint-config`. There is **no `typecheck` script** defined; use `npx tsc --noEmit`.
- `npm test` — Jest via `@react-native/jest-preset`. Single file: `npm test -- App.test` (Jest's `-t` / `--testPathPattern` also work).

## Layout

- `index.js` registers `App` with `AppRegistry` using the name from `app.json`. Renaming the app means editing `app.json`, not `index.js`.
- `App.tsx` is the JS root and the Fast Refresh entry point.
- `__tests__/` holds Jest test files (convention: `<Name>.test.tsx` next to the module, or here for top-level components).
- `android/` and `ios/` are generated native projects — edit only when adding a native module or changing native config.
- `Gemfile` pins `cocoapods >= 1.13, != 1.15.0, != 1.15.1` and a few transitive gems; don't change without a reason.
- `vendor/bundle/` is created by Bundler (gitignored).

## Conventions

- Prettier: `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'` (see `.prettierrc.js`).
- TS / ESLint / Metro / Babel / Jest each extend a `@react-native/*` preset pinned to `0.87.0`. Keep them on the same version when upgrading RN.

## Out of scope (do not invent)

- No CI, PR template, branch policy, or release flow is documented. Don't add any without asking.
- No `.env` or secrets wiring exists; ask before introducing one.

## Vibe Coding V1 workflow

Project dùng bốn role-based agents:

- `orchestrator`: requirement analysis, planning, delegation, recovery, synthesis, memory promotion.
- `coder`: implementation owner.
- `tester`: independent verification.
- `reviewer`: independent read-only code review.

Required flow:

`discuss → plan → user approve → implement → verify → review → user accept → memory promotion`

### Guardrails

- Orchestrator không sửa production code.
- Coder chỉ làm trong approved scope.
- Tester không repair production code.
- Reviewer không repair production code.
- Subagents không delegate subagent khác.
- Không push tự động.
- Không commit tự động trừ khi user yêu cầu.
- `.ai/plans/current-plan.md` là approved task contract.
- `.ai/state/current-task.md` là recoverable execution checkpoint.
- Dùng GitNexus cho code relationship / impact analysis khi khả dụng.
- Durable decisions phải nằm trong `.ai/memory/`, không chỉ ở session history.