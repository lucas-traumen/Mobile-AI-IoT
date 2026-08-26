# Project Memory — Project

## Purpose
React Native mobile app (`mobile`) on a clean-slate baseline: starter screen and starter test removed; only a minimal shell remains. New features are planned on top of this baseline.

## Current architecture
Bare React Native app (no navigation library yet). `index.js` registers `App` from `App.tsx` via `AppRegistry` using the name in `app.json`. `App.tsx` is a minimal `View` + `Text` ("Hello, Mobile") shell. Native projects for Android (`android/`) and iOS (`ios/`) are generated and committed to the repo layout. Runtime dependencies are only `react` + `react-native`.

## Important modules
- `App.tsx` — JS root component (Fast Refresh entry), minimal shell.
- `index.js` — app registration entry.
- `android/`, `ios/` — native projects.
- No test files exist yet (`__tests__/` was removed with the starter test).

## External systems / protocols
None detected. No `.env` or secrets wiring.

## Build and runtime environment
- Node >= 22.11.0, React Native 0.87.0, React 19.2.3, TypeScript.
- Bundler-managed CocoaPods for iOS (`Gemfile`, `.bundle/config` → `BUNDLE_PATH: vendor/bundle`).
- Verified commands (from `package.json`):
  - Lint: `npm run lint`
  - Tests: `npm test`
  - Typecheck: `npx tsc --noEmit` (no dedicated script)
  - Run: `npm start`, `npm run android`, `npm run ios`
  - `npm test` currently exits non-zero with "no tests found" (no test files exist; `jest.config.js` lacks `--passWithNoTests`). Expected until tests are added — not a regression.

## GitNexus
- Available: yes
- Notes: GitNexus MCP/skills available in the user environment (gitnexus-cli, gitnexus-debugging, gitnexus-exploring, gitnexus-guide, gitnexus-impact-analysis, gitnexus-pdg-query, gitnexus-pr-review, gitnexus-refactoring, gitnexus-taint-analysis). Repo is not yet indexed (no commits); index after first commit if needed.
