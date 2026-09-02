/**
 * HistoryChartWidget component tests (CP-R5, fix cycle 2).
 *
 * Proves the rendered result is the EXACT bound device's series: a legacy
 * `deviceId: null` series returned by the adapter (listed FIRST) is ignored
 * — the stats row must show the exact device series' numbers, and with only
 * an untagged series the widget shows the empty state instead of guessing.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { ok } from '@core/errors';
import { STRINGS } from '@core/i18n';
import { ThemeProvider } from '@core/theme';
import type { HistorySeries } from '@modules/history/api';
import { WidgetServicesProvider, type WidgetServices } from '../widgetContext';
import { HistoryChartWidget } from './HistoryChartWidget';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

/** Legacy untagged rows (no deviceId tag) — must never be rendered. */
const legacySeries: HistorySeries = {
  deviceId: null,
  field: 'temperature',
  points: [
    { t: 100, value: 1 },
    { t: 200, value: 3 },
  ],
};

/** The exact bound device's series. */
const exactSeries: HistorySeries = {
  deviceId: 'sensor-01',
  field: 'temperature',
  points: [
    { t: 100, value: 10 },
    { t: 200, value: 20 },
  ],
};

function makeServices(series: HistorySeries[]): {
  services: WidgetServices;
  querySpy: jest.Mock;
} {
  const querySpy = jest.fn(async () => ok(series));
  const services: WidgetServices = {
    getState: () => undefined,
    getSeries: () => [],
    sendCommand: () => ({
      ok: false as const,
      error: { code: 'unknown' as const, message: 'not wired' },
    }),
    queryHistory: querySpy,
    getRooms: () => [],
    getDevices: () => [],
    getCapabilities: () => [
      {
        type: 'temperature',
        label: 'Nhiệt độ',
        kind: 'sensor',
        unit: '°C',
        builtin: true,
      },
    ],
    getActiveRoomId: () => null,
    subscribeDeviceState: () => () => undefined,
  };
  return { services, querySpy };
}

async function renderWidget(services: WidgetServices) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <WidgetServicesProvider services={services}>
          <HistoryChartWidget
            config={{
              id: 'w-1',
              type: 'history-chart',
              layout: { x: 0, y: 0, width: 2, height: 2 },
              binding: { deviceId: 'sensor-01', capability: 'temperature' },
            }}
          />
        </WidgetServicesProvider>
      </ThemeProvider>,
    );
  });
  // Flush the queryHistory promise + the follow-up setState.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

/** All text rendered by the widget (stats + hints + title). */
function renderedTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
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
  return texts;
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

describe('HistoryChartWidget exact matching (fix cycle 2)', () => {
  it('queries its exact device + capability (single field, single device)', async () => {
    const { services, querySpy } = makeServices([exactSeries]);
    const renderer = await renderWidget(services);
    expect(querySpy).toHaveBeenCalledWith({
      measurement: 'sensors',
      range: '24h',
      fields: ['temperature'],
      deviceIds: ['sensor-01'],
    });
    void renderer;
  });

  it('renders the exact device series and ignores a legacy null series', async () => {
    // The untagged series comes FIRST — the widget must not fall back to it.
    const { services } = makeServices([legacySeries, exactSeries]);
    const renderer = await renderWidget(services);

    const texts = renderedTexts(renderer).join('\n');
    // Exact series min/max/avg = 10.0 / 20.0 / 15.0.
    expect(texts).toContain('10.0');
    expect(texts).toContain('20.0');
    expect(texts).toContain('15.0');
    // Legacy series numbers (1.0 / 3.0 / 2.0) must NOT be rendered.
    expect(texts).not.toContain('1.0');
    expect(texts).not.toContain('3.0');
    expect(texts).not.toContain('2.0');
  });

  it('renders no web SVG host elements (React 19 defaultProps regression)', async () => {
    const { services } = makeServices([exactSeries]);
    const renderer = await renderWidget(services);
    expect(forbiddenHostElements(renderer.root)).toEqual([]);
  });

  it('shows the empty state when only an untagged series exists', async () => {
    const { services } = makeServices([legacySeries]);
    const renderer = await renderWidget(services);

    const texts = renderedTexts(renderer).join('\n');
    expect(texts).toContain(STRINGS.history.empty);
    // No legacy stats leak into the stats row.
    expect(texts).not.toContain('1.0');
    expect(texts).not.toContain('3.0');
  });
});
