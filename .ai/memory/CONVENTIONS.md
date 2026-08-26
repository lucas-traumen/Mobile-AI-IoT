# Project Memory — Conventions

Only record conventions supported by repository evidence or explicit user instruction.

## Naming
App registered under name `mobile` (`app.json`, `package.json`).

## Project structure
Bare React Native layout: JS root at `App.tsx`, tests in `__tests__/` as `<Name>.test.tsx`, native code in `android/` and `ios/` (edit only for native modules/config).

## Error handling
None established yet.

## Testing
Jest via `@react-native/jest-preset`; test files follow `__tests__/<Name>.test.tsx`.

## Logging
None established yet.

## API / interface conventions
None established yet.

## Other
- Prettier: `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'`.
- ESLint extends `@react-native/eslint-config`.
- `@react-native/*` tooling packages pinned to 0.87.0; keep them version-aligned when upgrading RN.
