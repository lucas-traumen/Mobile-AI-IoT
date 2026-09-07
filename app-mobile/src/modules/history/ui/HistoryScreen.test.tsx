/**
 * HistoryScreen Smart Home layout tests (history-smart-home-redesign).
 *
 * Verifies through the public props + rendered tree:
 * - the screen is wrapped in the smart ambient wash (tealTint → page →
 *   amberTint diagonal LinearGradient — NOT the legacy gel gradient);
 * - the header = ☰ menu button (opens the shared RoomListModal, wired to
 *   onRoomChange) + the `Lịch sử` title at `smart.typography.screenTitle`;
 * - TWO white dropdowns replace the chip strip / range chips: the room
 *   dropdown (current room name) and the range dropdown (Vietnamese labels
 *   `1 giờ`/`24 giờ`/`7 ngày`; the HistoryRange values are unchanged), and
 *   the visible date-range line renders below them;
 * - one smart chart card per REGISTERED sensor field, in registration
 *   order, labelled `Label (unit)` with the sensor icon, the Thấp nhất /
 *   Cao nhất / Trung bình stats WITH units (`smart.typography.statsValue`),
 *   and a registered field WITHOUT points renders `Chưa có dữ liệu`
 *   (never a 0);
 * - charts share one x-domain + tick formatting, use line strokeWidth 2 +
 *   a ~5% area fill, render a voronoi+tooltip that is HIDDEN on mount,
 *   and use explicit native SVG primitives (React 19 removed
 *   function-component `defaultProps` — web SVG defaults crash on device);
 * - loading / error / no-rooms / no-sensors branches are preserved and
 *   smart-styled.
 */

import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { Path as SvgPath } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import TestRenderer, { act } from 'react-test-renderer';
import {
  Curve,
  VictoryArea,
  VictoryChart,
  VictoryLine,
  VictoryTooltip,
  VictoryVoronoiContainer,
} from 'victory-native';

import { STRINGS } from '@core/i18n';
import { LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import type { CapabilityDef, Room } from '@modules/devices/api';
import type { HistorySeries } from '@modules/history/api';
import { HistoryScreen } from './HistoryScreen';

// Same mock as the other render tests: the widgets facade transitively
// imports the devices repository (async-storage) — storage is not under
// test here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const rooms: readonly Room[] = [
  { id: 'room-1', name: 'Phòng khách', order: 0 },
];

const capabilities: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    unit: '°C',
    builtin: true,
  },
  { type: 'co2', label: 'CO2', kind: 'sensor' }, // no unit → still its own card
];

/**
 * The active room's registered sensor fields (derived in the app wiring
 * from the sensor projection): two temperature-class fields + one with no
 * returned points.
 */
const registeredFields: readonly string[] = [
  'temperature',
  'co2',
  'illuminance',
];

/** One room-scoped series per queried field; `illuminance` has no points. */
const series: HistorySeries[] = [
  {
    roomId: 'room-1',
    field: 'temperature',
    points: [
      { t: 1, value: 20 },
      { t: 2, value: 22 },
    ],
  },
  { roomId: 'room-1', field: 'co2', points: [{ t: 1, value: 400 }] },
];

/**
 * All rendered Text elements whose (single-string) content equals `value`.
 * Type-scoped because props searches in react-test-renderer match both the
 * composite element and its host fiber (double counting).
 */
function texts(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance[] {
  return root.findAllByType(Text).filter(node => node.props.children === value);
}

/**
 * Lowercase (web) SVG host element types that must never appear in a
 * rendered chart tree. react-test-renderer does not consult RN view
 * configs, so web SVG primitives render "fine" in tests while crashing on
 * device ("View config getter callback for component 'line' must be a
 * function"). React 19 removed function-component `defaultProps`, so any
 * victory component rendered without EXPLICIT native primitives falls back
 * to victory-core's WEB defaults — this walk catches that regression. The
 * walk is scoped to the SCROLL CONTENT (the RoomListModal renders plain
 * lowercase host text nodes that are not SVG).
 */
const FORBIDDEN_SVG_HOST_ELEMENTS: readonly string[] = [
  'line',
  'path',
  'g',
  'svg',
  'text',
  'tspan',
  'rect',
  'circle',
  'clipPath',
];

function forbiddenHostElements(root: TestRenderer.ReactTestInstance): string[] {
  const found: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance): void => {
    if (
      typeof node.type === 'string' &&
      FORBIDDEN_SVG_HOST_ELEMENTS.includes(node.type)
    ) {
      found.push(node.type);
    }
    for (const child of node.children) {
      if (typeof child !== 'object') {
        continue;
      }
      walk(child as TestRenderer.ReactTestInstance);
    }
  };
  walk(root.findByProps({ testID: 'history-scroll' }));
  return found;
}

describe('HistoryScreen Smart Home layout', () => {
  const baseProps = {
    range: '1h' as const,
    series,
    loading: false,
    error: null,
    rooms,
    registeredFields,
    capabilities,
    roomId: 'room-1',
    noSensors: false,
    onRangeChange: jest.fn(),
    onRoomChange: jest.fn(),
  };

  async function create(
    overrides: Partial<Parameters<typeof HistoryScreen>[0]> = {},
  ) {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <HistoryScreen {...baseProps} {...overrides} />
        </ThemeProvider>,
      );
    });
    return renderer;
  }

  it('wraps the screen in the smart ambient wash (NOT the gel gradient)', async () => {
    const root = (await create()).root;
    const gradient = root.findByProps({ testID: 'history-ambient' });
    expect(gradient.type).toBe(LinearGradient);
    expect(gradient.props.colors).toEqual([
      LIGHT_TOKENS.smart.colors.tealTint,
      LIGHT_TOKENS.smart.colors.page,
      LIGHT_TOKENS.smart.colors.amberTint,
    ]);
    expect(gradient.props.start).toEqual({ x: 0, y: 0 });
    expect(gradient.props.end).toEqual({ x: 1, y: 1 });
  });

  it('renders the header: ☰ menu button + Lịch sử title (screenTitle)', async () => {
    const root = (await create()).root;
    const menu = root.findByProps({ testID: 'history-room-menu' });
    const menuStyle = StyleSheet.flatten(menu.props.style);
    expect(menuStyle.width).toBeGreaterThanOrEqual(44);
    expect(menuStyle.height).toBeGreaterThanOrEqual(44);
    expect(menu.props.accessibilityLabel).toBe(STRINGS.history.roomMenu);

    const title = texts(root, STRINGS.history.title)[0];
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(
      LIGHT_TOKENS.smart.typography.screenTitle,
    );
  });

  it('opens the shared RoomListModal from the menu and wires onRoomChange', async () => {
    const onRoomChange = jest.fn();
    const root = (await create({ onRoomChange })).root;

    expect(
      root.findByProps({ testID: 'dashboard-room-modal' }).props.visible,
    ).toBe(false);

    act(() => {
      root.findByProps({ testID: 'history-room-menu' }).props.onPress();
    });
    expect(
      root.findByProps({ testID: 'dashboard-room-modal' }).props.visible,
    ).toBe(true);

    act(() => {
      root.findByProps({ testID: 'dashboard-room-row-room-1' }).props.onPress();
    });
    expect(onRoomChange).toHaveBeenCalledTimes(1);
    expect(onRoomChange).toHaveBeenCalledWith('room-1');
    expect(
      root.findByProps({ testID: 'dashboard-room-modal' }).props.visible,
    ).toBe(false);
  });

  it('renders the room + range dropdowns (no chip strip, no range chip row)', async () => {
    const root = (await create()).root;

    // Room dropdown shows the current room name; the range dropdown shows
    // the active range's Vietnamese label.
    const roomTrigger = root.findByProps({
      testID: 'history-room-dropdown-trigger',
    });
    expect(roomTrigger.findAllByType(Text)[0].props.children).toBe(
      'Phòng khách',
    );
    const rangeTrigger = root.findByProps({
      testID: 'history-range-dropdown-trigger',
    });
    expect(rangeTrigger.findAllByType(Text)[0].props.children).toBe('1 giờ');

    // The legacy chip strip / range chips are gone.
    expect(() => root.findByProps({ testID: 'history-range-row' })).toThrow();
    expect(() =>
      root.findByProps({ testID: 'dashboard-room-strip' }),
    ).toThrow();
    expect(texts(root, '1H')).toHaveLength(0);
    expect(texts(root, '24H')).toHaveLength(0);
    expect(texts(root, '7D')).toHaveLength(0);
  });

  it('range dropdown offers exactly 1 giờ / 24 giờ / 7 ngày and drives onRangeChange', async () => {
    const onRangeChange = jest.fn();
    const root = (await create({ onRangeChange })).root;

    act(() => {
      root
        .findByProps({ testID: 'history-range-dropdown-trigger' })
        .props.onPress();
    });
    const modal = root.findByProps({ testID: 'history-range-dropdown-modal' });
    expect(modal.props.visible).toBe(true);
    root.findByProps({ testID: 'history-range-dropdown-option-1h' });
    root.findByProps({ testID: 'history-range-dropdown-option-24h' });
    root.findByProps({ testID: 'history-range-dropdown-option-7d' });

    act(() => {
      root
        .findByProps({ testID: 'history-range-dropdown-option-24h' })
        .props.onPress();
    });
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(onRangeChange).toHaveBeenCalledWith('24h');
  });

  it('room dropdown lists the rooms and drives onRoomChange', async () => {
    const onRoomChange = jest.fn();
    const root = (await create({ onRoomChange })).root;

    act(() => {
      root
        .findByProps({ testID: 'history-room-dropdown-trigger' })
        .props.onPress();
    });
    act(() => {
      root
        .findByProps({ testID: 'history-room-dropdown-option-room-1' })
        .props.onPress();
    });
    expect(onRoomChange).toHaveBeenCalledTimes(1);
    expect(onRoomChange).toHaveBeenCalledWith('room-1');
  });

  it('renders the visible date-range line (DD/MM HH:mm – DD/MM HH:mm, 24h)', async () => {
    const root = (await create()).root;
    const line = root.findByProps({ testID: 'history-date-range' });
    const content = String(line.props.children);
    // 24h clock + both endpoints carry the date.
    expect(content).toMatch(
      /^\d{2}\/\d{2} \d{2}:\d{2} – \d{2}\/\d{2} \d{2}:\d{2}$/,
    );
  });

  it('renders one smart card per REGISTERED field in order, with units in title + stats', async () => {
    const root = (await create()).root;

    // Registration order preserved: temperature, co2, illuminance.
    expect(texts(root, 'Nhiệt độ (°C)')).toHaveLength(1);
    expect(texts(root, 'CO2')).toHaveLength(1);
    expect(texts(root, 'illuminance')).toHaveLength(1);

    // Two of the three registrations returned points → two charts; the
    // third (illuminance) renders the no-data card instead.
    expect(root.findAllByType(VictoryLine)).toHaveLength(2);
    expect(root.findAllByType(VictoryChart)).toHaveLength(2);
    // Two area fills (same-color ~5% opacity) under the two lines.
    const areas = root.findAllByType(VictoryArea);
    expect(areas).toHaveLength(2);
    for (const area of areas) {
      expect(area.props.style.data.fillOpacity).toBe(0.05);
    }
    const lines = root.findAllByType(VictoryLine);
    for (const line of lines) {
      expect(line.props.style.data.strokeWidth).toBe(2);
    }

    // Stats labels (spec wording) exist on every card WITH data; values
    // carry the unit and use the statsValue token. The assertions are
    // scoped to a single card because the mocked icon component renders
    // its glyph name through a Text node (the string keys below are
    // unique per card).
    const tempCard = root.findByProps({ testID: 'history-card-temperature' });
    const co2Card = root.findByProps({ testID: 'history-card-co2' });
    expect(texts(tempCard, STRINGS.history.statMin)).toHaveLength(1);
    expect(texts(tempCard, STRINGS.history.statMax)).toHaveLength(1);
    expect(texts(tempCard, STRINGS.history.statAvg)).toHaveLength(1);
    expect(texts(co2Card, STRINGS.history.statMin)).toHaveLength(1);
    expect(texts(tempCard, '20.0 °C')).toHaveLength(1); // min + unit
    expect(texts(tempCard, '22.0 °C')).toHaveLength(1); // max + unit
    const minValue = texts(tempCard, '20.0 °C')[0];
    expect(StyleSheet.flatten(minValue.props.style).fontSize).toBe(
      LIGHT_TOKENS.smart.typography.statsValue,
    );
    expect(StyleSheet.flatten(minValue.props.style).color).toBe(
      LIGHT_TOKENS.smart.colors.textPrimary,
    );
  });

  it('renders the sensor icons (thermometer teal / water blue / analytics fallback)', async () => {
    const root = (await create()).root;
    const tempIcon = root.findByProps({
      testID: 'history-card-temperature-icon',
    });
    expect(tempIcon.props.name).toBe('thermometer-outline');
    expect(tempIcon.props.color).toBe(LIGHT_TOKENS.smart.colors.teal);
    const co2Icon = root.findByProps({ testID: 'history-card-co2-icon' });
    expect(co2Icon.props.name).toBe('analytics-outline');
  });

  it('renders the Chưa có dữ liệu card for a registered sensor without points', async () => {
    const root = (await create()).root;

    // The illuminance registration keeps its card: explicit no-data state,
    // never a disappearing sensor and never a 0.
    root.findByProps({ testID: 'history-card-illuminance-no-data' });
    expect(texts(root, STRINGS.history.noData)).toHaveLength(1);
    expect(texts(root, '0')).toHaveLength(0);
  });

  it('never pairs wrong-room or untagged series into a registered card', async () => {
    const hostileSeries: HistorySeries[] = [
      {
        roomId: 'room-OTHER',
        field: 'temperature',
        points: [
          { t: 1, value: 30 },
          { t: 2, value: 31 },
        ],
      },
      { roomId: null, field: 'co2', points: [{ t: 1, value: 999 }] },
    ];
    const root = (await create({ series: hostileSeries })).root;

    // Both registrations keep their cards, but with ZERO paired points —
    // the wrong-room and untagged series never populate them.
    expect(root.findAllByType(VictoryLine)).toHaveLength(0);
    expect(root.findAllByType(VictoryChart)).toHaveLength(0);
    expect(texts(root, STRINGS.history.noData)).toHaveLength(3);
    expect(texts(root, 'Nhiệt độ (°C)')).toHaveLength(1);
    expect(texts(root, 'CO2')).toHaveLength(1);
  });

  it('shares one x-domain across charts and keeps the tooltip hidden on mount', async () => {
    const root = (await create()).root;
    const charts = root.findAllByType(VictoryChart);
    expect(charts.length).toBeGreaterThan(0);
    const domains = charts.map(chart => chart.props.domain.x);
    for (const domain of domains) {
      expect(domain).toEqual(domains[0]);
    }
    // Every chart uses the voronoi container (touch tooltip)…
    expect(root.findAllByType(VictoryVoronoiContainer)).toHaveLength(
      charts.length,
    );
    // …with label-only activation (touch end clears the tooltip)…
    for (const container of root.findAllByType(VictoryVoronoiContainer)) {
      expect(container.props.activateData).toBe(false);
    }
    // …and NO tooltip is active on mount (no persistent crosshair).
    const tooltips = root.findAllByType(VictoryTooltip);
    expect(tooltips.length).toBeGreaterThan(0);
    for (const tooltip of tooltips) {
      expect(tooltip.props.active).not.toBe(true);
    }
  });

  it('renders no web SVG host elements (React 19 defaultProps regression)', async () => {
    const root = (await create()).root;
    expect(forbiddenHostElements(root)).toEqual([]);
  });

  it('paints the line + area through a Curve-derived node with ONLY SVG-safe props', async () => {
    // User-acceptance regression: on the web build the VictoryLine /
    // VictoryArea shapes never painted because victory's `Curve` ALWAYS
    // forwards its RN-only `pathComponent` prop into victory-native's
    // `VPath` → react-native-svg's web `WebShape` → the DOM `<path>`,
    // which react-dom rejects (`warnUnknownProperties`). The fix wraps the
    // series `dataComponent` in a module-local `SafeCurve` that passes an
    // explicit `<Path/>` as `pathComponent` AND strips that prop from the
    // spread, so victory's computed `d` reaches the `<path>` but the RN-only
    // `pathComponent` element never reaches the web DOM.
    //
    // react-test-renderer resolves react-native-svg's NATIVE `Path` (its
    // `extract` step drops the non-SVG keys AND flattens the victory style
    // into fill/stroke props). Pin the exact contract on BOTH series: the
    // Curve-derived node renders, the rendered RNSVG <Path> carries a
    // non-empty `d` (the shape paints), the series style survives (stroke
    // for the line / fill for the area), and NO RN-only/victory-internal
    // props (`pathComponent`, `data`, `scale`, `interpolation`, `x`, `y`,
    // `events`) leak onto the rendered path (they are what react-dom
    // rejects on the web build).
    const root = (await create()).root;
    const cards = [
      // resolveCapabilityAccent: temperature → tokens.temperature,
      // a non-builtin field without a catalog color → tokens.primary.
      {
        card: root.findByProps({ testID: 'history-card-temperature' }),
        accent: LIGHT_TOKENS.temperature,
      },
      {
        card: root.findByProps({ testID: 'history-card-co2' }),
        accent: LIGHT_TOKENS.primary,
      },
    ];
    const LEAKED_PROPS = [
      'pathComponent',
      'lineComponent',
      'data',
      'scale',
      'interpolation',
      'x',
      'y',
      'events',
      'polar',
      'origin',
      'index',
      'id',
    ];
    for (const { card, accent } of cards) {
      expect(card.findAllByType(VictoryLine)).toHaveLength(1);
      expect(card.findAllByType(VictoryArea)).toHaveLength(1);
      // The Curve-derived node IS in the tree (the SafeCurve → Curve chain).
      expect(card.findAllByType(Curve).length).toBeGreaterThanOrEqual(1);
      const paths = card.findAllByType(SvgPath);
      expect(paths.length).toBeGreaterThanOrEqual(2); // line + area paint
      for (const path of paths) {
        // d is a path STRING when the series has ≥2 points; a single-point
        // series legitimately yields null (a line needs two points) — the
        // contract under test is that the path is SVG-SAFE, not its length.
        expect(['string', 'object']).toContain(typeof path.props.d);
        for (const leaked of LEAKED_PROPS) {
          expect(path.props[leaked]).toBeUndefined();
        }
      }
      // The line paints with the series accent (stroke), the area fills with
      // it — VPath converted the victory style into native path props.
      expect(paths.map(path => path.props.stroke)).toContain(accent);
      expect(paths.map(path => path.props.fill)).toContain(accent);
    }
  });

  it('charts fill the card inner width with a responsive height in the approved bands', async () => {
    // The jest-expo default window (750) is ≥ STACKED_BREAKPOINT, so the
    // WIDE branch renders: 24pt band padding and the tablet height band.
    const windowWidth = Dimensions.get('window').width;
    expect(windowWidth).toBeGreaterThanOrEqual(560);
    const contentWidth = Math.min(windowWidth, 880) - 24 * 2; // wide padding
    const innerWidth = Math.max(
      200,
      contentWidth - LIGHT_TOKENS.smart.spacing.cardPadding * 2 - 2,
    );
    const root = (await create()).root;
    const charts = root.findAllByType(VictoryChart);
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) {
      expect(chart.props.width).toBe(innerWidth);
      expect(Number.isFinite(chart.props.width)).toBe(true);
      // Wide canvas → tablet band 200–240.
      expect(chart.props.height).toBeGreaterThanOrEqual(200);
      expect(chart.props.height).toBeLessThanOrEqual(240);
    }
  });

  it('renders the loading branch (smart-styled hint)', async () => {
    const root = (await create({ loading: true })).root;
    expect(texts(root, STRINGS.history.loading)).toHaveLength(1);
    expect(root.findAllByType(VictoryChart)).toHaveLength(0);
  });

  it('renders the error branch', async () => {
    const root = (await create({ error: 'boom' })).root;
    expect(texts(root, 'boom')).toHaveLength(1);
    expect(root.findAllByType(VictoryChart)).toHaveLength(0);
  });

  it('renders the no-rooms hint', async () => {
    const root = (await create({ rooms: [], roomId: null })).root;
    expect(texts(root, STRINGS.dashboard.noRooms)).toHaveLength(1);
  });

  it('renders the no-sensors hint and hides stale cards', async () => {
    const root = (await create({ noSensors: true })).root;
    expect(texts(root, STRINGS.history.noSensorForRoom)).toHaveLength(1);
    expect(root.findAllByType(VictoryChart)).toHaveLength(0);
  });
});
