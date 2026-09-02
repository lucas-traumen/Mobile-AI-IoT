/**
 * DashboardGrid `layoutYOffset` tests (M2 section fix).
 *
 * Verifies:
 * - a widget at a persisted row > 0 renders shifted UP by `layoutYOffset`
 *   rows (section-local drawing) while the default stays unchanged,
 * - the pure `moveTarget` release math re-bases the section-local drag
 *   target back to the ABSOLUTE persisted row (`y + layoutYOffset`) so the
 *   store keeps dashboard-absolute coords,
 * - with the default offset 0 the math is exactly the legacy behavior
 *   (DashboardLayoutEditor unaffected),
 * - edit mode still attaches the drag responder (wiring intact).
 */

import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

import { ThemeProvider } from '@core/theme';
import {
  createWidgetRegistry,
  type WidgetConfig,
  type WidgetRegistry,
} from '@modules/widgets/api';

import { DashboardGrid, moveTarget } from './DashboardGrid';

// The widgets facade transitively requires AsyncStorage (devices api).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const METRICS = {
  padding: 10,
  gap: 5,
  rowHeight: 100,
  cellWidth: 50,
};
/** One row step in pixels (rowHeight + gap). */
const ROW_STEP = 105;
/** One column step in pixels (cellWidth + gap). */
const COL_STEP = 55;

function FakeWidget(): null {
  return null;
}

function makeRegistry(): WidgetRegistry {
  const registry = createWidgetRegistry();
  registry.register({
    type: 'switch',
    label: 'Công tắc',
    description: 'test widget',
    icon: 'power-outline',
    category: 'control',
    supportedCapabilities: ['switch'],
    supportedSizes: ['1x1', '2x1'],
    component: FakeWidget,
  });
  return registry;
}

function makeWidget(y: number): WidgetConfig {
  return {
    id: 'w1',
    type: 'switch',
    binding: { deviceId: 'relay-1', capability: 'switch' },
    layout: { x: 0, y, width: 2, height: 1 },
  };
}

async function renderGrid(
  widget: WidgetConfig,
  props: { readonly layoutYOffset?: number; readonly editMode?: boolean } = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider mode="light">
        <DashboardGrid
          widgets={[widget]}
          registry={makeRegistry()}
          editMode={props.editMode ?? false}
          metrics={METRICS}
          onMoveWidget={() => false}
          onResizeWidget={() => false}
          onRemoveWidget={() => undefined}
          {...(props.layoutYOffset === undefined
            ? {}
            : { layoutYOffset: props.layoutYOffset })}
        />
      </ThemeProvider>,
    );
  });
  return renderer;
}

/** Views whose flattened style carries the given `top` value (the cards). */
function viewsWithTop(
  root: ReactTestInstance,
  top: number,
): ReactTestInstance[] {
  return root.findAllByType(View).filter(view => {
    const style = view.props.style;
    const layers = Array.isArray(style) ? style : [style];
    return layers.some(
      layer =>
        layer !== null &&
        typeof layer === 'object' &&
        (layer as Record<string, unknown>).top === top,
    );
  });
}

describe('DashboardGrid layoutYOffset (render)', () => {
  it('renders a persisted y=2 card shifted up by layoutYOffset=1 row', async () => {
    // top = padding + (2 - 1) * (rowHeight + gap) = 10 + 105 = 115.
    const renderer = await renderGrid(makeWidget(2), { layoutYOffset: 1 });
    expect(viewsWithTop(renderer.root, 115)).toHaveLength(1);
    expect(viewsWithTop(renderer.root, 220)).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders the persisted row unchanged when no offset is passed (default 0)', async () => {
    // top = padding + 2 * (rowHeight + gap) = 10 + 210 = 220.
    const renderer = await renderGrid(makeWidget(2));
    expect(viewsWithTop(renderer.root, 220)).toHaveLength(1);
    expect(viewsWithTop(renderer.root, 115)).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('moveTarget (drag release math)', () => {
  const widget = makeWidget(2);

  it('re-bases the section-local target back to absolute persisted rows', () => {
    // One row down in the section (y=2, offset 1 → local row 1 → 2) must
    // move the PERSISTED widget to row 3.
    expect(moveTarget(widget, 0, ROW_STEP, METRICS, 1)).toEqual({
      widgetId: 'w1',
      x: 0,
      y: 3,
    });
  });

  it('re-bases column moves too and keeps x in persisted coords', () => {
    expect(moveTarget(widget, COL_STEP, 0, METRICS, 1)).toEqual({
      widgetId: 'w1',
      x: 1,
      y: 2,
    });
  });

  it('returns null when the gesture snaps back to the current cell', () => {
    expect(moveTarget(widget, 0, 0, METRICS, 1)).toBeNull();
    expect(moveTarget(widget, 4, 4, METRICS, 1)).toBeNull();
  });

  it('with the default offset 0 the math is exactly the legacy target', () => {
    expect(moveTarget(widget, 0, ROW_STEP, METRICS, 0)).toEqual({
      widgetId: 'w1',
      x: 0,
      y: 3,
    });
    expect(moveTarget(widget, -COL_STEP, -ROW_STEP, METRICS, 0)).toEqual({
      widgetId: 'w1',
      x: -1,
      y: 1,
    });
  });
});

describe('DashboardGrid edit-mode wiring', () => {
  it('still attaches the drag responder in edit mode', async () => {
    const renderer = await renderGrid(makeWidget(0), { editMode: true });
    const responders = renderer.root.findAll(
      node => typeof node.props.onResponderRelease === 'function',
    );
    expect(responders.length).toBeGreaterThan(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});
