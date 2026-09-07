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
import { Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';
import { DARK_TOKENS, LIGHT_TOKENS, ThemeProvider } from '@core/theme';
import { STRINGS } from '@core/i18n';

import type { CapabilityDef, Device } from '@modules/devices/api';
import type { WidgetServices } from '@modules/widgets/api';
import {
  createDefaultRegistry,
  WidgetServicesProvider,
} from '@modules/widgets/api';
import { createDashboardStore } from '../internal/ui/dashboardStore';
import { defaultDashboardsFile } from '../internal/domain/seeds';
import { SMART_VIEW_MAX_CONTENT_WIDTH } from '../internal/domain/gridMetrics';
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
  // Stable connected snapshot (amendment-2 connection seam; identity
  // stability for useSyncExternalStore).
  const connection = { state: 'connected' as const, label: 'Đã kết nối' };
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
    // Stable connected snapshot (amendment-2 connection seam).
    getConnectionState: () => connection,
    subscribeConnection: () => () => undefined,
  };
}

/**
 * Shared editor harness: the REAL store seams (same wiring as the route) +
 * spy wrappers, one fresh draft per call.
 */
const renderEditor = async (): Promise<{
  readonly renderer: ReactTestRenderer;
  readonly store: ReturnType<typeof createDashboardStore>;
  readonly onDraftRebind: jest.Mock;
  readonly onDraftSwapBindings: jest.Mock;
  readonly onDraftSwapPositions: jest.Mock;
}> => {
  const store = createDashboardStore(defaultDashboardsFile());
  store.getState().enterEdit('main', 'room-living');
  const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
  const onDraftRebind = jest.fn();
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

describe('EditRoomDashboardScreen (cycle 7: G swap + H sections)', () => {
  interface Harness {
    readonly renderer: ReactTestRenderer;
    readonly store: ReturnType<typeof createDashboardStore>;
    readonly onDraftRebind: jest.Mock;
    readonly onDraftSwapBindings: jest.Mock;
    readonly onDraftSwapPositions: jest.Mock;
  }

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

/**
 * Scope amendment 1 (fix cycle 2): the editor adopts the Smart Home visual
 * language — ambient wash + smart card surfaces + smart section labels —
 * while EVERY editing affordance and the exact-slot editor contract stay
 * unchanged (visual only).
 */
describe('EditRoomDashboardScreen smart visual sync (scope amendment 1 — visual only)', () => {
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

  /** Views whose flattened style carries ALL the given style entries. */
  function viewsWithStyle(
    root: ReactTestRenderer['root'],
    match: Record<string, unknown>,
  ) {
    return root.findAllByType(View).filter(view => {
      const flat = flatStyles(view.props.style);
      return Object.entries(match).every(([key, value]) => flat[key] === value);
    });
  }

  it('renders the ambient Smart Home wash (same recipe as the Dashboard view)', async () => {
    const harness = await renderEditor();
    const gradient = harness.renderer.root.findByType(LinearGradient);
    expect(gradient.props.colors).toEqual([
      LIGHT_TOKENS.smart.colors.tealTint,
      LIGHT_TOKENS.smart.colors.page,
      LIGHT_TOKENS.smart.colors.amberTint,
    ]);
    expect(gradient.props.start).toEqual({ x: 0, y: 0 });
    expect(gradient.props.end).toEqual({ x: 1, y: 1 });
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('renders the smart card surfaces in light AND dark (WYSIWYG surfaces)', async () => {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = mode === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
      const store = createDashboardStore(defaultDashboardsFile());
      store.getState().enterEdit('main', 'room-living');
      const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <ThemeProvider mode={mode}>
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
          </ThemeProvider>,
        );
      });
      expect(
        viewsWithStyle(renderer.root, {
          backgroundColor: tokens.smart.colors.card,
          borderColor: tokens.smart.colors.cardBorder,
        }).length,
      ).toBeGreaterThan(0);
      await act(async () => {
        renderer.unmount();
      });
    }
  });

  it('passes cardAppearance="smart" with the UNCHANGED exact-slot editor contract', async () => {
    const harness = await renderEditor();
    const grids = harness.renderer.root.findAllByType(DashboardGrid);
    expect(grids).toHaveLength(2);
    for (const grid of grids) {
      const props = grid.props as {
        cardAppearance: string;
        editMode: boolean;
        metrics: { gap: number; padding: number };
      };
      // Visual language: smart surfaces.
      expect(props.cardAppearance).toBe('smart');
      // Contract: edit mode + the persisted grid math (GRID_GAP 12 slots —
      // NOT the smart 16pt view gap; the editor math is untouched).
      expect(props.editMode).toBe(true);
      expect(props.metrics.gap).toBe(12);
      expect(props.metrics.padding).toBe(16);
    }
    await act(async () => {
      harness.renderer.unmount();
    });
  });

  it('renders the smart section labels (no pill) and keeps every affordance', async () => {
    const harness = await renderEditor();
    // Smart labels: secondary-colored plain text (no pill background).
    const envLabel = harness.renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === STRINGS.dashboard.environment);
    expect(envLabel).toBeTruthy();
    expect(flatStyles(envLabel!.props.style).backgroundColor).toBeUndefined();
    expect(flatStyles(envLabel!.props.style).color).toBe(
      LIGHT_TOKENS.smart.colors.textSecondary,
    );
    // Affordances: the chrome-bar menu button exists per widget card
    // (the testID fans out across nested host views — presence is what
    // matters).
    for (const widgetId of ['w-temp', 'w-hum', 'w-light', 'w-fan']) {
      expect(
        harness.renderer.root.findAllByProps({
          testID: `widget-chrome-menu-${widgetId}`,
        }).length,
      ).toBeGreaterThan(0);
    }
    // Header + add-flow affordances intact (same fan-out as above).
    expect(
      harness.renderer.root.findAllByProps({ testID: 'room-edit-cancel' })
        .length,
    ).toBeGreaterThan(0);
    expect(
      harness.renderer.root.findAllByProps({ testID: 'room-edit-save' }).length,
    ).toBeGreaterThan(0);
    expect(
      harness.renderer.root.findAllByProps({
        testID: 'room-edit-add-widget',
      }).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      harness.renderer.unmount();
    });
  });
});

describe('EditRoomDashboardScreen Save-exit contract (scope amendment 2 bug fix)', () => {
  /** Outcome for the FAILED-save path (the message must stay visible). */
  const FAIL_OUTCOME = { ok: false, message: 'Lưu thất bại — thử lại' };

  /**
   * Dedicated harness with controllable onSave/onCancel spies: the save
   * exit flows through `onCancel` (THE one exit path — in the route it is
   * `discardAndPop`, which cancels the now-persisted draft and pops).
   */
  const renderSaveHarness = async (outcome: {
    ok: boolean;
    message: string;
    draftCurrent?: boolean;
  }): Promise<{
    readonly renderer: ReactTestRenderer;
    readonly onCancel: jest.Mock;
    readonly onSave: jest.Mock;
  }> => {
    const store = createDashboardStore(defaultDashboardsFile());
    store.getState().enterEdit('main', 'room-living');
    const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
    const onCancel = jest.fn();
    const onSave = jest.fn(async () => outcome);
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
            onCancel={onCancel}
            onSave={onSave}
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
        </ThemeProvider>,
      );
    });
    return { renderer, onCancel, onSave };
  };

  it('a SUCCESSFUL save EXITS the editor (Lưu navigates back out)', async () => {
    const { renderer, onCancel, onSave } = await renderSaveHarness(OK_OUTCOME);
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    // The atomic commit was requested exactly once…
    expect(onSave).toHaveBeenCalledTimes(1);
    // …and the editor LEFT via the single exit path (no second Lưu tap).
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('an explicit draftCurrent:true still exits (route gate contract)', async () => {
    const { renderer, onCancel } = await renderSaveHarness({
      ok: true,
      message: '',
      draftCurrent: true,
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    // The open draft equals the saved revision → the clean exit.
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('a save whose draft DIVERGED during the pending window STAYS (no silent loss, hint shown)', async () => {
    const { renderer, onCancel } = await renderSaveHarness({
      ok: true,
      message: '',
      draftCurrent: false,
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    // The editor did NOT exit — the newer edits stay open (the route
    // persisted the save-start snapshot; the live draft is ahead of it).
    expect(onCancel).not.toHaveBeenCalled();
    // The user is told the truth: saved, but newer unsaved edits remain.
    const bannerText = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter((child): child is string => typeof child === 'string')
      .join('\n');
    expect(bannerText).toContain(STRINGS.dashboard.savedDraftStale);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('a FAILED save STAYS with the error visible (no exit)', async () => {
    const { renderer, onCancel, onSave } = await renderSaveHarness(
      FAIL_OUTCOME,
    );
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    // The editor did NOT exit…
    expect(onCancel).not.toHaveBeenCalled();
    // …and the failure reason is visible in the operation banner.
    const bannerText = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter((child): child is string => typeof child === 'string')
      .join('\n');
    expect(bannerText).toContain(FAIL_OUTCOME.message);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('EditRoomDashboardScreen amendment-2 widget sync (editor preview)', () => {
  /** Flatten an RN style (object or array of objects) into one plain object. */
  function flatStylesShared(style: unknown): Record<string, unknown> {
    const layers = Array.isArray(style) ? style : [style];
    return Object.assign(
      {},
      ...(layers.filter(
        layer => layer !== null && typeof layer === 'object',
      ) as Record<string, unknown>[]),
    );
  }

  it('renders the per-DEVICE glyphs + the unknown caption in the editor preview (slot grid unchanged)', async () => {
    // Devices mirroring the seeds (per-device glyphs); the module-level
    // makeServices() returns NO capability state → the unknown caption
    // must be visible on the preview's switch cards.
    const syncDevices: readonly Device[] = [
      {
        id: 'relay-1',
        name: 'Đèn',
        roomId: 'room-living',
        type: 'relay',
        capabilities: ['switch'],
        icon: 'bulb-outline',
        binding: { kind: 'relay', index: 1 },
      },
      {
        id: 'relay-2',
        name: 'Quạt',
        roomId: 'room-living',
        type: 'relay',
        capabilities: ['switch'],
        // Scope amendment 3: the REAL fan glyph (MaterialCommunityIcons).
        icon: 'fan',
        binding: { kind: 'relay', index: 2 },
      },
    ];
    const store = createDashboardStore(defaultDashboardsFile());
    store.getState().enterEdit('main', 'room-living');
    const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
    // The widgets read their device (per-device glyph) through the
    // services seam — the iconed devices ride `getDevices`; the state seam
    // stays empty (unknown caption) and the connection stays live.
    const syncServices: WidgetServices = {
      ...makeServices(),
      getDevices: () => syncDevices,
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider mode="light">
          <EditRoomDashboardScreen
            template={template}
            roomId="room-living"
            rooms={[{ id: 'room-living', name: 'Phòng khách', order: 0 }]}
            devices={syncDevices}
            capabilities={CAPABILITIES}
            registry={createDefaultRegistry()}
            services={syncServices}
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
        </ThemeProvider>,
      );
    });
    const glyphs = renderer.root
      .findAllByType(Ionicons)
      .map(node => node.props.name as string);
    // The preview's switch cards carry the per-device glyphs…
    expect(glyphs).toContain('bulb-outline');
    // …Quạt's `fan` renders through ITS family — MaterialCommunityIcons
    // (scope amendment 3)…
    const mci = renderer.root
      .findAllByType(MaterialCommunityIcons)
      .map(node => node.props.name as string);
    expect(mci).toContain('fan');
    expect(glyphs).not.toContain('fan');
    // …and the visible unknown caption (the visual sync rides the shared
    // widget components; the exact-slot grid contract is untouched).
    const text = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter((child): child is string => typeof child === 'string')
      .join('\n');
    expect(text).toContain(STRINGS.widgets.unknownCaption);
    // The editor's section label keeps the absorbed-gap contract
    // (marginBottom 0 — the persisted grid's own top padding is the gap).
    const label = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === STRINGS.dashboard.environment);
    expect(flatStylesShared(label!.props.style).marginBottom).toBe(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('EditRoomDashboardScreen header band (scope amendment 3 — coherence)', () => {
  /** Flatten an RN style (object or array of objects) into one plain object. */
  function flatStylesLocal(style: unknown): Record<string, unknown> {
    const layers = Array.isArray(style) ? style : [style];
    return Object.assign(
      {},
      ...(layers.filter(
        layer => layer !== null && typeof layer === 'object',
      ) as Record<string, unknown>[]),
    );
  }

  it('constrains the Hủy | title | Lưu header to the SAME centered 880 band', async () => {
    const store = createDashboardStore(defaultDashboardsFile());
    store.getState().enterEdit('main', 'room-living');
    const template: DashboardTemplate = defaultDashboardsFile().templates[0]!;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider mode="light">
          <EditRoomDashboardScreen
            template={template}
            roomId="room-living"
            rooms={[{ id: 'room-living', name: 'Phòng khách', order: 0 }]}
            devices={[]}
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
        </ThemeProvider>,
      );
    });
    // The header row is capped at the smart content width and centered —
    // coherent with the Dashboard tab; every affordance is untouched.
    const header = renderer.root.findAllByType(View).find(view => {
      const flat = flatStylesLocal(view.props.style);
      return (
        flat.maxWidth === SMART_VIEW_MAX_CONTENT_WIDTH &&
        flat.flexDirection === 'row'
      );
    });
    expect(header).toBeTruthy();
    const flat = flatStylesLocal(header!.props.style);
    expect(flat.alignSelf).toBe('center');
    expect(flat.width).toBe('100%');
    expect(header!.findByProps({ testID: 'room-edit-cancel' })).toBeTruthy();
    expect(header!.findByProps({ testID: 'room-edit-save' })).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });
});
