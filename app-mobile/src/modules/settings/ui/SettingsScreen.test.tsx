/**
 * SettingsScreen (root) tests — summary/navigation contract (approved
 * settings-information-architecture plan):
 * - exactly two explicit theme choices (Sáng/Tối) — no `Hệ thống`;
 * - NO permanent MQTT/Influx status cards and NO combined check button;
 * - a concise, actionable warning row appears ONLY for a confirmed MQTT
 *   failure and links to the advanced screen;
 * - navigation rows expose devices / dashboard editor / advanced.
 */

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';

import { SettingsScreen } from './SettingsScreen';

/** Renderers still mounted (unmounted in afterEach — teardown hygiene). */
const openRenderers: TestRenderer.ReactTestRenderer[] = [];

function makeScreen(props: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <SettingsScreen
          settings={{ theme: 'light' }}
          onUpdateUi={props.onUpdateUi}
          onOpenDeviceManagement={
            props.onOpenDeviceManagement ?? (() => undefined)
          }
          onOpenDashboardEditor={
            props.onOpenDashboardEditor ?? (() => undefined)
          }
          onOpenAdvanced={props.onOpenAdvanced ?? (() => undefined)}
          demoHistory={props.demoHistory}
          onToggleDemoHistory={props.onToggleDemoHistory}
          connectionState={props.connectionState}
          lastErrorCode={props.lastErrorCode ?? null}
        />
      </ThemeProvider>,
    );
  });
  openRenderers.push(renderer);
  return renderer;
}

/** Unmount every renderer created by the suite (teardown hygiene). */
afterEach(() => {
  for (const renderer of openRenderers) {
    act(() => {
      renderer.unmount();
    });
  }
  openRenderers.length = 0;
});

/** All visible text of the renderer (flattening nested Text children). */
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
  return texts.join('\n');
}

describe('SettingsScreen root (summary/navigation)', () => {
  it('renders exactly two theme buttons (light/dark) — no system choice', () => {
    const renderer = makeScreen();
    expect(
      renderer.root.findByProps({ testID: 'settings-theme-light' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-theme-dark' }),
    ).toBeTruthy();
    const text = visibleText(renderer);
    expect(text).toContain(STRINGS.settings.light);
    expect(text).toContain(STRINGS.settings.dark);
    // The removed `Hệ thống` option must never appear at the root.
    expect(text).not.toContain('Hệ thống');
  });

  it('applies the theme immediately via onUpdateUi (no save step)', async () => {
    const onUpdateUi = jest.fn();
    const renderer = makeScreen({ onUpdateUi });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-theme-dark' })
        .props.onPress();
    });
    expect(onUpdateUi).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('shows navigation rows for devices, dashboard editor and the advanced screen', () => {
    const renderer = makeScreen();
    expect(
      renderer.root.findByProps({ testID: 'settings-open-devices' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-open-editor' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-open-advanced' }),
    ).toBeTruthy();
  });

  it('shows NO connection status cards and NO combined check button in the healthy state', () => {
    const renderer = makeScreen({ connectionState: 'connected' });
    expect(
      renderer.root.findAllByProps({ testID: 'settings-connection-warning' })
        .length,
    ).toBe(0);
    expect(visibleText(renderer)).not.toContain(
      STRINGS.settings.checkConnection,
    );
  });

  it('shows a concise failure-only warning row linking to the advanced screen', async () => {
    const onOpenAdvanced = jest.fn();
    const renderer = makeScreen({
      connectionState: 'failed',
      lastErrorCode: 'timeout',
      onOpenAdvanced,
    });
    // No combined check action exists at the root (approval contract).
    expect(visibleText(renderer)).not.toContain(
      STRINGS.settings.checkConnection,
    );
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-connection-warning' })
        .props.onPress();
    });
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });

  it('keeps the demo-history toggle as an in-memory row (not persisted)', () => {
    const onToggleDemoHistory = jest.fn();
    const renderer = makeScreen({ onToggleDemoHistory, demoHistory: false });
    expect(
      renderer.root.findByProps({ testID: 'settings-demo-history' }),
    ).toBeTruthy();
  });
});
