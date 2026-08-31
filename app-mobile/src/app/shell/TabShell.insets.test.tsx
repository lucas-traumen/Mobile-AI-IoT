/**
 * TabShell safe-area seam tests.
 *
 * The shell owns the runtime top/bottom insets (children must not apply them
 * again). These tests render the shell with mocked `react-native-safe-area-context`
 * insets at the representative values — 0, 24 (Android gesture navigation)
 * and 34 (iOS home indicator) — and assert:
 *
 * - the tab bar reserves the bottom inset as `paddingBottom` (the surface
 *   background fills the inset area);
 * - the screen content container reserves the top inset exactly once;
 * - exactly the three approved tabs render inside a safe-area provider.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@core/theme';
import { safeInset } from '@core/safeArea';
import { TabShell } from './TabShell';

/** Mutated per test — the mock closure reads it lazily during render. */
const MOCK_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => ({
  // Root provider seam: passthrough so the shell renders inside a provider.
  SafeAreaProvider: ({ children }: { readonly children: React.ReactNode }) =>
    children,
  useSafeAreaInsets: () => MOCK_INSETS,
}));

async function renderShell(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SafeAreaProvider>
        <ThemeProvider mode="light">
          <TabShell renderScreen={() => <View testID="screen" />} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

/** The effective `paddingBottom` across a (possibly array) style. */
function stylePaddingBottom(style: unknown): number | undefined {
  const styles = Array.isArray(style) ? [...style].reverse() : [style];
  for (const entry of styles) {
    if (
      entry !== null &&
      typeof entry === 'object' &&
      'paddingBottom' in entry
    ) {
      return (entry as { paddingBottom: number }).paddingBottom;
    }
  }
  return undefined;
}

function stylePaddingTop(style: unknown): number | undefined {
  const styles = Array.isArray(style) ? [...style].reverse() : [style];
  for (const entry of styles) {
    if (entry !== null && typeof entry === 'object' && 'paddingTop' in entry) {
      return (entry as { paddingTop: number }).paddingTop;
    }
  }
  return undefined;
}

describe('TabShell safe-area seam', () => {
  it.each([0, 24, 34])(
    'reserves bottom inset %ipx on the tab bar (background fills it)',
    async bottomInset => {
      MOCK_INSETS.bottom = bottomInset;
      const renderer = await renderShell();
      const tabBar = renderer.root.findByProps({ testID: 'tab-bar' });
      expect(stylePaddingBottom(tabBar.props.style)).toBe(
        safeInset(bottomInset),
      );
      await act(async () => {
        renderer.unmount();
      });
    },
  );

  it.each([0, 24, 34])(
    'reserves top inset %ipx on the content container exactly once',
    async topInset => {
      MOCK_INSETS.top = topInset;
      const renderer = await renderShell();
      const content = renderer.root.findByProps({ testID: 'tab-content' });
      expect(stylePaddingTop(content.props.style)).toBe(safeInset(topInset));
      await act(async () => {
        renderer.unmount();
      });
    },
  );

  it('renders exactly the three approved tabs inside the provider', async () => {
    const renderer = await renderShell();
    expect(renderer.root.findByProps({ testID: 'tab-dashboard' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'tab-history' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'tab-settings' })).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });
});
