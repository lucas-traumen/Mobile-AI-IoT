/**
 * Theme provider + context.
 *
 * `core` must never import a module: the provider only receives a
 * `ThemeMode` prop. The app (composition root) reads the persisted theme
 * mode from the settings store and passes it down. `'system'` resolves to
 * the device color scheme via react-native's `useColorScheme()`.
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';

import { DARK_TOKENS, LIGHT_TOKENS, type ThemeTokens } from './tokens';
import type { ThemeMode } from './ThemeMode';

/** Resolve the actual dark/light flag for a mode. */
export function isDarkMode(
  mode: ThemeMode,
  systemScheme: ColorSchemeName,
): boolean {
  if (mode === 'dark') {
    return true;
  }
  if (mode === 'light') {
    return false;
  }
  return systemScheme === 'dark';
}

/** Theme context value provided to the whole app. */
export interface ThemeContextValue {
  /** Resolved theme mode ('system' stays 'system' — not resolved). */
  readonly mode: ThemeMode;
  /** True when the *effective* theme is dark. */
  readonly isDark: boolean;
  /** Active token set (light or dark). */
  readonly tokens: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * React context provider for the theme.
 *
 * @param props.mode - `'system'` resolves through `useColorScheme()`.
 * @returns The provider; screens consume the context via {@link useTheme}.
 */
export function ThemeProvider({
  mode,
  children,
}: {
  readonly mode: ThemeMode;
  readonly children: ReactNode;
}) {
  const systemScheme = useColorScheme();

  // `useColorScheme` re-renders on change, so this recomputes live.
  const value = useMemo<ThemeContextValue>(() => {
    const isDark = isDarkMode(mode, systemScheme);
    return {
      mode,
      isDark,
      tokens: isDark ? DARK_TOKENS : LIGHT_TOKENS,
    };
  }, [mode, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Access the active theme context.
 *
 * @returns `{ mode, isDark, tokens }`.
 * @throws When used outside a {@link ThemeProvider}.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return context;
}
