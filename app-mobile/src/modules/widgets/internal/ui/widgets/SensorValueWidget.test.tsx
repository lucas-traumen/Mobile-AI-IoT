/**
 * SensorValueWidget tests (approved Light/Dark responsive redesign).
 *
 * Verifies the approved card anatomy WITHOUT touching the numeric/query
 * contracts:
 * - Vietnamese decimal display formatting: `28.5` renders as `28,5` (comma
 *   separator) — the pure `formatVietnameseValue` helper is display-only,
 * - no observation → the em-dash placeholder (live behavior intact),
 * - the big reading + unit use the capability SEMANTIC ACCENT (theme
 *   temperature/humidity tokens; catalog color for custom capabilities),
 * - the label is MUTED (textSecondary) beside the soft icon chip,
 * - the 1h delta caption is a secondary-color caption with the Vietnamese
 *   delta value (`↑ 0,4 °C so với 1 giờ trước`),
 * - the wide (2x1) layout keeps the sparkline (SVG polyline) behavior.
 */

import React from 'react';
import { Text } from 'react-native';
import { Polyline } from 'react-native-svg';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';
import type {
  CapabilityDef,
  Device,
  DeviceCapabilityValue,
  Room,
  SeriesPoint,
} from '@modules/devices/api';
import { Errors, err, ok } from '@core/errors';

import type { WidgetConfig } from '../../domain/widgetTypes';
import { WidgetServicesProvider, type WidgetServices } from '../widgetContext';
import { formatVietnameseValue, SensorValueWidget } from './SensorValueWidget';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const CATALOG: readonly CapabilityDef[] = [
  {
    type: 'temperature',
    label: 'Nhiệt độ',
    kind: 'sensor',
    unit: '°C',
    icon: 'thermometer-outline',
  },
  {
    type: 'humidity',
    label: 'Độ ẩm',
    kind: 'sensor',
    unit: '%',
    icon: 'water-outline',
  },
  {
    type: 'pressure',
    label: 'Áp suất',
    kind: 'sensor',
    unit: 'hPa',
    color: '#123456',
    icon: 'speedometer-outline',
  },
];

const ROOMS: readonly Room[] = [
  { id: 'room-l', name: 'Phòng', order: 0, icon: 'home-outline' },
];

const DEVICES: readonly Device[] = [];

const HOUR = 3_600_000;

const CONFIG: WidgetConfig = {
  id: 'w-temp',
  type: 'sensor-value',
  binding: { deviceId: 'sensor-01', capability: 'temperature' },
  layout: { x: 0, y: 0, width: 1, height: 1 },
};

/**
 * Controllable services: one stable snapshot + a one-hour series pair so
 * the delta caption has data (`useSyncExternalStore` requires identity
 * stability between renders).
 */
function makeServices(options: {
  value?: number;
  series?: readonly SeriesPoint[];
}): WidgetServices {
  const state: DeviceCapabilityValue | undefined =
    options.value === undefined
      ? undefined
      : { value: options.value, updatedAt: 1000 };
  const series: readonly SeriesPoint[] = options.series ?? [];
  return {
    getState: () => state,
    getSeries: () => series,
    sendCommand: () => err(Errors.unknown('not wired')),
    queryHistory: async () => ok([]),
    getRooms: () => ROOMS,
    getDevices: () => DEVICES,
    getCapabilities: () => CATALOG,
    getActiveRoomId: () => 'room-l',
    subscribeDeviceState: () => () => undefined,
  };
}

async function renderSensor(
  config: WidgetConfig,
  services: WidgetServices,
): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <WidgetServicesProvider services={services}>
          <SensorValueWidget config={config} />
        </WidgetServicesProvider>
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** Flatten an RN style (object or array of objects) into one plain object. */
function flatStyles(style: unknown): Record<string, unknown> {
  const layers = Array.isArray(style) ? style : [style];
  return Object.assign(
    {},
    ...(layers.filter(
      layer => layer !== null && typeof layer === 'object',
    ) as Record<string, unknown>[]),
  );
}

/** Deep-collect the text strings rendered under a node (RN nests Texts). */
function textOf(node: ReactTestInstance): string {
  return (node.children as unknown[])
    .map(child => {
      if (typeof child === 'string') {
        return child;
      }
      if (typeof child === 'number') {
        return String(child);
      }
      if (Array.isArray(child)) {
        return child.map(String).join('');
      }
      return textOf(child as ReactTestInstance);
    })
    .join('');
}

/** All text rendered by the widget (deep). */
function allText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map(textOf).join('\n');
}

describe('formatVietnameseValue (pure display formatting)', () => {
  it('formats one-decimal values with a comma decimal separator', () => {
    expect(formatVietnameseValue(28.5)).toBe('28,5');
    expect(formatVietnameseValue(65)).toBe('65,0');
    expect(formatVietnameseValue(-1.25)).toBe('-1,3');
    expect(formatVietnameseValue(0)).toBe('0,0');
  });

  it('renders the em-dash placeholder for non-finite input', () => {
    expect(formatVietnameseValue(NaN)).toBe('—');
    expect(formatVietnameseValue(Infinity)).toBe('—');
  });

  it('is display-only (numeric input is untouched)', () => {
    const value = 28.5;
    expect(formatVietnameseValue(value)).toBe('28,5');
    expect(value).toBe(28.5);
  });
});

describe('SensorValueWidget display (Vietnamese decimal)', () => {
  it('renders 28,5 (comma) for a 28.5 reading — never a dot', async () => {
    const renderer = await renderSensor(CONFIG, makeServices({ value: 28.5 }));
    const text = allText(renderer);
    expect(text).toContain('28,5');
    expect(text).not.toContain('28.5');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the live placeholder when no observation exists', async () => {
    const renderer = await renderSensor(CONFIG, makeServices({}));
    expect(allText(renderer)).toContain('—');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('colors the value + unit with the semantic capability accent', async () => {
    const temp = await renderSensor(CONFIG, makeServices({ value: 28.5 }));
    const valueNode = temp.root
      .findAllByType(Text)
      .find(node => node.props.children === '28,5');
    expect(flatStyles(valueNode!.props.style).color).toBe(
      LIGHT_TOKENS.temperature,
    );
    await act(async () => {
      temp.unmount();
    });

    const humidity = await renderSensor(
      {
        ...CONFIG,
        binding: { deviceId: 'sensor-01', capability: 'humidity' },
      },
      makeServices({ value: 65 }),
    );
    const humNode = humidity.root
      .findAllByType(Text)
      .find(node => node.props.children === '65,0');
    expect(flatStyles(humNode!.props.style).color).toBe(LIGHT_TOKENS.humidity);
    await act(async () => {
      humidity.unmount();
    });
  });

  it('uses the catalog color as the accent for custom capabilities', async () => {
    const renderer = await renderSensor(
      {
        ...CONFIG,
        binding: { deviceId: 'sensor-01', capability: 'pressure' },
      },
      makeServices({ value: 1013 }),
    );
    const valueNode = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === '1013,0');
    expect(flatStyles(valueNode!.props.style).color).toBe('#123456');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders a MUTED label (textSecondary) next to the icon chip', async () => {
    const renderer = await renderSensor(CONFIG, makeServices({ value: 28.5 }));
    const labelNode = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === 'Nhiệt độ');
    expect(flatStyles(labelNode!.props.style).color).toBe(
      LIGHT_TOKENS.textSecondary,
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows the 1h delta caption with the Vietnamese delta value', async () => {
    const series: readonly SeriesPoint[] = [
      { value: 28.1, ts: 1000 },
      { value: 28.5, ts: 1000 + HOUR },
    ];
    const renderer = await renderSensor(
      CONFIG,
      makeServices({ value: 28.5, series }),
    );
    const text = allText(renderer);
    expect(text).toContain(STRINGS.dashboard.deltaVsHourAgo);
    expect(text).toContain('0,4');
    expect(text).not.toContain('0.4');
    // The caption is secondary-colored (the accent stays on the value).
    const caption = renderer.root
      .findAllByType(Text)
      .find(node => textOf(node).includes(STRINGS.dashboard.deltaVsHourAgo));
    expect(caption).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the sparkline for wide (2x1) layouts', async () => {
    const series: readonly SeriesPoint[] = [
      { value: 27.9, ts: 1000 },
      { value: 28.2, ts: 1000 + 900_000 },
      { value: 28.5, ts: 1000 + HOUR },
    ];
    const renderer = await renderSensor(
      { ...CONFIG, layout: { x: 0, y: 0, width: 2, height: 1 } },
      makeServices({ value: 28.5, series }),
    );
    expect(renderer.root.findAllByType(Polyline).length).toBeGreaterThan(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});
