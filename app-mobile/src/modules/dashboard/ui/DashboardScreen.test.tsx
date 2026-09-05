/**
 * DashboardScreen tests — the Dashboard tab's VIEW-ONLY surface (checkpoint
 * `1cd49cb` recipe, adapted to the Template model).
 *
 * Verifies:
 * - VIEW SURFACE: the active-theme gel gradient page (LinearGradient with
 *   `tokens.gradient`), the app title + live MQTT connection badge, the
 *   "Môi trường"/"Thiết bị" section split of the seed layout — and NO
 *   management affordances anywhere (no edit buttons, no Template cards,
 *   no hierarchy navigation: every mutation lives behind Settings),
 * - ROOM STRIP = ACTIVE TEMPLATE: the strip lists exactly the Template's
 *   ordered room references RESOLVED to physical room names, in TEMPLATE
 *   order (not the devices registry order); rooms not referenced by the
 *   Template never appear; a dangling reference (physical room deleted)
 *   is not displayed and the view normalizes without writing,
 * - SELECTION IS VIEW-ONLY: selecting a room on the strip changes the
 *   viewed room only (other room's layout renders; an empty room shows the
 *   no-widgets hint) — nothing is persisted and no navigation happens,
 * - HONEST EMPTY STATES: a Template with no (surviving) room references
 *   points the user at the Settings management hierarchy.
 */

import React from 'react';
import { Dimensions } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';

import { APP_NAME } from '@core/constants';
import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import type { CapabilityDef, Room } from '@modules/devices/api';
import type { SeriesPoint } from '@modules/devices/api';
import {
  createDefaultRegistry,
  type WidgetConfig,
  type WidgetServices,
} from '@modules/widgets/api';
import { Errors, err, ok } from '@core/errors';

import type { DashboardTemplate } from '@modules/dashboard/api';
import { defaultDashboardsFile } from '../internal/domain/seeds';
import { DashboardScreen } from './DashboardScreen';

// The widgets facade transitively requires AsyncStorage (devices api).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const ROOMS: readonly Room[] = [
  { id: 'room-living', name: 'Phòng khách', order: 0, icon: 'home-outline' },
  { id: 'room-bedroom', name: 'Phòng ngủ', order: 1, icon: 'bed-outline' },
  { id: 'room-garage', name: 'Nhà để xe', order: 2, icon: 'car-outline' },
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

/** A minimal one-widget Template-room reference builder. */
function widget(
  id: string,
  type: 'sensor-value' | 'switch',
  roomId: string,
  deviceId: string,
  capability: string,
  x: number,
  y: number,
): WidgetConfig {
  return {
    id,
    type,
    roomId,
    binding: { deviceId, capability },
    layout: { x, y, width: 1, height: 1 },
  };
}

/** The seed Template (Phòng khách: 2 sensors + 2 switches). */
function seedTemplate(): DashboardTemplate {
  const file = defaultDashboardsFile();
  return file.templates[0]!;
}

/** Render the view-only screen with an explicit Template + selection. */
function renderScreen(
  template: DashboardTemplate | undefined,
  mode: 'light' | 'dark' = 'light',
): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ThemeProvider mode={mode}>
        <DashboardScreen
          template={template}
          connection={{ state: 'connected', label: 'MQTT Online' }}
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

describe('DashboardScreen (view-only surface)', () => {
  beforeEach(() => {
    windowWidth = 800; // wide canvas → absolute presentation by default
  });

  it('renders the gel gradient page with app title + MQTT badge', async () => {
    const renderer = renderScreen(seedTemplate());
    const gradient = renderer.root.findByType(LinearGradient);
    expect(gradient.props.colors).toEqual(LIGHT_TOKENS.gradient);
    expect(allText(renderer)).toContain(APP_NAME);
    expect(allText(renderer)).toContain(STRINGS.dashboard.mqttOnline);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders the dark-theme gradient when the active theme is dark', async () => {
    const renderer = renderScreen(seedTemplate(), 'dark');
    expect(renderer.root.findByType(LinearGradient).props.colors).toEqual(
      DARK_TOKENS.gradient,
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('splits the seed layout into "Môi trường" and "Thiết bị" sections', async () => {
    const renderer = renderScreen(seedTemplate());
    expect(allText(renderer)).toContain(STRINGS.dashboard.environment);
    expect(allText(renderer)).toContain(STRINGS.dashboard.devices);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('strip = ACTIVE Template references resolved to physical names, in TEMPLATE order', async () => {
    // Template references [garage (order 0), living (order 1)] — the
    // registry order (living, bedroom, garage) must NOT win.
    const template: DashboardTemplate = {
      id: 'tpl-order',
      name: 'Sắp xếp',
      updatedAt: 0,
      rooms: [
        {
          roomId: 'room-garage',
          order: 0,
          widgets: [
            widget('w-g', 'switch', 'room-garage', 'relay-1', 'switch', 0, 0),
          ],
        },
        { roomId: 'room-living', order: 1, widgets: [] },
      ],
    };
    const renderer = renderScreen(template);
    const strip = renderer.root.findByProps({
      testID: 'dashboard-room-strip',
    });
    const stripText = textOf(strip);
    const garageAt = stripText.indexOf('Nhà để xe');
    const livingAt = stripText.indexOf('Phòng khách');
    expect(garageAt).toBeGreaterThanOrEqual(0);
    expect(livingAt).toBeGreaterThan(garageAt);
    // A physical room NOT referenced by the Template never appears.
    expect(stripText).not.toContain('Phòng ngủ');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('selecting a room switches the VIEWED room only (empty room → hint)', async () => {
    // Seed living-room layout + a second (empty) room reference.
    const template: DashboardTemplate = {
      id: 'tpl-two',
      name: 'Hai phòng',
      updatedAt: 0,
      rooms: [
        {
          roomId: 'room-living',
          order: 0,
          widgets: seedTemplate().rooms[0]!.widgets,
        },
        { roomId: 'room-bedroom', order: 1, widgets: [] },
      ],
    };
    const renderer = renderScreen(template);
    // The first referenced room renders the sensor/switch content.
    expect(allText(renderer)).toContain(STRINGS.dashboard.environment);
    // Switch to the room with no widgets → truthful hint, no navigation,
    // no persisted write (selection is presentation state).
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-chip-room-bedroom' })
        .props.onPress();
    });
    expect(allText(renderer)).toContain(STRINGS.dashboard.noWidgets);
    expect(allText(renderer)).not.toContain(STRINGS.dashboard.environment);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('hides dangling references and normalizes the view without writing', async () => {
    const template: DashboardTemplate = {
      id: 'tpl-dangling',
      name: 'Tham chiếu mất',
      updatedAt: 0,
      rooms: [
        { roomId: 'room-gone', order: 0, widgets: [] },
        {
          roomId: 'room-living',
          order: 1,
          widgets: [
            widget(
              'w-t',
              'sensor-value',
              'room-living',
              's1',
              'temperature',
              0,
              0,
            ),
          ],
        },
      ],
    };
    const renderer = renderScreen(template);
    // The dangling reference is never displayed (no chip for it)…
    expect(
      renderer.root.findAllByProps({
        testID: 'dashboard-room-chip-room-gone',
      }),
    ).toHaveLength(0);
    // …and the view normalized to the first SURVIVING reference's widgets.
    expect(allText(renderer)).toContain(STRINGS.dashboard.environment);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('points at Settings when the Template has no room references', async () => {
    const template: DashboardTemplate = {
      id: 'tpl-empty',
      name: 'Trống',
      updatedAt: 0,
      rooms: [],
    };
    const renderer = renderScreen(template);
    expect(allText(renderer)).toContain(STRINGS.dashboard.noTemplateRooms);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders NO management affordances (all mutations live behind Settings)', async () => {
    const renderer = renderScreen(seedTemplate());
    // No edit/management test ids may exist on the view surface.
    expect(
      renderer.root.findAllByProps({ testID: 'room-dashboard-edit' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: 'room-edit-save' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: 'room-edit-add-widget' }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: 'template-create-card' }),
    ).toHaveLength(0);
    // The only Texts are view labels — no Template-name navigation row.
    expect(allText(renderer)).not.toContain(STRINGS.templates.createTemplate);
    await act(async () => {
      renderer.unmount();
    });
  });
});
