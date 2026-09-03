/**
 * SwitchWidget tests (dashboard-glassmorphism-switch-fix → gel follow-up).
 *
 * Optimistic toggle: the rendered switch flips IMMEDIATELY on tap via a
 * local optimistic override — even while the relay is offline / before any
 * feedback arrives — instead of waiting on the committed store value. When
 * `sendCommand` fails, the override rolls back to the committed value and
 * the failure reason is shown inline. When the committed feedback catches up
 * with the override, the override is cleared so later external state changes
 * stay visible.
 *
 * Title fallback chain (M2 title fix): `config.title ?? bound device name ??
 * capability label ?? generic switch label` — seeded widgets carry no title,
 * so the bound DEVICE name ("Đèn"/"Quạt") must win over the capability label
 * ("Công tắc") without any data reset.
 *
 * Compact gel follow-up: the visible copy is the friendly title ONLY — the
 * bound device id (`relay-1`) and the `Đang bật`/`Đang tắt` captions are no
 * longer rendered. The ON/OFF state stays available to accessibility
 * services through the switch semantics (accessibility state/value), using
 * the existing `STRINGS.widgets.on/off` as the accessible value text.
 */

import React from 'react';
import { Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Ionicons } from '@expo/vector-icons';

import { LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import { Errors, err, ok, type AppError, type Result } from '@core/errors';
import type {
  CapabilityDef,
  Device,
  DeviceCapabilityValue,
  Room,
  SeriesPoint,
} from '@modules/devices/api';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { WidgetServicesProvider, type WidgetServices } from '../widgetContext';
import { SwitchWidget } from './SwitchWidget';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const CATALOG: readonly CapabilityDef[] = [
  { type: 'switch', label: 'Công tắc', kind: 'switch', icon: 'bulb-outline' },
];

const ROOMS: readonly Room[] = [
  { id: 'room-l', name: 'Phòng', order: 0, icon: 'home-outline' },
];

/** Seed-shaped relay devices (relay-1 = Đèn, relay-2 = Quạt). */
const DEVICES: readonly Device[] = [
  {
    id: 'relay-1',
    name: 'Đèn',
    roomId: 'room-l',
    type: 'relay',
    capabilities: ['switch'],
    binding: { kind: 'relay', index: 1 },
  },
  {
    id: 'relay-2',
    name: 'Quạt',
    roomId: 'room-l',
    type: 'relay',
    capabilities: ['switch'],
    binding: { kind: 'relay', index: 2 },
  },
];

const NO_SERIES: readonly SeriesPoint[] = [];

const CONFIG: WidgetConfig = {
  id: 'w-switch',
  type: 'switch',
  binding: { deviceId: 'relay-1', capability: 'switch' },
  layout: { x: 0, y: 0, width: 1, height: 1 },
};

/**
 * Controllable services: the committed value lives in a single stable
 * snapshot (`useSyncExternalStore` requires identity stability) and can be
 * driven by the test to simulate relay feedback / external changes.
 */
function makeControllableServices(options: {
  initial: boolean | undefined;
  sendResult: Result<void, AppError>;
  devices?: readonly Device[];
  capabilities?: readonly CapabilityDef[];
}): {
  services: WidgetServices;
  setCommitted: (next: boolean | undefined) => void;
} {
  let state: DeviceCapabilityValue | undefined =
    options.initial === undefined
      ? undefined
      : { value: options.initial, updatedAt: 1000 };
  const listeners = new Set<() => void>();
  const services: WidgetServices = {
    getState: () => state,
    getSeries: () => NO_SERIES,
    sendCommand: () => options.sendResult,
    queryHistory: async () => ok([]),
    getRooms: () => ROOMS,
    getDevices: () => options.devices ?? [],
    getCapabilities: () => options.capabilities ?? CATALOG,
    getActiveRoomId: () => 'room-l',
    subscribeDeviceState: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const setCommitted = (next: boolean | undefined) => {
    state = next === undefined ? undefined : { value: next, updatedAt: 2000 };
    for (const listener of listeners) {
      listener();
    }
  };
  return { services, setCommitted };
}

async function renderSwitch(services: WidgetServices) {
  return renderSwitchWith(CONFIG, services);
}

async function renderSwitchWith(
  config: WidgetConfig,
  services: WidgetServices,
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <WidgetServicesProvider services={services}>
          <SwitchWidget config={config} />
        </WidgetServicesProvider>
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** The value currently rendered on the RN switch. */
function renderedValue(renderer: TestRenderer.ReactTestRenderer): boolean {
  return renderer.root.findByType(Switch).props.value as boolean;
}

/** All text rendered by the widget (title + optional inline error). */
function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .filter((child): child is string => typeof child === 'string')
    .join('\n');
}

describe('SwitchWidget compact card anatomy (gel follow-up)', () => {
  it('renders the friendly title only — the bound device id is not visible', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    // Friendly device name stays; the technical relay id is gone.
    expect(renderedText(renderer)).toContain('Đèn');
    expect(renderedText(renderer)).not.toContain('relay-1');
    expect(renderedText(renderer)).not.toContain('relay-2');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders no visible Đang bật/Đang tắt caption in either state', async () => {
    const { services, setCommitted } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    // OFF: no status caption.
    expect(renderedText(renderer)).not.toContain(STRINGS.widgets.off);

    // Relay feedback arrives (ON): still no status caption.
    await act(async () => {
      setCommitted(true);
    });
    expect(renderedText(renderer)).not.toContain(STRINGS.widgets.on);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('exposes ON/OFF through the switch accessibility state and value', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    const switchProps = () => renderer.root.findByType(Switch).props;
    // The accessible name is the friendly title; the ON/OFF state rides the
    // switch semantics (checked) + accessible value text (the kept
    // STRINGS.widgets.on/off) — never redundant visual copy.
    expect(switchProps().accessibilityLabel).toBe('Đèn');
    expect(switchProps().accessibilityState).toEqual({ checked: false });
    expect(switchProps().accessibilityValue).toEqual({
      text: STRINGS.widgets.off,
    });

    // Optimistic flip: accessibility state follows the rendered value
    // immediately (before any relay feedback).
    await act(async () => {
      switchProps().onValueChange(true);
    });
    expect(switchProps().accessibilityState).toEqual({ checked: true });
    expect(switchProps().accessibilityValue).toEqual({
      text: STRINGS.widgets.on,
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('uses the success track for ON and the neutral off token for OFF', async () => {
    const { services, setCommitted } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    expect(renderer.root.findByType(Switch).props.trackColor).toEqual({
      false: LIGHT_TOKENS.off,
      true: LIGHT_TOKENS.success,
    });

    await act(async () => {
      setCommitted(true);
    });
    expect(renderer.root.findByType(Switch).props.trackColor).toEqual({
      false: LIGHT_TOKENS.off,
      true: LIGHT_TOKENS.success,
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders the relay icon glyph neutral while OFF and success green while ON', async () => {
    const { services, setCommitted } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    // The built-in switch capability carries NO explicit color → the glyph
    // must follow the state-aware semantic rule (NOT the brand blue).
    const glyphColor = () =>
      renderer.root.findAllByType(Ionicons)[0].props.color as string;
    expect(glyphColor()).toBe(LIGHT_TOKENS.off);

    // Relay feedback arrives → the glyph turns the active/success color.
    await act(async () => {
      setCommitted(true);
    });
    expect(glyphColor()).toBe(LIGHT_TOKENS.success);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('flips the icon glyph color immediately with the optimistic override', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    const glyphColor = () =>
      renderer.root.findAllByType(Ionicons)[0].props.color as string;
    expect(glyphColor()).toBe(LIGHT_TOKENS.off);

    await act(async () => {
      renderer.root.findByType(Switch).props.onValueChange(true);
    });
    // Optimistic: the glyph shows the active color before any feedback.
    expect(glyphColor()).toBe(LIGHT_TOKENS.success);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('preserves an explicit capability color for the icon glyph (both states)', async () => {
    // A user-defined catalog color is an intentional per-capability
    // contract — it must win over the state-aware semantic fallback in BOTH
    // states (same precedence as resolveCapabilityAccent).
    const coloredCatalog: readonly CapabilityDef[] = [
      {
        type: 'switch',
        label: 'Công tắc',
        kind: 'switch',
        icon: 'bulb-outline',
        color: '#123456',
      },
    ];
    const { services, setCommitted } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
      capabilities: coloredCatalog,
    });
    const renderer = await renderSwitch(services);
    const glyphColor = () =>
      renderer.root.findAllByType(Ionicons)[0].props.color as string;
    expect(glyphColor()).toBe('#123456');

    await act(async () => {
      setCommitted(true);
    });
    expect(glyphColor()).toBe('#123456');
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SwitchWidget optimistic toggle', () => {
  it('flips immediately on tap even while offline (no feedback yet)', async () => {
    // Offline flavor: no committed state at all (device never reported) and
    // the command is accepted for delivery — the switch must still flip.
    const { services } = makeControllableServices({
      initial: undefined,
      sendResult: ok(undefined),
    });
    const renderer = await renderSwitch(services);
    expect(renderedValue(renderer)).toBe(false);

    await act(async () => {
      renderer.root.findByType(Switch).props.onValueChange(true);
    });
    // The optimistic override flipped the switch with NO state change.
    expect(renderedValue(renderer)).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('rolls the override back and shows the inline error when sendCommand fails', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: err(Errors.network('MQTT chưa kết nối')),
    });
    const renderer = await renderSwitch(services);
    expect(renderedValue(renderer)).toBe(false);

    await act(async () => {
      renderer.root.findByType(Switch).props.onValueChange(true);
    });
    // Rolled back to the committed value (no stuck optimistic flip)...
    expect(renderedValue(renderer)).toBe(false);
    // ...and the failure reason is shown inline.
    expect(renderedText(renderer)).toContain('MQTT chưa kết nối');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('clears the override once the committed feedback matches', async () => {
    const { services, setCommitted } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
    });
    const renderer = await renderSwitch(services);
    expect(renderedValue(renderer)).toBe(false);

    await act(async () => {
      renderer.root.findByType(Switch).props.onValueChange(true);
    });
    expect(renderedValue(renderer)).toBe(true);

    // Relay feedback arrives: committed === override → override cleared.
    await act(async () => {
      setCommitted(true);
    });
    expect(renderedValue(renderer)).toBe(true);

    // A later EXTERNAL change (feedback back to false) must be visible —
    // proof the override no longer masks the committed value.
    await act(async () => {
      setCommitted(false);
    });
    expect(renderedValue(renderer)).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SwitchWidget title fallback (M2 title fix)', () => {
  it('shows the bound DEVICE name for a title-less seeded widget', async () => {
    // Seed shape: no config.title → the device name (relay-1 = "Đèn") must
    // win over the capability label ("Công tắc") — no data reset needed.
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitch(services);
    expect(renderedText(renderer)).toContain('Đèn');
    expect(renderedText(renderer)).not.toContain('Công tắc');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('resolves the device name per binding (relay-2 = "Quạt")', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitchWith(
      { ...CONFIG, binding: { deviceId: 'relay-2', capability: 'switch' } },
      services,
    );
    expect(renderedText(renderer)).toContain('Quạt');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('prefers config.title over the device name', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: DEVICES,
    });
    const renderer = await renderSwitchWith(
      { ...CONFIG, title: 'Đèn phòng khách' },
      services,
    );
    expect(renderedText(renderer)).toContain('Đèn phòng khách');
    expect(renderedText(renderer)).not.toContain('Công tắc');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('falls back to the capability label when the device is unknown', async () => {
    const { services } = makeControllableServices({
      initial: false,
      sendResult: ok(undefined),
      devices: [], // binding points at a device no longer registered
    });
    const renderer = await renderSwitch(services);
    expect(renderedText(renderer)).toContain('Công tắc');

    await act(async () => {
      renderer.unmount();
    });
  });
});
