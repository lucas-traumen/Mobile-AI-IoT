/**
 * DashboardScreen section-label + background tests (M2 pastel upgrade).
 *
 * Verifies:
 * - the "Thiết bị" section label renders when a switch widget is visible
 *   (default seed), same style slot as "Môi trường",
 * - the "Môi trường" label still renders when a sensor-value widget is
 *   visible,
 * - the header clock is GONE: no `dashboard-clock` testID anywhere,
 * - the screen container is a `LinearGradient` whose colors come from the
 *   ACTIVE theme tokens (no hard-coded hex in the component).
 */

import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';

import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import type { CapabilityDef, Room } from '@modules/devices/api';
import type { SeriesPoint } from '@modules/devices/api';
import { createDefaultRegistry } from '@modules/widgets/api';
import type { WidgetServices } from '@modules/widgets/api';
import { Errors, err, ok } from '@core/errors';

import { defaultDashboardsFile } from '../internal/domain/seeds';
import { DashboardScreen } from './DashboardScreen';

// The widgets facade transitively requires AsyncStorage (devices api).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const ROOMS: readonly Room[] = [
  { id: 'room-living', name: 'Phòng khách', order: 0, icon: 'home-outline' },
];

const CATALOG: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor', unit: '°C' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', unit: '%' },
  { type: 'switch', label: 'Công tắc', kind: 'switch' },
];

/** Stable snapshot — `useSyncExternalStore` requires identity stability. */
const STABLE_STATE = { value: 24.5, updatedAt: 1000 };
const NO_SERIES: readonly SeriesPoint[] = [];

function makeServices(): WidgetServices {
  return {
    getState: () => STABLE_STATE,
    getSeries: () => NO_SERIES,
    sendCommand: () => err(Errors.unknown('not wired')),
    queryHistory: async () => ok([]),
    getRooms: () => ROOMS,
    getDevices: () => [],
    getCapabilities: () => CATALOG,
    getActiveRoomId: () => 'room-living',
    subscribeDeviceState: () => () => undefined,
  };
}

/** Render the screen with the default seed dashboard and active room. */
function renderScreen(mode: 'light' | 'dark'): TestRenderer.ReactTestRenderer {
  const file = defaultDashboardsFile();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <DashboardScreen
          dashboards={file.dashboards}
          activeId={file.activeId}
          activeRoomId="room-living"
          connection={{ state: 'connected', label: 'MQTT Online' }}
          onSelectRoom={() => undefined}
          rooms={ROOMS}
          registry={createDefaultRegistry()}
          services={makeServices()}
        />
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** Deep-collect the text strings rendered under a node (RN nests Texts). */
function textOf(node: ReactTestInstance): string {
  return node.children
    .map(child =>
      typeof child === 'string' ? child : textOf(child as ReactTestInstance),
    )
    .join('');
}

function allText(renderer: TestRenderer.ReactTestRenderer): string {
  return textOf(renderer.root);
}

describe('DashboardScreen (M2 pastel upgrade)', () => {
  it('renders the "Thiết bị" section label when a switch widget is visible', async () => {
    const renderer = renderScreen('light');
    expect(allText(renderer)).toContain(STRINGS.dashboard.devices);
    expect(allText(renderer)).toContain(STRINGS.dashboard.environment);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders no dashboard-clock testID (clock removed)', async () => {
    const renderer = renderScreen('light');
    expect(
      renderer.root.findAllByProps({ testID: 'dashboard-clock' }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('wraps the screen in a LinearGradient colored from the theme tokens', async () => {
    const light = renderScreen('light');
    const lightGradient = light.root.findByType(LinearGradient);
    expect(lightGradient.props.colors).toEqual(LIGHT_TOKENS.gradient);
    await act(async () => {
      light.unmount();
    });

    const dark = renderScreen('dark');
    const darkGradient = dark.root.findByType(LinearGradient);
    expect(darkGradient.props.colors).toEqual(DARK_TOKENS.gradient);
    await act(async () => {
      dark.unmount();
    });
  });
});
