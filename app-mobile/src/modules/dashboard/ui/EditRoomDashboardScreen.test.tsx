/**
 * EditRoomDashboardScreen tests (fix cycles 7–8):
 *
 * - G — Configure dialog binding swap: picking a source another widget in
 *   the same room holds offers the explicit "Hoán đổi" confirmation (the
 *   resolution path for the room's one-source-per-room uniqueness rule);
 *   confirming exchanges the two bindings in the DRAFT (store-backed);
 *   dismissing changes nothing; a FREE source rebinds directly as before.
 * - H — Section-aware editor layout (WYSIWYG): the editor renders the same
 *   two sections as the view screens with the same section-local rebase
 *   (layoutYOffset = sectionBaseY), and the draft mutation handlers keep
 *   writing persisted-ABSOLUTE coordinates (the grid rebases section-local
 *   rows back to absolute).
 * - L — Drag-to-swap positions (cycle 8): both section grids receive the
 *   swap seam wired to the REAL store; a same-section pair exchanges
 *   positions in the DRAFT (Cancel discards, Save persists via the
 *   existing atomic commit); a cross-section pair is refused (draft
 *   untouched).
 */

import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';

import type { CapabilityDef, Device } from '@modules/devices/api';
import type { WidgetServices } from '@modules/widgets/api';
import {
  createDefaultRegistry,
  WidgetServicesProvider,
} from '@modules/widgets/api';
import { createDashboardStore } from '../internal/ui/dashboardStore';
import { defaultDashboardsFile } from '../internal/domain/seeds';
import type { DashboardTemplate } from '../internal/domain/dashboardSchema';
import { OK_OUTCOME } from './ConfirmDialog';
import { DashboardGrid } from './DashboardGrid';
import { EditRoomDashboardScreen } from './EditRoomDashboardScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const CAPABILITIES: readonly CapabilityDef[] = [
  { type: 'temperature', label: 'Nhiệt độ', kind: 'sensor', unit: '°C' },
  { type: 'humidity', label: 'Độ ẩm', kind: 'sensor', unit: '%' },
  { type: 'switch', label: 'Công tắc', kind: 'switch' },
];

function makeDevice(
  id: string,
  roomId: string,
  capabilities: string[],
): Device {
  return {
    id,
    name: id,
    roomId,
    type: capabilities.includes('switch') ? 'relay' : 'sensor',
    capabilities,
    binding: capabilities.includes('switch')
      ? { kind: 'relay', index: 1 }
      : { kind: 'telemetry-sensor' },
  };
}

const DEVICES: readonly Device[] = [
  makeDevice('sensor-temp-01', 'room-living', ['temperature', 'humidity']),
  makeDevice('sensor-hum-01', 'room-living', ['humidity']),
  makeDevice('sensor-a3', 'room-living', ['temperature']),
  makeDevice('relay-1', 'room-living', ['switch']),
];

function makeServices(): WidgetServices {
  return {
    getState: () => undefined,
    getSeries: () => [],
    sendCommand: () => ({
      ok: false as const,
      error: { code: 'unknown' as const, message: 'not wired' },
    }),
    queryHistory: async () => ({
      ok: true as const,
      value: [],
    }),
    getRooms: () => [{ id: 'room-living', name: 'Phòng khách', order: 0 }],
    getDevices: () => DEVICES,
    getCapabilities: () => CAPABILITIES,
    getActiveRoomId: () => 'room-living',
    subscribeDeviceState: () => () => undefined,
  };
}

describe('EditRoomDashboardScreen (cycle 7: G swap + H sections)', () => {
  interface Harness {
    readonly renderer: ReactTestRenderer;
    readonly store: ReturnType<typeof createDashboardStore>;
    readonly onDraftRebind: jest.Mock;
    readonly onDraftSwapBindings: jest.Mock;
    readonly onDraftSwapPositions: jest.Mock;
  }

  const renderEditor = async (): Promise<Harness> => {
    const store = createDashboardStore(defaultDashboardsFile());
    store.getState().enterEdit('main', 'room-living');
    const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
    const onDraftRebind = jest.fn();
    // The REAL store seams (same wiring as the route) + spy wrappers.
    const onDraftSwapBindings = jest.fn((a: string, b: string) =>
      store.getState().swapDraftBindings(a, b),
    );
    const onDraftSwapPositions = jest.fn((a: string, b: string) =>
      store.getState().swapDraftPositions(a, b),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider mode="light">
          <EditRoomDashboardScreen
            template={template}
            roomId="room-living"
            rooms={[{ id: 'room-living', name: 'Phòng khách', order: 0 }]}
            devices={DEVICES}
            capabilities={CAPABILITIES}
            registry={createDefaultRegistry()}
            services={makeServices()}
            editMode
            draftWidgets={store.getState().draftWidgets}
            onOpenDraft={jest.fn()}
            onCancel={jest.fn()}
            onSave={jest.fn(async () => OK_OUTCOME)}
            onDraftMove={(widgetId, x, y) =>
              store.getState().moveWidget(widgetId, x, y)
            }
            onDraftSwapPositions={onDraftSwapPositions}
            onDraftResize={jest.fn(() => true)}
            onDraftRemove={jest.fn()}
            onDraftRename={jest.fn()}
            onDraftRebind={onDraftRebind}
            onDraftSwapBindings={onDraftSwapBindings}
            onAddWidget={jest.fn(async () => OK_OUTCOME)}
            onDuplicateWidget={jest.fn(async () => OK_OUTCOME)}
            onMoveWidget={jest.fn(async () => OK_OUTCOME)}
          />
        </ThemeProvider>,
      );
    });
    return {
      renderer,
      store,
      onDraftRebind,
      onDraftSwapBindings,
      onDraftSwapPositions,
    };
  };

  /** Open the Configure dialog for one widget through the real chrome. */
  const openConfigure = async (
    harness: Harness,
    widgetId: string,
  ): Promise<void> => {
    await act(async () => {
      harness.renderer.root
        .findByProps({ testID: `widget-chrome-menu-${widgetId}` })
        .props.onPress();
    });
    await act(async () => {
      harness.renderer.root
        .findByProps({
          testID: 'widget-menu-configure',
        })
        .props.onPress();
    });
  };

  it('a HELD source reveals the swap confirm with the holder name (no direct rebind)', async () => {
    const harness = await renderEditor();
    // Configure w-hum (holds sensor-hum-01:humidity); press the chip for
    // w-temp's source (sensor-temp-01:temperature) — HELD by w-temp.
    await openConfigure(harness, 'w-hum');
    await act(async () => {
      harness.renderer.root
        .findByProps({
          testID: 'widget-config-bind-sensor-temp-01-temperature',
        })
        .props.onPress();
    });
    // The swap confirmation renders with the holder's title.
    expect(
      harness.renderer.root.findByProps({ testID: 'widget-config-swap' }),
    ).toBeTruthy();
    const dialogText = harness.renderer.root
      .findAll(
        node =>
          typeof node.props?.children === 'string' &&
          node.props.children.length > 0,
      )
      .map(node => node.props.children as string)
      .join('\n');
    expect(dialogText).toContain('Nhiệt độ'); // w-temp's title
    expect(dialogText).toContain(STRINGS.widgets.swapBindingAction);
    // No direct rebind happened — the swap is the explicit resolution.
    expect(harness.onDraftRebind).not.toHaveBeenCalled();
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('confirming the swap exchanges the two bindings in the DRAFT (store-backed)', async () => {
    const harness = await renderEditor();
    await openConfigure(harness, 'w-hum');
    await act(async () => {
      harness.renderer.root
        .findByProps({
          testID: 'widget-config-bind-sensor-temp-01-temperature',
        })
        .props.onPress();
    });
    await act(async () => {
      harness.renderer.root
        .findByProps({ testID: 'widget-config-swap-confirm' })
        .props.onPress();
    });
    expect(harness.onDraftSwapBindings).toHaveBeenCalledWith('w-hum', 'w-temp');
    const draft = harness.store.getState().draftWidgets!;
    expect(draft.find(w => w.id === 'w-hum')!.binding).toEqual({
      deviceId: 'sensor-temp-01',
      capability: 'temperature',
    });
    expect(draft.find(w => w.id === 'w-temp')!.binding).toEqual({
      deviceId: 'sensor-hum-01',
      capability: 'humidity',
    });
    // Titles/positions untouched by the swap.
    expect(draft.find(w => w.id === 'w-temp')!.layout).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('dismissing the swap confirmation changes nothing', async () => {
    const harness = await renderEditor();
    await openConfigure(harness, 'w-hum');
    await act(async () => {
      harness.renderer.root
        .findByProps({
          testID: 'widget-config-bind-sensor-temp-01-temperature',
        })
        .props.onPress();
    });
    await act(async () => {
      harness.renderer.root
        .findByProps({ testID: 'widget-config-swap-dismiss' })
        .props.onPress();
    });
    expect(harness.onDraftSwapBindings).not.toHaveBeenCalled();
    expect(
      harness.renderer.root.findAllByProps({ testID: 'widget-config-swap' })
        .length,
    ).toBe(0);
    const before = harness.store.getState().draftWidgets;
    expect(harness.store.getState().draftWidgets).toBe(before);
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('a FREE source rebinds directly (behavior unchanged) and no swap UI appears', async () => {
    const harness = await renderEditor();
    await openConfigure(harness, 'w-hum');
    // sensor-a3:temperature is held by NOBODY → direct rebind.
    await act(async () => {
      harness.renderer.root
        .findByProps({ testID: 'widget-config-bind-sensor-a3-temperature' })
        .props.onPress();
    });
    expect(harness.onDraftRebind).toHaveBeenCalledWith(
      'w-hum',
      'sensor-a3',
      'temperature',
    );
    expect(harness.onDraftSwapBindings).not.toHaveBeenCalled();
    expect(
      harness.renderer.root.findAllByProps({ testID: 'widget-config-swap' })
        .length,
    ).toBe(0);
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('H: renders BOTH section labels with the same split + rebase as the view', async () => {
    const harness = await renderEditor();
    const labels = harness.renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter((child): child is string => typeof child === 'string');
    // Exact-element matching (a widget's fallback text may CONTAIN the
    // label as a substring — e.g. 'Thiết bị không còn tồn tại').
    expect(labels).toContain(STRINGS.dashboard.environment);
    expect(labels).toContain(STRINGS.dashboard.devices);
    // The two grids receive EXACTLY the view machinery's groups and
    // section-local rebases: env = sensors (rows 0), devices = switches
    // (row 1) → layoutYOffset 0 and 1 respectively.
    const grids = harness.renderer.root.findAllByType(DashboardGrid);
    expect(grids).toHaveLength(2);
    const byOffset = grids
      .map(
        grid =>
          grid.props as {
            layoutYOffset: number;
            widgets: readonly { id: string }[];
          },
      )
      .sort((a, b) => a.layoutYOffset - b.layoutYOffset);
    expect(byOffset[0]!.layoutYOffset).toBe(0);
    expect(byOffset[0]!.widgets.map(w => w.id).sort()).toEqual([
      'w-hum',
      'w-temp',
    ]);
    expect(byOffset[1]!.layoutYOffset).toBe(1);
    expect(byOffset[1]!.widgets.map(w => w.id).sort()).toEqual([
      'w-fan',
      'w-light',
    ]);
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('H: a move through the section grid writes PERSISTED-ABSOLUTE coords (rebase round-trip)', async () => {
    const harness = await renderEditor();
    // The DEVICES grid renders with layoutYOffset=1 (deviceBaseY): dragging
    // w-light to SECTION-LOCAL row 1 means DashboardGrid's move math calls
    // the handler with the ABSOLUTE persisted row 1 + 1 = 2.
    const grids = harness.renderer.root.findAllByType(DashboardGrid);
    const deviceGrid = grids.find(
      grid => (grid.props as { layoutYOffset: number }).layoutYOffset === 1,
    )!;
    await act(async () => {
      deviceGrid.props.onMoveWidget('w-light', 0, 2);
    });
    const draft = harness.store.getState().draftWidgets!;
    expect(draft.find(w => w.id === 'w-light')!.layout).toEqual({
      x: 0,
      y: 2,
      width: 1,
      height: 1,
    });
    // WYSIWYG proof: the persisted-absolute draft, grouped by the SAME
    // section machinery the view uses, shows the switch at section-local
    // row 1 (absolute 2 − deviceBaseY 1) — the same row the user dragged
    // to in the editor.
    const devices = draft.filter(
      w => w.roomId === 'room-living' && w.type === 'switch',
    );
    const baseY = Math.min(...devices.map(w => w.layout.y));
    expect(2 - baseY).toBe(1);
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('H: a room with only ONE kind renders only its section label', async () => {
    const store = createDashboardStore(defaultDashboardsFile());
    // Strip the switch cards from the DRAFT → only "Môi trường" remains
    // (the editor renders from the draft, exactly like production).
    store.getState().enterEdit('main', 'room-living');
    const draft = store.getState().draftWidgets!;
    store.getState().setDraftWidgets(draft.filter(w => w.type !== 'switch'));
    const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider mode="light">
          <WidgetServicesProvider services={makeServices()}>
            <EditRoomDashboardScreen
              template={template}
              roomId="room-living"
              rooms={[{ id: 'room-living', name: 'Phòng khách', order: 0 }]}
              devices={DEVICES}
              capabilities={CAPABILITIES}
              registry={createDefaultRegistry()}
              services={makeServices()}
              editMode
              draftWidgets={store.getState().draftWidgets}
              onOpenDraft={jest.fn()}
              onCancel={jest.fn()}
              onSave={jest.fn(async () => OK_OUTCOME)}
              onDraftMove={jest.fn(() => true)}
              onDraftSwapPositions={jest.fn(() => true)}
              onDraftResize={jest.fn(() => true)}
              onDraftRemove={jest.fn()}
              onDraftRename={jest.fn()}
              onDraftRebind={jest.fn()}
              onDraftSwapBindings={jest.fn(() => true)}
              onAddWidget={jest.fn(async () => OK_OUTCOME)}
              onDuplicateWidget={jest.fn(async () => OK_OUTCOME)}
              onMoveWidget={jest.fn(async () => OK_OUTCOME)}
            />
          </WidgetServicesProvider>
        </ThemeProvider>,
      );
    });
    const labels = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter((child): child is string => typeof child === 'string');
    expect(labels).toContain(STRINGS.dashboard.environment);
    expect(labels).not.toContain(STRINGS.dashboard.devices);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('L: both section grids receive the swap seam wired to the REAL store (same-section exchange)', async () => {
    const harness = await renderEditor();
    const grids = harness.renderer.root.findAllByType(DashboardGrid);
    expect(grids).toHaveLength(2);
    for (const grid of grids) {
      expect(typeof grid.props.onSwapWidgets).toBe('function');
    }
    // Swap the two switch cards (w-light @ (0,1) ↔ w-fan @ (1,1)) through
    // the DEVICES grid's seam — the user's drag-đèn-qua-quạt flow.
    const deviceGrid = grids.find(
      grid => (grid.props as { layoutYOffset: number }).layoutYOffset === 1,
    )!;
    await act(async () => {
      deviceGrid.props.onSwapWidgets('w-light', 'w-fan');
    });
    expect(harness.onDraftSwapPositions).toHaveBeenCalledWith(
      'w-light',
      'w-fan',
    );
    const draft = harness.store.getState().draftWidgets!;
    // Positions EXCHANGED in the draft; bindings/titles stay on their own
    // widget (the đèn keeps its relay, the quạt keeps its relay).
    expect(draft.find(w => w.id === 'w-light')!.layout).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
    expect(draft.find(w => w.id === 'w-fan')!.layout).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    expect(draft.find(w => w.id === 'w-light')!.binding).toEqual({
      deviceId: 'relay-1',
      capability: 'switch',
    });
    expect(draft.find(w => w.id === 'w-fan')!.binding).toEqual({
      deviceId: 'relay-2',
      capability: 'switch',
    });
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('L: the swap is DRAFT-LEVEL — Cancel discards the exchange', async () => {
    const harness = await renderEditor();
    const deviceGrid = harness.renderer.root
      .findAllByType(DashboardGrid)
      .find(
        grid => (grid.props as { layoutYOffset: number }).layoutYOffset === 1,
      )!;
    await act(async () => {
      deviceGrid.props.onSwapWidgets('w-light', 'w-fan');
    });
    expect(
      harness.store.getState().draftWidgets!.find(w => w.id === 'w-light')!
        .layout,
    ).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    // Hủy → the draft is discarded; a fresh draft shows the persisted
    // layout (the exchange is gone — Save is the ONLY persistence path).
    harness.store.getState().cancelEdit();
    expect(harness.store.getState().draftWidgets).toBeNull();
    harness.store.getState().enterEdit('main', 'room-living');
    expect(
      harness.store.getState().draftWidgets!.find(w => w.id === 'w-light')!
        .layout,
    ).toEqual({ x: 0, y: 1, width: 1, height: 1 });
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('L: a CROSS-SECTION pair is refused by the store seam (draft untouched)', async () => {
    const harness = await renderEditor();
    const envGrid = harness.renderer.root
      .findAllByType(DashboardGrid)
      .find(
        grid => (grid.props as { layoutYOffset: number }).layoutYOffset === 0,
      )!;
    const before = harness.store.getState().draftWidgets;
    // w-temp (sensor-value, "Môi trường") ↔ w-light (switch, "Thiết bị"):
    // the sections are type-based — the exchange must never happen.
    await act(async () => {
      envGrid.props.onSwapWidgets('w-temp', 'w-light');
    });
    expect(harness.onDraftSwapPositions).toHaveBeenCalledWith(
      'w-temp',
      'w-light',
    );
    expect(harness.store.getState().draftWidgets).toBe(before);
    await act(async () => {
      harness.renderer.unmount();
    });
  });
});
