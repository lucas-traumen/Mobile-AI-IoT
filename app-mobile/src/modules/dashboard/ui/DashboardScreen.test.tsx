/**
 * DashboardScreen tests (approved Light/Dark responsive redesign → gel
 * palette follow-up).
 *
 * Verifies:
 * - SECTION STRUCTURE: the visible widgets are split into a "Môi trường"
 *   section (sensor-value + history-chart) and a "Thiết bị" section (switch
 *   + others); each non-empty section renders its rectangular label DIRECTLY
 *   above its OWN DashboardGrid — the env label precedes the sensor grid and
 *   the devices label sits between the two grids,
 * - each section grid receives its group's rebase row (`layoutYOffset`) in
 *   the wide/absolute presentation so persisted absolute coords render
 *   compactly (devices seeded at row 1 → offset 1, sensors at row 0 → 0),
 * - sections are CONDITIONAL: a sensor-only dashboard renders no "Thiết bị"
 *   label and a switch-only one renders no "Môi trường" label,
 * - GEL PALETTE (screenshot 1 follow-up): the screen IS the active-theme
 *   gradient (`tokens.gradient`, the History palette source) — no plain
 *   page background and no dominant white inset `surfaceDashboard` panel;
 *   header, badge, room strip, labels, cards and empty states render
 *   directly on the gradient,
 * - section labels are RECTANGULAR gel chips (borderRadius 9 on the
 *   translucent `chipActiveBg` tint) and the MQTT badge is a translucent
 *   glass chip,
 * - the section grids OPT INTO the gel card appearance (`cardAppearance:
 *   "gel"`) in both wide/absolute and narrow/stacked presentations,
 * - RESPONSIVE presentation: the measured/fallback canvas width selects the
 *   mode — wide canvas (>= 560) → absolute two-column grids; narrow canvas
 *   (< 560) → stacked one-card-per-row grids (presentation-only),
 * - the header badge colors are the live connection state (success green
 *   when connected).
 */

import React from 'react';
import { Dimensions, Text, View } from 'react-native';
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

/**
 * The window-width seam: `useWindowDimensions` is the documented pre-layout
 * fallback, so tests control the presentation mode through it (TestRenderer
 * never fires `onLayout`).
 */
let windowWidth = 800;

beforeAll(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation(() => ({
    width: windowWidth,
    height: 900,
    scale: 1,
    fontScale: 1,
  }));
});

afterAll(() => {
  (Dimensions.get as jest.Mock).mockRestore();
});

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

describe('DashboardScreen (approved Light/Dark redesign)', () => {
  beforeEach(() => {
    windowWidth = 800; // wide canvas → absolute presentation by default
  });

  it('renders the "Môi trường" and "Thiết bị" section labels with the seed', async () => {
    const renderer = renderScreen('light');
    expect(allText(renderer)).toContain(STRINGS.dashboard.devices);
    expect(allText(renderer)).toContain(STRINGS.dashboard.environment);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders each section label DIRECTLY above its own grid (order fix)', async () => {
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

    const labelNode = (label: string) => {
      const nodes = renderer.root
        .findAllByType(Text)
        .filter(n => n.props.children === label);
      expect(nodes.length).toBeGreaterThan(0);
      return nodes[0];
    };
    const envLabel = ordered.indexOf(labelNode(STRINGS.dashboard.environment));
    const devicesLabel = ordered.indexOf(labelNode(STRINGS.dashboard.devices));
    const grids = ordered.filter(n => n.type === DashboardGrid);

    expect(grids).toHaveLength(2);
    const envGrid = ordered.indexOf(grids[0]);
    const devicesGrid = ordered.indexOf(grids[1]);

    // "Môi trường" label → sensor grid → "Thiết bị" label → switch grid.
    expect(envLabel).toBeGreaterThanOrEqual(0);
    expect(devicesLabel).toBeGreaterThanOrEqual(0);
    expect(envLabel).toBeLessThan(envGrid);
    expect(devicesLabel).toBeGreaterThan(envGrid);
    expect(devicesLabel).toBeLessThan(devicesGrid);

    // The sensor grid carries exactly the environment widgets, the switch
    // grid exactly the device widgets.
    const ids = (grid: ReactTestInstance) =>
      (grid.props.widgets as readonly WidgetConfig[]).map(w => w.id);
    expect(ids(grids[0])).toEqual(['w-temp', 'w-hum']);
    expect(ids(grids[1])).toEqual(['w-light', 'w-fan']);

    // Rebase rows (absolute mode): sensors seeded at row 0 → offset 0;
    // switches seeded at row 1 → offset 1 (coords stay dashboard-absolute).
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

  it('renders the active-theme gel gradient with NO neutral panel/surface', async () => {
    const light = renderScreen('light');
    const lightGradients = light.root.findAllByType(LinearGradient);
    expect(lightGradients).toHaveLength(1);
    expect(lightGradients[0].props.colors).toEqual(LIGHT_TOKENS.gradient);
    // The dominant white inset panel is gone. NOTE: the panel check cannot
    // compare `surfaceDashboard` by color string in Light (both
    // `surfaceDashboard` and `surface` are '#ffffff', and RoomSelector's
    // expand button legitimately paints `surface`), so it asserts the
    // panel's unique geometry signature instead — the only view that ever
    // carried borderRadius 18 on this screen was the removed panel.
    expect(hasViewStyle(light.root, 'borderRadius', 18)).toBe(false);
    await act(async () => {
      light.unmount();
    });

    const dark = renderScreen('dark');
    const darkGradients = dark.root.findAllByType(LinearGradient);
    expect(darkGradients).toHaveLength(1);
    expect(darkGradients[0].props.colors).toEqual(DARK_TOKENS.gradient);
    expect(hasViewStyle(dark.root, 'borderRadius', 18)).toBe(false);
    await act(async () => {
      dark.unmount();
    });
  });

  it('renders gel section labels (translucent tint) directly on the gradient', async () => {
    const light = renderScreen('light');
    expect(hasViewStyle(light.root, 'borderRadius', 9)).toBe(true);
    // Gel chip tint (the History range-chip family) instead of the opaque
    // elevated tab surface.
    expect(
      hasViewStyle(light.root, 'backgroundColor', LIGHT_TOKENS.chipActiveBg),
    ).toBe(true);
    await act(async () => {
      light.unmount();
    });

    const dark = renderScreen('dark');
    expect(
      hasViewStyle(dark.root, 'backgroundColor', DARK_TOKENS.chipActiveBg),
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

  it('colors the MQTT badge from the live connection state (green = online)', async () => {
    const renderer = renderScreen('light');
    expect(allText(renderer)).toContain(STRINGS.dashboard.mqttOnline);
    expect(
      hasViewStyle(renderer.root, 'backgroundColor', LIGHT_TOKENS.success),
    ).toBe(true);
    // The badge sits directly on the gradient as a translucent glass chip.
    expect(
      hasViewStyle(renderer.root, 'backgroundColor', LIGHT_TOKENS.surfaceGlass),
    ).toBe(true);
    await act(async () => {
      renderer.unmount();
    });
  });

  describe('responsive presentation selection', () => {
    it('uses the absolute two-column grids on a wide canvas', async () => {
      windowWidth = 800;
      const renderer = renderScreen('light');
      const grids = renderer.root.findAllByType(DashboardGrid);
      expect(grids).toHaveLength(2);
      for (const grid of grids) {
        expect(grid.props.presentation).toBe('absolute');
      }
      await act(async () => {
        renderer.unmount();
      });
    });

    it('stacks the grids on a narrow canvas (presentation-only)', async () => {
      windowWidth = 320;
      const renderer = renderScreen('light');
      const grids = renderer.root.findAllByType(DashboardGrid);
      expect(grids).toHaveLength(2);
      for (const grid of grids) {
        expect(grid.props.presentation).toBe('stacked');
      }
      // Section order is preserved in stacked mode too.
      const ids = (grid: ReactTestInstance) =>
        (grid.props.widgets as readonly WidgetConfig[]).map(w => w.id);
      expect(ids(grids[0])).toEqual(['w-temp', 'w-hum']);
      expect(ids(grids[1])).toEqual(['w-light', 'w-fan']);
      await act(async () => {
        renderer.unmount();
      });
    });
  });

  describe('gel card appearance opt-in (screenshot 1 follow-up)', () => {
    it('opts BOTH section grids into the gel card appearance (wide + stacked)', async () => {
      windowWidth = 800;
      const wide = renderScreen('light');
      const wideGrids = wide.root.findAllByType(DashboardGrid);
      expect(wideGrids).toHaveLength(2);
      for (const grid of wideGrids) {
        expect(grid.props.cardAppearance).toBe('gel');
      }
      await act(async () => {
        wide.unmount();
      });

      windowWidth = 320;
      const narrow = renderScreen('light');
      const narrowGrids = narrow.root.findAllByType(DashboardGrid);
      expect(narrowGrids).toHaveLength(2);
      for (const grid of narrowGrids) {
        expect(grid.props.cardAppearance).toBe('gel');
      }
      await act(async () => {
        narrow.unmount();
      });
    });
  });
});
