/**
 * HistoryScreen gel layout tests.
 *
 * Verifies through the public props + rendered tree:
 * - the range row renders the 1H/24H/7D chips centered, and the ACTIVE chip
 *   is a gel pill (translucent `chipActiveBg` token tint, never solid
 *   `primary`; no Gộp/Tách toggle);
 * - the room row is the shared Dashboard `RoomSelector` (☰ expand action +
 *   non-wrapping quick strip + full-list modal) wired to `onRoomChange`;
 * - one card per REGISTERED sensor field (approved derived History),
 *   labelled with the CAPABILITY ONLY, with the Min/Max/Trung bình row;
 * - a registered field WITHOUT points renders the `Chưa có dữ liệu` card
 *   instead of disappearing;
 * - charts use the fixed height 240 + the documented width contract, and
 *   explicit native SVG primitives (React 19 removed function-component
 *   `defaultProps`, so victory-native@36's web defaults would otherwise
 *   crash on device).
 */

import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TestRenderer, { act } from 'react-test-renderer';
import { VictoryChart, VictoryLine } from 'victory-native';

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
 * to victory-core's WEB defaults — this walk catches that regression.
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
  walk(root);
  return found;
}

describe('HistoryScreen split layout', () => {
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

  async function create(overrides: Partial<typeof baseProps> = {}) {
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

  it('renders the range chips centered and has no Gộp/Tách toggle', async () => {
    const root = (await create()).root;

    const rangeRow = root.findByProps({ testID: 'history-range-row' });
    expect(StyleSheet.flatten(rangeRow.props.style).justifyContent).toBe(
      'center',
    );
    expect(texts(root, '1H')).toHaveLength(1);
    expect(texts(root, '24H')).toHaveLength(1);
    expect(texts(root, '7D')).toHaveLength(1);

    // The ACTIVE range chip is a gel pill: the translucent `chipActiveBg`
    // token tint (never the solid `primary`) + bold label.
    const activeChip = root.findByProps({ testID: 'history-range-1h' });
    const activeStyle = StyleSheet.flatten(activeChip.props.style);
    expect(activeStyle.backgroundColor).toBe(LIGHT_TOKENS.chipActiveBg);
    expect(activeStyle.backgroundColor).not.toBe(LIGHT_TOKENS.primary);
    expect(
      StyleSheet.flatten(activeChip.findAllByType(Text)[0].props.style),
    ).toMatchObject({ fontWeight: '700' });

    // The grouped/split toggle was removed together with the viewMode prop.
    expect(() =>
      root.findByProps({ testID: 'history-view-grouped' }),
    ).toThrow();
    expect(() => root.findByProps({ testID: 'history-view-split' })).toThrow();
    expect(() =>
      root.findByProps({ testID: 'history-range-spacer' }),
    ).toThrow();
    expect(() =>
      root.findByProps({ testID: 'history-range-toggle-column' }),
    ).toThrow();
  });

  it('renders one chart card per REGISTERED field with points and stats', async () => {
    const root = (await create()).root;

    // Two of the three registrations returned points → two charts; the
    // third (illuminance) renders the no-data card instead.
    expect(root.findAllByType(VictoryLine)).toHaveLength(2);
    expect(root.findAllByType(VictoryChart)).toHaveLength(2);
    // The Min/Max/Trung bình row exists on every card with data.
    expect(texts(root, STRINGS.history.min)).toHaveLength(2);
    expect(texts(root, STRINGS.history.max)).toHaveLength(2);
    expect(texts(root, STRINGS.history.avg)).toHaveLength(2);
    // Stats recipe: labels 13pt, values 17pt (gel layout contract).
    const minLabel = texts(root, STRINGS.history.min)[0];
    expect(StyleSheet.flatten(minLabel.props.style).fontSize).toBe(13);
    const minValue = texts(root, '20.0')[0];
    expect(StyleSheet.flatten(minValue.props.style).fontSize).toBe(17);
  });

  it('renders the Chưa có dữ liệu card for a registered sensor without points', async () => {
    const root = (await create()).root;

    // The illuminance registration keeps its card: explicit no-data state,
    // not a disappearing sensor (approved automatic-History contract).
    expect(texts(root, 'Ánh sáng')).toHaveLength(0); // not in this catalog
    expect(texts(root, 'illuminance')).toHaveLength(1); // raw field label
    expect(texts(root, STRINGS.history.noData)).toHaveLength(1);
  });

  it('never pairs wrong-room or untagged series into a registered card (fix cycle 1)', async () => {
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
    // The registered cards are still present (labels from the catalog).
    expect(texts(root, 'Nhiệt độ')).toHaveLength(1);
    expect(texts(root, 'CO2')).toHaveLength(1);
  });

  it('labels each card with the capability only (no device name)', async () => {
    const root = (await create()).root;

    expect(texts(root, 'Nhiệt độ')).toHaveLength(1);
    expect(texts(root, 'CO2')).toHaveLength(1);
  });

  it('wraps the screen in a LinearGradient colored from the theme tokens', async () => {
    const root = (await create()).root;
    const gradient = root.findByType(LinearGradient);
    expect(gradient.props.colors).toEqual(LIGHT_TOKENS.gradient);
  });

  it('renders no web SVG host elements (React 19 defaultProps regression)', async () => {
    const root = (await create()).root;
    expect(forbiddenHostElements(root)).toEqual([]);
  });

  it('charts fill the card content width (axis gutter is internal, not subtracted)', async () => {
    // Layout regression (charts looked wrong on device): the chart width
    // double-subtracted VictoryChart's INTERNAL left axis gutter
    // (padding.left = 45) on top of screen margin + card padding, so every
    // chart rendered 45pt narrower than its card — and because the chart is
    // left-aligned inside the card, each card showed a dead strip on the
    // right. Contract: width = window − screen margin (2×12) − card padding
    // (2×12), always finite, height fixed at 240 (gel layout).
    const windowWidth = Dimensions.get('window').width;
    const root = (await create()).root;
    const charts = root.findAllByType(VictoryChart);
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) {
      expect(chart.props.width).toBe(Math.max(200, windowWidth - 12 * 4));
      expect(Number.isFinite(chart.props.width)).toBe(true);
      expect(chart.props.height).toBe(240);
    }
  });

  it('hosts the shared RoomSelector strip (☰ + chips + modal, wired to onRoomChange)', async () => {
    // The room row is the Dashboard's controlled RoomSelector reused via
    // the dashboard api facade — the same `dashboard-room-*` testIDs apply,
    // and chip selection drives the SHARED active room (`onRoomChange`).
    const onRoomChange = jest.fn();
    const root = (await create({ onRoomChange })).root;

    // ☰ expand action + non-wrapping quick strip (RoomSelector's own
    // strip-discipline styles are covered by RoomSelector.test.tsx).
    const strip = root.findByProps({ testID: 'dashboard-room-strip' });
    expect(strip.props.horizontal).toBe(true);
    root.findByProps({ testID: 'dashboard-room-expand' });

    // Chip selection updates the shared active room.
    act(() => {
      root
        .findByProps({ testID: 'dashboard-room-chip-room-1' })
        .props.onPress();
    });
    expect(onRoomChange).toHaveBeenCalledTimes(1);
    expect(onRoomChange).toHaveBeenCalledWith('room-1');

    // The ☰ action opens the Dashboard-owned full room list modal.
    act(() => {
      root.findByProps({ testID: 'dashboard-room-expand' }).props.onPress();
    });
    expect(
      root.findByProps({ testID: 'dashboard-room-modal' }).props.visible,
    ).toBe(true);
    expect(
      root.findByProps({ testID: 'dashboard-room-row-room-1' }),
    ).toBeDefined();
  });
});
