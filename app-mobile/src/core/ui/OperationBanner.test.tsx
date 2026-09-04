/**
 * OperationBanner tests — the single top-center feedback seam for nested
 * screens: renders the typed severity/message, auto-hides after
 * `AUTO_HIDE_MS`, and cancels its timer on unmount (timer-lifecycle safe —
 * no post-teardown state updates, fix cycle 1).
 */

import React from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';

import {
  AUTO_HIDE_MS,
  OperationBanner,
  useOperationFeedback,
} from './OperationBanner';

/** Harness exposing the state helper's actions to the test. */
function BannerHarness() {
  const { feedback, show, clear } = useOperationFeedback();
  return (
    <ThemeProvider mode="light">
      {/* The banner gets its default internal testID — the caller does not
          pass one, so the rendered host View is the only match. */}
      <OperationBanner feedback={feedback} onDismiss={clear} />
      <Pressable
        testID="show-error"
        onPress={() => show({ severity: 'error', message: 'Xóa thất bại' })}
      />
      <Pressable
        testID="show-success"
        onPress={() => show({ severity: 'success', message: 'Đã lưu bố cục' })}
      />
      <Pressable testID="clear" onPress={clear} />
    </ThemeProvider>
  );
}

/** All visible text of the renderer. */
function visibleText(renderer: TestRenderer.ReactTestRenderer): string {
  const texts: string[] = [];
  const walk = (node: { props?: { children?: unknown } }) => {
    const children = node.props?.children;
    if (typeof children === 'string') {
      texts.push(children);
    } else if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'string') {
          texts.push(child);
        } else if (child && typeof child === 'object') {
          walk(child as { props?: { children?: unknown } });
        }
      }
    } else if (children && typeof children === 'object') {
      walk(children as { props?: { children?: unknown } });
    }
  };
  for (const textNode of renderer.root.findAllByType(Text)) {
    walk(textNode as never);
  }
  return texts.join('');
}

describe('OperationBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the feedback message and hides when cleared', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BannerHarness />);
    });
    // No feedback → banner hidden.
    expect(
      renderer.root.findAllByProps({ testID: 'operation-banner' }).length,
    ).toBe(0);

    await act(async () => {
      renderer.root.findByProps({ testID: 'show-error' }).props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'operation-banner' }),
    ).toBeTruthy();

    await act(async () => {
      renderer.root.findByProps({ testID: 'show-success' }).props.onPress();
    });
    expect(visibleText(renderer)).toContain('Đã lưu bố cục');

    await act(async () => {
      renderer.root.findByProps({ testID: 'clear' }).props.onPress();
    });
    expect(
      renderer.root.findAllByProps({ testID: 'operation-banner' }).length,
    ).toBe(0);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('auto-hides after AUTO_HIDE_MS with no pending timer left behind', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BannerHarness />);
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'show-error' }).props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'operation-banner' }),
    ).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(AUTO_HIDE_MS);
    });
    // Hidden again exactly when the window elapses.
    expect(
      renderer.root.findAllByProps({ testID: 'operation-banner' }).length,
    ).toBe(0);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('cancels the auto-hide timer on unmount (no post-teardown updates)', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BannerHarness />);
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'show-error' }).props.onPress();
    });

    const clearSpy = jest.spyOn(global, 'clearTimeout');
    await act(async () => {
      renderer.unmount();
    });
    // The unmount cleanup cleared the pending auto-hide timer…
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();

    // …so firing every remaining timer is a safe no-op (the banner is gone
    // and no delayed state update exists to run).
    await act(async () => {
      jest.runAllTimers();
    });
  });
});
