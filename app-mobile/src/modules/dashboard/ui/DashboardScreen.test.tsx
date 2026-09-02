/**
 * DashboardScreen section tests (M2 pastel upgrade → glassmorphism pass →
 * M2 label fix).
 *
 * Verifies:
 * - SECTION STRUCTURE (label fix): the visible widgets are split into a
 *   "Môi trường" section (sensor-value + history-chart) and a "Thiết bị"
 *   section (switch + others); each non-empty section renders its pill label
 *   DIRECTLY above its OWN DashboardGrid — the env pill precedes the sensor
 *   grid and the devices pill sits between the two grids,
 * - each section grid receives its group's rebase row (`layoutYOffset`) so
 *   persisted absolute coords render compactly (devices seeded at row 1 →
 *   offset 1, sensors at row 0 → offset 0),
 * - sections are CONDITIONAL: a sensor-only dashboard renders no "Thiết bị"
 *   pill and a switch-only one renders no "Môi trường" pill,
 * - section labels are GEL PILLS colored from the ACTIVE theme tokens
 *   (`pillEnvironment*` teal / `pillDevices*` peach, `borderRadius: 999`),
 * - the header clock is GONE: no `dashboard-clock` testID anywhere,
 * - the screen container is a `LinearGradient` whose colors come from the
 *   ACTIVE theme tokens (no hard-coded hex in the component).
 */

import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';

import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import type { CapabilityDef, Room } from '@modules/devices/api';
import type { SeriesPoint } from '@modules/devices/api';
import { createDefaultRegistry, type WidgetConfig } from '@modules/widgets/api';
import type { WidgetServices } from '@modules/widgets/api';
import type { DashboardsFile } from '@modules/dashboard/api';
import { Errors, err, ok } from '@core/errors';

import { defaultDashboardsFile } from '../internal/domain/seeds';
import { DashboardGrid } from './DashboardGrid';
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

/** Render the screen with an explicit dashboards file (section shapes). */
function renderFile(
  file: DashboardsFile,
  mode: 'light' | 'dark' = 'light',
): TestRenderer.ReactTestRenderer {
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

/** Minimal widget builder for explicit section-shape dashboards. */
function seedWidget(
  id: string,
  type: 'sensor-value' | 'history-chart' | 'switch',
  deviceId: string,
  capability: string,
  y: number,
): WidgetConfig {
  return {
    id,
    type,
    roomId: 'room-living',
    binding: { deviceId, capability },
    layout: { x: 0, y, width: 1, height: 1 },
  };
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

/** True when some View carries the given style property value (flat/array). */
function hasViewStyle(
  root: ReactTestInstance,
  key: 'backgroundColor' | 'borderColor' | 'borderRadius',
  expected: unknown,
): boolean {
  return root.findAllByType(View).some(view => {
    const style = view.props.style;
    const layers = Array.isArray(style) ? style : [style];
    return layers.some(
      layer =>
        layer !== null &&
        typeof layer === 'object' &&
        (layer as Record<string, unknown>)[key] === expected,
    );
  });
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

  it('renders the section labels as gel pills colored from the theme tokens', async () => {
    const light = renderScreen('light');
    expect(
      hasViewStyle(
        light.root,
        'backgroundColor',
        LIGHT_TOKENS.pillEnvironmentBg,
      ),
    ).toBe(true);
    expect(
      hasViewStyle(
        light.root,
        'borderColor',
        LIGHT_TOKENS.pillEnvironmentBorder,
      ),
    ).toBe(true);
    expect(
      hasViewStyle(light.root, 'backgroundColor', LIGHT_TOKENS.pillDevicesBg),
    ).toBe(true);
    expect(
      hasViewStyle(light.root, 'borderColor', LIGHT_TOKENS.pillDevicesBorder),
    ).toBe(true);
    expect(hasViewStyle(light.root, 'borderRadius', 999)).toBe(true);
    await act(async () => {
      light.unmount();
    });

    const dark = renderScreen('dark');
    expect(
      hasViewStyle(dark.root, 'backgroundColor', DARK_TOKENS.pillDevicesBg),
    ).toBe(true);
    await act(async () => {
      dark.unmount();
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

  it('renders each section pill DIRECTLY above its own grid (label fix)', async () => {
    const renderer = renderScreen('light');

    // Pre-order traversal = document render order (fragments flatten).
    const ordered: ReactTestInstance[] = [];
    const visit = (node: ReactTestInstance) => {
      ordered.push(node);
      for (const child of node.children) {
        if (typeof child !== 'string') {
          visit(child as ReactTestInstance);
        }
      }
    };
    visit(renderer.root);

    // Locate the pill label Text NODES by their exact string children, then
    // use node identity inside the pre-order list (no type-string equality).
    const pillNode = (label: string) => {
      const nodes = renderer.root
        .findAllByType(Text)
        .filter(n => n.props.children === label);
      expect(nodes.length).toBeGreaterThan(0);
      return nodes[0];
    };
    const envPill = ordered.indexOf(pillNode(STRINGS.dashboard.environment));
    const devicesPill = ordered.indexOf(pillNode(STRINGS.dashboard.devices));
    const grids = ordered.filter(n => n.type === DashboardGrid);

    expect(grids).toHaveLength(2);
    const envGrid = ordered.indexOf(grids[0]);
    const devicesGrid = ordered.indexOf(grids[1]);

    // "Môi trường" pill → sensor grid → "Thiết bị" pill → switch grid.
    expect(envPill).toBeGreaterThanOrEqual(0);
    expect(devicesPill).toBeGreaterThanOrEqual(0);
    expect(envPill).toBeLessThan(envGrid);
    expect(devicesPill).toBeGreaterThan(envGrid);
    expect(devicesPill).toBeLessThan(devicesGrid);

    // The sensor grid carries exactly the environment widgets, the switch
    // grid exactly the device widgets.
    const ids = (grid: ReactTestInstance) =>
      (grid.props.widgets as readonly WidgetConfig[]).map(w => w.id);
    expect(ids(grids[0])).toEqual(['w-temp', 'w-hum']);
    expect(ids(grids[1])).toEqual(['w-light', 'w-fan']);

    // Rebase rows: sensors seeded at row 0 → offset 0; switches seeded at
    // rows 1..2 → offset 1 (persisted coords stay dashboard-absolute).
    expect(grids[0].props.layoutYOffset).toBe(0);
    expect(grids[1].props.layoutYOffset).toBe(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('hides the devices section when only sensor cards are visible', async () => {
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            seedWidget('w-temp', 'sensor-value', 'sensor-01', 'temperature', 0),
            seedWidget('w-hum', 'sensor-value', 'sensor-01', 'humidity', 1),
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    const renderer = renderFile(file);

    const texts = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(texts).toContain(STRINGS.dashboard.environment);
    expect(texts).not.toContain(STRINGS.dashboard.devices);
    expect(renderer.root.findAllByType(DashboardGrid)).toHaveLength(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('hides the environment section when only switch cards are visible', async () => {
    const file: DashboardsFile = {
      dashboards: [
        {
          id: 'main',
          name: 'Trang chủ',
          widgets: [
            seedWidget('w-light', 'switch', 'relay-1', 'switch', 0),
            seedWidget('w-fan', 'switch', 'relay-2', 'switch', 1),
          ],
        },
      ],
      activeId: 'main',
      activeRoomId: null,
    };
    const renderer = renderFile(file);

    const texts = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(texts).toContain(STRINGS.dashboard.devices);
    expect(texts).not.toContain(STRINGS.dashboard.environment);
    expect(renderer.root.findAllByType(DashboardGrid)).toHaveLength(1);

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
