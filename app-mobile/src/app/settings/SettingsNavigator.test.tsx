/**
 * SettingsNavigator tests — the Settings tab's ONE typed native stack after
 * the hand-written `routeMachine` retirement (equivalent navigation
 * coverage, now over real React Navigation transitions):
 *
 *   root (settings summary) → advanced / device-management
 *                           → TemplateList → RoomList → RoomDashboard
 *                                                     → EditRoomDashboard
 *
 * Covers: the management entry opens the hierarchy; each settings screen
 * has an explicit back path to root (advanced + device management); the
 * hierarchy progresses TemplateList → RoomList → RoomDashboard →
 * EditRoomDashboard and back one level at a time; each level is a DISTINCT
 * screen (the focused route never mixes levels); the Template cards render
 * truthful name/room-count/updated copy; the room list shows the
 * `X cảm biến · Y thiết bị` meta line (user decision 2026-09-05) and the
 * neutral hint for a device-less room; the Template list has a back
 * affordance to the settings root; the editor opens a draft scoped to
 * exactly one room and Hủy discards it without persisting; deleting the
 * active Template keeps a valid list + selection; the root demo-history
 * toggle routes through the history source selector (in-memory) and
 * initializes from its state. A full-stack drag-to-swap integration (fix
 * cycle 8 L) proves a real release on an OCCUPIED cell swaps through the
 * REAL store (differing spans respected) and persists ONLY on Save.
 *
 * Note on structure: under react-test-renderer, native-stack keeps visited
 * screens mounted in the element tree (real devices detach them via
 * react-native-screens), so "no co-render" is asserted through the focused
 * route name + each screen's own render contract (and device smoke).
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { Text } from 'react-native';
import { create } from 'zustand';
import { err, Errors, ok, type Result } from '@core/errors';
import {
  NavigationContainer,
  StackActions,
  type NavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { ThemeProvider } from '@core/theme';
import {
  createDefaultRegistry,
  type WidgetServices,
} from '@modules/widgets/api';
import { createDashboardStore } from '@modules/dashboard/internal/ui/dashboardStore';
import type { DashboardTemplate } from '@modules/dashboard/api';

import { SettingsNavigator } from './SettingsNavigator';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

/** Two Templates; the active one owns two referenced rooms. */
function makeTemplates(): DashboardTemplate[] {
  return [
    {
      id: 'tpl-main',
      name: 'Trang chủ',
      updatedAt: 1_760_000_000_000,
      rooms: [
        {
          roomId: 'room-living',
          order: 0,
          widgets: [
            {
              id: 'w-temp',
              type: 'sensor-value',
              roomId: 'room-living',
              binding: {
                deviceId: 'sensor-temp-01',
                capability: 'temperature',
              },
              layout: { x: 0, y: 0, width: 1, height: 1 },
            },
            {
              id: 'w-light',
              type: 'switch',
              roomId: 'room-living',
              binding: { deviceId: 'relay-1', capability: 'switch' },
              layout: { x: 1, y: 0, width: 1, height: 1 },
            },
          ],
        },
        { roomId: 'room-bedroom', order: 1, widgets: [] },
      ],
    },
    {
      id: 'tpl-guest',
      name: 'Khách',
      updatedAt: 1_760_000_500_000,
      rooms: [{ roomId: 'room-kitchen', order: 0, widgets: [] }],
    },
  ];
}

function makeHarness() {
  const templates = makeTemplates();
  const rooms = [
    { id: 'room-living', name: 'Phòng khách', order: 0, icon: 'home-outline' },
    { id: 'room-bedroom', name: 'Phòng ngủ', order: 1, icon: 'bed-outline' },
    { id: 'room-kitchen', name: 'Bếp', order: 2, icon: 'restaurant-outline' },
  ];
  const devices = [
    {
      id: 'sensor-temp-01',
      name: 'Cảm biến nhiệt độ',
      roomId: 'room-living',
      type: 'sensor',
      capabilities: ['temperature'],
      binding: { kind: 'telemetry-sensor' as const },
    },
    {
      id: 'relay-1',
      name: 'Đèn relay-1',
      roomId: 'room-living',
      type: 'relay',
      capabilities: ['switch'],
      binding: { kind: 'relay' as const, index: 1 as const },
    },
  ];
  const capabilities = [
    {
      type: 'temperature',
      label: 'Nhiệt độ',
      kind: 'sensor' as const,
      unit: '°C',
      builtin: true,
    },
    {
      type: 'switch',
      label: 'Công tắc',
      kind: 'switch' as const,
      builtin: true,
    },
  ];

  const dashboardStore = createDashboardStore({
    templates,
    activeId: 'tpl-main',
    activeRoomId: null,
  });
  const devicesStore = create(() => ({
    snapshot: { rooms, devices, capabilities },
  }));
  const telemetryStore = create(() => ({
    connection: 'disconnected' as const,
    lastErrorCode: null,
  }));
  const deviceStateStore = create(() => ({
    values: {} as Record<string, never>,
  }));
  const settingsDraft = {
    mqtt: {
      host: '',
      port: 9001,
      username: '',
      password: '',
      prefix: 'home',
    },
    influx: { url: '', org: '', bucket: '', token: '' },
    ui: { theme: 'light' as const },
  };
  const settingsStore = create(() => ({
    draft: settingsDraft,
    current: settingsDraft,
    errors: {},
    setCurrent: () => undefined,
    applyPersistedUi: () => undefined,
    updateMqtt: () => undefined,
    updateInflux: () => undefined,
    updateUi: () => undefined,
  }));

  const services: WidgetServices = {
    getState: () => undefined,
    getSeries: () => [],
    sendCommand: () => ({
      ok: false as const,
      error: { code: 'unknown' as const, message: 'not wired' },
    }),
    queryHistory: async () => ok([]),
    getRooms: () => rooms,
    getDevices: () => devices,
    getCapabilities: () => capabilities,
    getActiveRoomId: () => dashboardStore.getState().activeRoomId,
    subscribeDeviceState: () => () => undefined,
  };

  let stateTemplates = templates;
  const dashboardService = {
    load: async () => ok(undefined),
    getTemplates: () => stateTemplates,
    getActiveTemplateId: () => 'tpl-main',
    getActiveRoomId: () => dashboardStore.getState().activeRoomId,
    setActiveTemplate: jest.fn(
      async (_id: string): Promise<Result<void>> => ok(undefined),
    ),
    setActiveRoom: async () => ok(undefined),
    renameTemplate: async () => ok(undefined),
    duplicateTemplate: async () => ok(undefined),
    deleteTemplate: async (id: string) => {
      stateTemplates = stateTemplates.filter(template => template.id !== id);
      dashboardStore.setState(state => ({
        templates: state.templates.filter(template => template.id !== id),
        activeId:
          state.activeId === id
            ? state.templates.find(t => t.id !== id)?.id ?? state.activeId
            : state.activeId,
      }));
      return ok(undefined);
    },
    addRoomReference: async () => ok(undefined),
    duplicateRoomReference: async () => ok(undefined),
    reorderRoomReferences: async () => ok(undefined),
    removeRoomReference: async () => ok(undefined),
    applyLayout: async () => ok(undefined),
    applyTemplateLayouts: jest.fn(
      async (
        _templateId: string,
        _layouts: readonly unknown[],
      ): Promise<Result<void>> => ok(undefined),
    ),
    addWidget: async () => ok(undefined),
    duplicateWidgetToRoom: async () => ok(undefined),
    moveWidgetToRoom: async () => ok(undefined),
  };

  const deps = {
    dashboardStore,
    devicesStore,
    telemetryStore,
    deviceStateStore,
    widgetRegistry: createDefaultRegistry(),
    devicesRegistry: {
      getRooms: () => rooms,
      getDevices: () => devices,
      getCapabilities: () => capabilities,
      updateRoom: async () => ok(undefined),
      addRoom: async () => ok(undefined),
      removeRoomWithMigration: async () => ok(undefined),
      addDevice: async () => ok(undefined),
      updateDevice: async () => ok(undefined),
      removeDevice: async () => ok(undefined),
      addCapability: async () => ok(undefined),
      removeDeviceCapability: async () => ok(undefined),
      findDevice: (id: string) => devices.find(d => d.id === id),
    },
    dashboardService,
    settingsStore,
    settingsService: { save: async () => ok(undefined) },
    settingsErrors: {},
    // Demo↔Influx history source selector (the demo toggle's seam).
    historySource: {
      setDemoEnabled: jest.fn(),
      isDemoEnabled: () => false,
    },
    historyAdapter: { query: async () => ok([]) },
    telemetryService: { start: () => undefined, stop: () => undefined },
  };

  return {
    deps: deps as never,
    dashboardService,
    dashboardStore,
    services,
    rooms,
    devices,
    historySource: deps.historySource as {
      setDemoEnabled: jest.Mock;
      isDemoEnabled: () => boolean;
    },
  };
}

/** Route tracker for the focused (top-of-stack) screen. */
function makeRouteTracker() {
  const routeNames: string[] = [];
  const onStateChange = (state: NavigationState | undefined): void => {
    if (!state) {
      return;
    }
    const route = state.routes[state.index];
    if (route) {
      routeNames.push(route.name);
    }
  };
  return { routeNames, onStateChange };
}

/**
 * A minimal PanResponder-compatible event (same recipe as the
 * DashboardGrid tests): `touchHistory` with one active touch whose
 * `currentPageX/Y` is the finger position — the gesture dx/dy are
 * computed against the grant start.
 */
function panEvent(pageX: number, pageY: number, timestamp: number) {
  return {
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          // The PREVIOUS position — PanResponder accumulates dx as
          // (current − previous) centroid of touches changed after the
          // last accounted timestamp.
          previousPageX: 0,
          previousPageY: 0,
          currentPageX: pageX,
          currentPageY: pageY,
          currentTimeStamp: timestamp,
        },
      ],
    },
  };
}

async function renderNavigator(
  harness: ReturnType<typeof makeHarness>,
  onStateChange: (state: NavigationState | undefined) => void,
  navigationRef?: React.RefObject<NavigationContainerRef<
    Record<string, object | undefined>
  > | null>,
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <NavigationContainer ref={navigationRef} onStateChange={onStateChange}>
        <ThemeProvider mode="light">
          <SettingsNavigator deps={harness.deps} services={harness.services} />
        </ThemeProvider>
      </NavigationContainer>,
    );
  });
  return renderer;
}

/** All visible text (flattening nested Text children). */
function visibleText(root: TestRenderer.ReactTestInstance): string {
  const texts: string[] = [];
  const walk = (node: { props?: { children?: unknown } }) => {
    const children = node.props?.children;
    if (typeof children === 'string') {
      texts.push(children);
    } else if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'string') {
          texts.push(child);
        } else if (child && typeof child === 'object') {
          walk(child as { props?: { children?: unknown } });
        }
      }
    } else if (children && typeof children === 'object') {
      walk(children as { props?: { children?: unknown } });
    }
  };
  for (const textNode of root.findAllByType(Text)) {
    walk(textNode as never);
  }
  return texts.join('\n');
}

describe('SettingsNavigator root screen (routeMachine retirement)', () => {
  it('renders the settings root with the management entry + demo toggle', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    // Management entry (opens the hierarchy) + the unchanged rows.
    expect(
      renderer.root.findByProps({ testID: 'settings-open-dashboard-manager' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-open-devices' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-open-advanced' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'settings-demo-history' }),
    ).toBeTruthy();
    // No transition happened yet (root is the initial route).
    expect(tracker.routeNames).toEqual([]);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('opens the management hierarchy from the entry row', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('TemplateList');
    expect(
      renderer.root.findByProps({ testID: 'template-card-tpl-main' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('the Template list has a back affordance to the settings root', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('TemplateList');
    // The back button renders and pops back to the settings root (the
    // "no exit" bug: the hierarchy root previously had no way back).
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-list-back' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('root');
    expect(
      renderer.root.findByProps({ testID: 'settings-open-dashboard-manager' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('navigates to device management and back to root explicitly', async () => {
    const harness = makeHarness();
    const renderer = await renderNavigator(harness, () => undefined);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-devices' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'device-management-back' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'device-management-back' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'settings-open-devices' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('navigates to the advanced screen and back to root explicitly', async () => {
    const harness = makeHarness();
    const renderer = await renderNavigator(harness, () => undefined);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-advanced' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'advanced-settings-back' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'advanced-settings-back' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'settings-open-advanced' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('routes the demo toggle through the history source selector', async () => {
    const harness = makeHarness();
    const renderer = await renderNavigator(harness, () => undefined);
    expect(harness.historySource.setDemoEnabled).not.toHaveBeenCalled();
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-demo-history' })
        .props.onValueChange(true);
    });
    expect(harness.historySource.setDemoEnabled).toHaveBeenCalledTimes(1);
    expect(harness.historySource.setDemoEnabled).toHaveBeenCalledWith(true);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-demo-history' })
        .props.onValueChange(false);
    });
    expect(harness.historySource.setDemoEnabled).toHaveBeenLastCalledWith(
      false,
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('initializes the demo switch from the selector state', async () => {
    const harness = makeHarness();
    harness.historySource.isDemoEnabled = () => true;
    const renderer = await renderNavigator(harness, () => undefined);
    expect(
      renderer.root.findByProps({ testID: 'settings-demo-history' }).props
        .value,
    ).toBe(true);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SettingsNavigator hierarchy progression', () => {
  it('renders Template cards with name, room count and updated copy', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'template-card-tpl-main' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'template-card-tpl-guest' }),
    ).toBeTruthy();
    const text = visibleText(renderer.root);
    expect(text).toContain('Trang chủ');
    expect(text).toContain('2 phòng');
    expect(text).toContain('Cập nhật');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('progresses TemplateList → RoomList → RoomDashboard → EditRoom and back', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });

    // Level 2: the Template's room-card grid.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    expect(tracker.routeNames).toContain('RoomList');
    expect(
      renderer.root.findByProps({ testID: 'room-card-room-living' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'room-card-room-bedroom' }),
    ).toBeTruthy();
    const listText = visibleText(renderer.root);
    // Room-card meta line (user decision 2026-09-05): `X cảm biến ·
    // Y thiết bị` — room-living owns one measurement-only sensor and one
    // switch device; room-bedroom has no devices → the neutral hint.
    expect(listText).toContain('1 cảm biến · 1 thiết bị');
    expect(listText).toContain('Chưa có dữ liệu đo');

    // Level 3: only this room's widget dashboard with the specified header.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    expect(tracker.routeNames).toContain('RoomDashboard');
    expect(
      renderer.root.findByProps({ testID: 'room-dashboard-edit' }),
    ).toBeTruthy();
    const dashText = visibleText(renderer.root);
    expect(dashText).toContain('Phòng khách');
    expect(dashText).toContain('Trang chủ');
    expect(dashText).toContain('Chỉnh sửa');

    // Level 4: the room-scoped editor for exactly this room.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    expect(tracker.routeNames).toContain('EditRoomDashboard');
    expect(
      renderer.root.findByProps({ testID: 'room-edit-cancel' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'room-edit-save' }),
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ testID: 'room-edit-add-widget' }),
    ).toBeTruthy();
    expect(harness.dashboardStore.getState().editMode).toBe(true);
    expect(harness.dashboardStore.getState().editorRoomId).toBe('room-living');

    // Hủy: draft discarded AND back on the room dashboard.
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-cancel' }).props.onPress();
    });
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    expect(harness.dashboardStore.getState().draftWidgets).toBeNull();

    // Deep back one level: RoomDashboard → RoomList.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-back' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('RoomList');
    expect(
      renderer.root.findByProps({ testID: 'room-card-room-bedroom' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('recovers navigation when the ACTIVE Template is deleted', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    // The active Template is deleted through the service (the confirmation
    // dialog path) — the service re-points the selection deterministically
    // and the list re-renders without the deleted card.
    await act(async () => {
      await harness.dashboardService.deleteTemplate('tpl-main');
    });
    expect(harness.dashboardStore.getState().templates.map(t => t.id)).toEqual([
      'tpl-guest',
    ]);
    expect(harness.dashboardStore.getState().activeId).toBe('tpl-guest');
    // The remaining Template is present and navigation still works.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-guest' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('RoomList');
    expect(
      renderer.root.findByProps({ testID: 'room-card-room-kitchen' }),
    ).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SettingsNavigator add-room flow', () => {
  it('CreateRoom lists only rooms NOT already referenced by the Template', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-add-card' }).props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('CreateRoom');
    // The referenced rooms are NOT offered as existing choices.
    expect(
      renderer.root.findAllByProps({
        testID: 'create-room-existing-room-living',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({
        testID: 'create-room-existing-room-bedroom',
      }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SettingsNavigator editor lifecycle (beforeRemove guard)', () => {
  it('a dirty draft blocks a pop until explicit discard; confirm discards + pops', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const navigationRef =
      React.createRef<
        NavigationContainerRef<Record<string, object | undefined>>
      >();
    const renderer = await renderNavigator(
      harness,
      tracker.onStateChange,
      navigationRef,
    );
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('EditRoomDashboard');
    expect(harness.dashboardStore.getState().editMode).toBe(true);

    // Make the draft DIRTY through the real store (route recomputes dirty).
    await act(async () => {
      harness.dashboardStore
        .getState()
        .renameDraftWidget('w-temp', 'Đã đổi tên');
    });

    // A pop attempt (gesture/programmatic equivalent) is PREVENTED.
    await act(async () => {
      navigationRef.current?.dispatch(StackActions.pop());
    });
    expect(tracker.routeNames.at(-1)).toBe('EditRoomDashboard');
    // The explicit discard confirmation is shown.
    expect(
      renderer.root.findByProps({ testID: 'room-edit-discard-confirm' }),
    ).toBeTruthy();

    // Dismiss → stay in the editor, draft ALIVE (nothing persisted).
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-edit-discard-dismiss' })
        .props.onPress();
    });
    expect(harness.dashboardStore.getState().editMode).toBe(true);

    // Confirm → discard the draft, then complete the pop.
    await act(async () => {
      navigationRef.current?.dispatch(StackActions.pop());
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-edit-discard-confirm' })
        .props.onPress();
    });
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    expect(harness.dashboardStore.getState().draftWidgets).toBeNull();
    expect(tracker.routeNames.at(-1)).toBe('RoomDashboard');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('a CLEAN draft pops freely (no confirmation)', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const navigationRef =
      React.createRef<
        NavigationContainerRef<Record<string, object | undefined>>
      >();
    const renderer = await renderNavigator(
      harness,
      tracker.onStateChange,
      navigationRef,
    );
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    expect(harness.dashboardStore.getState().editMode).toBe(true);
    await act(async () => {
      navigationRef.current?.dispatch(StackActions.pop());
    });
    // Popped without any dialog; the clean draft was discarded.
    expect(tracker.routeNames.at(-1)).toBe('RoomDashboard');
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('dirty Hủy is a SINGLE-confirmation flow: discard + pop, no second dialog', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    expect(harness.dashboardStore.getState().editMode).toBe(true);
    // Make the draft dirty, then press Hủy (the same path the Android
    // discard-confirm ends through).
    await act(async () => {
      harness.dashboardStore
        .getState()
        .renameDraftWidget('w-temp', 'Bản nháp bẩn');
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-cancel' }).props.onPress();
    });
    // The route POPPED (the discard flow was not self-blocked)…
    expect(tracker.routeNames.at(-1)).toBe('RoomDashboard');
    // …the draft was discarded without persisting…
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    expect(harness.dashboardStore.getState().draftWidgets).toBeNull();
    // …and NO second discard dialog exists anywhere in the tree.
    expect(
      renderer.root.findAllByProps({ testID: 'room-edit-discard-confirm' }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('the pop-guard confirm ends in the SAME single discard flow (replays the removal)', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const navigationRef =
      React.createRef<
        NavigationContainerRef<Record<string, object | undefined>>
      >();
    const renderer = await renderNavigator(
      harness,
      tracker.onStateChange,
      navigationRef,
    );
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    await act(async () => {
      harness.dashboardStore
        .getState()
        .renameDraftWidget('w-temp', 'Bản nháp bẩn');
    });
    // The prevented removal (swipe-back equivalent)…
    await act(async () => {
      navigationRef.current?.dispatch(StackActions.pop());
    });
    expect(tracker.routeNames.at(-1)).toBe('EditRoomDashboard');
    // …confirm ONCE → the removal replays and completes.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-edit-discard-confirm' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('RoomDashboard');
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    // Exactly one confirmation: no residual dialog after the pop.
    expect(
      renderer.root.findAllByProps({ testID: 'room-edit-discard-confirm' }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('Save is route-scoped: a stale draft from another scope is REJECTED', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    // Simulate a stale draft: the store's draft scope no longer matches the
    // route (e.g. leftover from another Template/room).
    await act(async () => {
      harness.dashboardStore.setState({
        editorTemplateId: 'tpl-guest',
        editorRoomId: 'room-kitchen',
      });
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    // The service commit seam was NEVER called (nothing persisted anywhere).
    expect(
      harness.dashboardService.applyTemplateLayouts,
    ).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('Save on the matching scope commits through applyTemplateLayouts', async () => {
    const harness = makeHarness();
    const renderer = await renderNavigator(harness, () => undefined);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    expect(harness.dashboardService.applyTemplateLayouts).toHaveBeenCalledTimes(
      1,
    );
    // After a successful Save the draft mirrors the persisted layout (the
    // editor stays open in a CLEAN state; exit is via Hủy/back).
    expect(harness.dashboardStore.getState().editMode).toBe(true);
    const template = harness.dashboardStore
      .getState()
      .templates.find(t => t.id === 'tpl-main')!;
    expect(JSON.stringify(harness.dashboardStore.getState().draftWidgets)).toBe(
      JSON.stringify(template.rooms.flatMap(room => room.widgets)),
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('L integration: a drag released on an OCCUPIED cell swaps through the REAL store and persists ONLY on Save', async () => {
    const harness = makeHarness();
    const renderer = await renderNavigator(harness, () => undefined);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-main' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-card-room-living' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'room-dashboard-edit' })
        .props.onPress();
    });

    // Differing spans, DRAFT-level (setDraftWidgets is the store's own
    // atomic draft seam): w-fan a 2x1 at (0,1), w-light a 1x1 at (0,2) —
    // a valid swap must respect BOTH resulting placements.
    const current = harness.dashboardStore.getState().draftWidgets!;
    await act(async () => {
      harness.dashboardStore.getState().setDraftWidgets([
        current.find(w => w.id === 'w-temp')!,
        {
          id: 'w-fan',
          type: 'switch',
          roomId: 'room-living',
          binding: { deviceId: 'relay-1', capability: 'switch' },
          layout: { x: 0, y: 1, width: 2, height: 1 },
        },
        {
          ...current.find(w => w.id === 'w-light')!,
          layout: { x: 0, y: 2, width: 1, height: 1 },
        },
      ]);
    });

    // The DEVICES section grid (layoutYOffset 1 = the switches' base row).
    const deviceGrid = renderer.root.find(
      node =>
        node.props.layoutYOffset === 1 &&
        typeof node.props.onSwapWidgets === 'function',
    );
    const metrics = deviceGrid.props.metrics as {
      readonly rowHeight: number;
      readonly gap: number;
    };
    const rowStep = metrics.rowHeight + metrics.gap;
    // Draft order → the devices group renders w-fan first.
    const responder = deviceGrid.findAll(
      node => typeof node.props.onResponderMove === 'function',
    )[0]!;
    await act(async () => {
      // PanResponder initializes its gesture accumulator on the START
      // handler — grant/move assume it ran.
      responder.props.onStartShouldSetResponderCapture({
        nativeEvent: { touches: [{}] },
        touchHistory: panEvent(0, 0, 0).touchHistory,
      });
      responder.props.onResponderGrant(panEvent(0, 0, 1));
      // Drag w-fan ONE ROW DOWN onto w-light's OCCUPIED cell, and release.
      responder.props.onResponderMove(panEvent(0, rowStep, 2));
      responder.props.onResponderRelease(panEvent(0, rowStep, 3));
    });

    // NOTHING persisted before Save — the release-through-grid swap only
    // mutated the in-memory draft.
    expect(
      harness.dashboardService.applyTemplateLayouts,
    ).not.toHaveBeenCalled();
    const draft = harness.dashboardStore.getState().draftWidgets!;
    // The EXCHANGE respected both spans: w-fan keeps its 2x1 at w-light's
    // old row; w-light took w-fan's old origin. Bindings stay on their own
    // widget (the store swaps ORIGINS only).
    expect(draft.find(w => w.id === 'w-fan')!.layout).toEqual({
      x: 0,
      y: 2,
      width: 2,
      height: 1,
    });
    expect(draft.find(w => w.id === 'w-light')!.layout).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    expect(draft.find(w => w.id === 'w-fan')!.binding).toEqual({
      deviceId: 'relay-1',
      capability: 'switch',
    });

    // Atomic Save: the WHOLE draft end-state commits through the ONE
    // service seam, with the exchanged positions.
    await act(async () => {
      renderer.root.findByProps({ testID: 'room-edit-save' }).props.onPress();
    });
    expect(harness.dashboardService.applyTemplateLayouts).toHaveBeenCalledTimes(
      1,
    );
    const layouts = (
      harness.dashboardService.applyTemplateLayouts.mock
        .calls[0]![1] as readonly {
        roomId: string;
        widgets: readonly {
          id: string;
          layout: { x: number; y: number; width: number; height: number };
        }[];
      }[]
    ).find(l => l.roomId === 'room-living')!;
    expect(layouts.widgets.find(w => w.id === 'w-fan')!.layout).toEqual({
      x: 0,
      y: 2,
      width: 2,
      height: 1,
    });
    expect(layouts.widgets.find(w => w.id === 'w-light')!.layout).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    });
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SettingsNavigator active-Template selection failure', () => {
  it('a storage failure keeps the route and surfaces the real error', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    harness.dashboardService.setActiveTemplate = jest.fn(
      async (_id: string): Promise<Result<void>> =>
        err(Errors.unknown('storage down')),
    );
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('TemplateList');
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-guest' })
        .props.onPress();
    });
    // NO navigation happened; the actual service error is visible.
    expect(tracker.routeNames.at(-1)).toBe('TemplateList');
    const text = visibleText(renderer.root);
    expect(text).toContain('storage down');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('a successful selection navigates to the room list', async () => {
    const harness = makeHarness();
    const tracker = makeRouteTracker();
    const renderer = await renderNavigator(harness, tracker.onStateChange);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-dashboard-manager' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'template-card-tpl-guest' })
        .props.onPress();
    });
    expect(tracker.routeNames.at(-1)).toBe('RoomList');
    expect(harness.dashboardService.setActiveTemplate).toHaveBeenCalledWith(
      'tpl-guest',
    );
    await act(async () => {
      renderer.unmount();
    });
  });
});
