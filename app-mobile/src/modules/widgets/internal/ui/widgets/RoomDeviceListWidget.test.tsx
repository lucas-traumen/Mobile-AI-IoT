/**
 * RoomDeviceListWidget icon accent tests (Qwen blocker 2).
 *
 * The device icon color must go through the SAME `resolveCapabilityAccent`
 * contract as every other accent consumer: built-in temperature/humidity
 * follow the active theme tokens (light vs dark), custom capabilities use
 * their catalog color, and uncataloged capabilities fall back to the theme
 * primary. A planted catalog color on a built-in must never win.
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import TestRenderer, { act } from 'react-test-renderer';

import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import { Errors, err, ok } from '@core/errors';
import type {
  CapabilityDef,
  Device,
  Room,
  SeriesPoint,
} from '@modules/devices/api';
import { WidgetServicesProvider, type WidgetServices } from '../widgetContext';
import { RoomDeviceListWidget } from './RoomDeviceListWidget';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

/** Planted catalog colors must NOT override the themed built-ins. */
const CATALOG: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    unit: '°C',
    color: '#ff0000',
  },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', unit: '%' },
  { type: 'soil', label: 'Đất', kind: 'sensor', unit: '%', color: '#123456' },
];

const ROOMS: readonly Room[] = [
  { id: 'room-l', name: 'Phòng', order: 0, icon: 'home-outline' },
];

function makeDevice(capabilities: string[], id = 'dev-1'): Device {
  return {
    id,
    name: 'Thiết bị',
    roomId: 'room-l',
    type: 'sensor',
    capabilities,
    binding: { kind: 'telemetry-sensor' },
  };
}

/** Stable snapshot — `useSyncExternalStore` requires identity stability. */
const STABLE_STATE = { value: 24.5, updatedAt: 1000 };
const NO_SERIES: readonly SeriesPoint[] = [];

function makeServices(device: Device): WidgetServices {
  return {
    getState: () => STABLE_STATE,
    getSeries: () => NO_SERIES,
    sendCommand: () => err(Errors.unknown('not wired')),
    queryHistory: async () => ok([]),
    getRooms: () => ROOMS,
    getDevices: () => [device],
    getCapabilities: () => CATALOG,
    getActiveRoomId: () => 'room-l',
    subscribeDeviceState: () => () => undefined,
  };
}

function makeServicesForDevices(devices: readonly Device[]): WidgetServices {
  return { ...makeServices(devices[0]!), getDevices: () => devices };
}

/** All Ionicons accent colors rendered by the widget. */
async function renderedIconColors(
  mode: 'light' | 'dark',
  device: Device,
): Promise<string[]> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <WidgetServicesProvider services={makeServices(device)}>
          <RoomDeviceListWidget
            config={{
              id: 'w-1',
              type: 'room-device-list',
              layout: { x: 0, y: 0, width: 2, height: 2 },
            }}
          />
        </WidgetServicesProvider>
      </ThemeProvider>,
    );
  });
  const colors = renderer.root
    .findAllByType(Ionicons)
    .map(icon => icon.props.color as string);
  await act(async () => {
    renderer.unmount();
  });
  return colors;
}

describe('RoomDeviceListWidget icon accent (Qwen blocker 2)', () => {
  it('temperature icon follows the light token, not the catalog color', async () => {
    const colors = await renderedIconColors(
      'light',
      makeDevice(['temperature']),
    );
    expect(colors).toContain(LIGHT_TOKENS.temperature);
    expect(colors).not.toContain('#ff0000');
  });

  it('humidity icon follows the dark token', async () => {
    const colors = await renderedIconColors('dark', makeDevice(['humidity']));
    expect(colors).toContain(DARK_TOKENS.humidity);
  });

  it('custom capability icon uses its catalog color', async () => {
    const colors = await renderedIconColors('light', makeDevice(['soil']));
    expect(colors).toContain('#123456');
  });

  it('uncataloged capability icon falls back to the theme primary', async () => {
    const colors = await renderedIconColors('light', makeDevice(['ghost']));
    expect(colors).toContain(LIGHT_TOKENS.primary);
  });
});

describe('RoomDeviceListWidget bounded content (responsive dashboard)', () => {
  it('renders every device row inside a bounded scroll container (no clipping)', async () => {
    const devices = [
      makeDevice(['temperature'], 'dev-1'),
      makeDevice(['humidity'], 'dev-2'),
      makeDevice(['switch'], 'dev-3'),
      makeDevice(['switch'], 'dev-4'),
      makeDevice(['switch'], 'dev-5'),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <WidgetServicesProvider services={makeServicesForDevices(devices)}>
            <RoomDeviceListWidget
              config={{
                id: 'w-list',
                type: 'room-device-list',
                // 2x1 — the compact size that previously showed at most 3
                // static rows and silently dropped the rest.
                layout: { x: 0, y: 1, width: 2, height: 1 },
              }}
            />
          </WidgetServicesProvider>
        </ThemeProvider>,
      );
    });
    // One icon per device row: all five devices must exist in the tree
    // (reachable through the bounded scroll), none silently clipped.
    const icons = renderer.root.findAllByType(Ionicons);
    expect(icons).toHaveLength(devices.length);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows the empty state for a room without devices', async () => {
    const devices: Device[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <WidgetServicesProvider services={makeServicesForDevices(devices)}>
            <RoomDeviceListWidget
              config={{
                id: 'w-list',
                type: 'room-device-list',
                layout: { x: 0, y: 1, width: 2, height: 2 },
              }}
            />
          </WidgetServicesProvider>
        </ThemeProvider>,
      );
    });
    const texts: string[] = [];
    const walk = (node: TestRenderer.ReactTestInstance) => {
      if (typeof node.props.children === 'string') {
        texts.push(node.props.children);
      }
      for (const child of node.children) {
        if (typeof child !== 'object') {
          continue;
        }
        walk(child as TestRenderer.ReactTestInstance);
      }
    };
    walk(renderer.root);
    expect(texts.join('\n')).toContain(STRINGS.devices.noDevices);
    await act(async () => {
      renderer.unmount();
    });
  });
});
