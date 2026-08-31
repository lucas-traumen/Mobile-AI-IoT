/**
 * CP-R2 tests — the Settings tab navigation state machine + coordinator
 * wiring (fix cycle 1).
 *
 * `navigateSettings` is a pure function, so the transition rules are tested
 * without React: from `root` any nested screen can be opened; every nested
 * screen can only go back to `root`; once inside a nested screen, opening
 * the other nested screen directly is ignored (no skipping between
 * siblings).
 *
 * Component-level wiring tests (react-test-renderer):
 * - the device-management screen has an explicit back path to root;
 * - the dashboard editor's back button leaves to root AND discards any
 *   open draft;
 * - an open draft is cleaned up when the coordinator unmounts (tab leave)
 *   — no orphan editor state survives.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { create } from 'zustand';
import { ok } from '@core/errors';
import { ThemeProvider } from '@core/theme';
import { createDefaultRegistry } from '@modules/widgets/api';
import { createDashboardStore } from '@modules/dashboard/internal/ui/dashboardStore';
import { defaultDashboardsFile } from '@modules/dashboard/internal/domain/seeds';
import type { WidgetServices } from '@modules/widgets/api';

import { SettingsCoordinator } from './SettingsCoordinator';
import { navigateSettings, type SettingsRoute } from './routeMachine';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

describe('navigateSettings', () => {
  it('opens a nested management screen from root', () => {
    const root: SettingsRoute = { name: 'root' };
    expect(navigateSettings(root, 'device-management')).toEqual({
      name: 'device-management',
    });
    expect(navigateSettings(root, 'dashboard-editor')).toEqual({
      name: 'dashboard-editor',
    });
  });

  it('returns to root from any nested screen', () => {
    expect(navigateSettings({ name: 'device-management' }, 'root')).toEqual({
      name: 'root',
    });
    expect(navigateSettings({ name: 'dashboard-editor' }, 'root')).toEqual({
      name: 'root',
    });
  });

  it('ignores sibling switches while inside a nested screen', () => {
    const current: SettingsRoute = { name: 'device-management' };
    expect(navigateSettings(current, 'dashboard-editor')).toBe(current);
    expect(
      navigateSettings({ name: 'dashboard-editor' }, 'device-management'),
    ).toEqual({ name: 'dashboard-editor' });
  });

  it('keeps root unchanged when root is the target', () => {
    const root: SettingsRoute = { name: 'root' };
    expect(navigateSettings(root, 'root')).toEqual({ name: 'root' });
  });
});

/** Build the coordinator deps stub (real dashboard store + pure registry). */
function makeCoordinatorHarness() {
  const rooms = [
    { id: 'room-living', name: 'Phòng khách', order: 0, icon: 'home-outline' },
  ];
  const devicesStore = create(() => ({
    snapshot: { rooms, devices: [], capabilities: [] },
  }));
  const dashboardStore = createDashboardStore(defaultDashboardsFile());
  const telemetryStore = create(() => ({
    connection: 'idle' as const,
    lastErrorCode: null,
  }));
  const settingsStore = create(() => ({
    draft: {
      mqtt: {
        host: '',
        port: 9001,
        username: '',
        password: '',
        prefix: 'home',
      },
      influx: { url: '', org: '', bucket: '', token: '' },
      ui: { theme: 'system' as const },
    },
    errors: {},
  }));

  const services: WidgetServices = {
    getState: () => undefined,
    getSeries: () => [],
    sendCommand: () => ({
      ok: false as const,
      error: { code: 'unknown' as const, message: 'not wired' },
    }),
    queryHistory: async () => ok([]),
    getConnection: () => ({ state: 'idle', label: 'MQTT' }),
    getRooms: () => rooms,
    getDevices: () => [],
    getCapabilities: () => [],
    getActiveRoomId: () => dashboardStore.getState().activeRoomId,
    subscribeDeviceState: () => () => undefined,
  };

  const deps = {
    settingsStore,
    devicesStore,
    dashboardStore,
    telemetryStore,
    widgetRegistry: createDefaultRegistry(),
    devicesRegistry: {
      getRooms: () => rooms,
      getDevices: () => [],
      getCapabilities: () => [],
      addRoom: async () => ok(undefined),
      updateRoom: async () => ok(undefined),
      removeRoomWithMigration: async () => ok(undefined),
      addDevice: async () => ok(undefined),
      updateDevice: async () => ok(undefined),
      removeDevice: async () => ok(undefined),
      addCapability: async () => ok(undefined),
      removeCapability: async () => ok(undefined),
    },
    dashboardService: {
      createDashboard: async () => ok(undefined),
      addWidget: async () => ok(undefined),
      applyLayout: async () => ok(undefined),
      setActiveDashboard: async () => ok(undefined),
      setActiveRoom: async () => ok(undefined),
      getActiveRoomId: () => dashboardStore.getState().activeRoomId,
    },
    settingsService: {
      save: async () => ok(undefined),
    },
  };

  return { deps: deps as never, dashboardStore, services };
}

describe('SettingsCoordinator wiring (fix cycle 1)', () => {
  it('navigates to device management and back to root explicitly', async () => {
    const harness = makeCoordinatorHarness();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });

    // Root → device management.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-devices' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'device-management-back' }),
    ).toBeTruthy();

    // Explicit back → root screen again.
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

  it('cleans up an orphan draft when the coordinator unmounts', async () => {
    const harness = makeCoordinatorHarness();
    // An open draft must not survive the Settings tab unmounting.
    harness.dashboardStore.getState().enterEdit('main', 'room-living');
    expect(harness.dashboardStore.getState().editMode).toBe(true);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      renderer.unmount();
    });

    expect(harness.dashboardStore.getState().editMode).toBe(false);
    expect(harness.dashboardStore.getState().draftWidgets).toBeNull();
  });

  it('editor back button leaves to root and discards the open draft', async () => {
    const harness = makeCoordinatorHarness();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });

    // Root → dashboard editor.
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-editor' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'dashboard-editor-back' }),
    ).toBeTruthy();

    // Open a draft, then leave via the editor's back button. The store
    // write drives a zustand subscription → re-render, so it must run
    // inside act (no React act console warnings allowed).
    await act(async () => {
      harness.dashboardStore.getState().enterEdit('main', 'room-living');
    });
    expect(harness.dashboardStore.getState().editMode).toBe(true);
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-editor-back' })
        .props.onPress();
    });

    // Back at root AND the draft was discarded (no orphan editor state).
    expect(
      renderer.root.findByProps({ testID: 'settings-open-editor' }),
    ).toBeTruthy();
    expect(harness.dashboardStore.getState().editMode).toBe(false);
    expect(harness.dashboardStore.getState().draftWidgets).toBeNull();
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('SettingsCoordinator dashboard deletion (fix cycle 2)', () => {
  /** Harness with TWO dashboards (deletion requires >1). */
  function makeTwoDashboardHarness() {
    const harness = makeCoordinatorHarness();
    const file = defaultDashboardsFile();
    harness.dashboardStore.setState({
      dashboards: [
        ...file.dashboards,
        { id: 'dash-2', name: 'Phòng chơi', widgets: [] },
      ],
    });
    const deleteSpy = jest.fn(async () => {
      harness.dashboardStore.setState(state => ({
        dashboards: state.dashboards.filter(d => d.id !== 'dash-2'),
        activeId: state.activeId === 'dash-2' ? 'main' : state.activeId,
      }));
      return ok(undefined);
    });
    (
      harness.deps as unknown as { dashboardService: Record<string, unknown> }
    ).dashboardService.deleteDashboard = deleteSpy;
    return { harness, deleteSpy };
  }

  it('deletes via a confirmation and closes the dialog on success', async () => {
    const { harness, deleteSpy } = makeTwoDashboardHarness();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-editor' })
        .props.onPress();
    });

    // Two dashboards → the delete affordance exists for the second one.
    const deleteButton = renderer.root.findByProps({
      testID: 'dashboard-delete-dash-2',
    });
    await act(async () => {
      deleteButton.props.onPress();
    });
    // Confirmation dialog is open.
    expect(
      renderer.root.findByProps({ testID: 'dashboard-delete-confirm' }),
    ).toBeTruthy();

    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-delete-confirm' })
        .props.onPress();
    });

    expect(deleteSpy).toHaveBeenCalledWith('dash-2');
    // Dialog closed after success.
    expect(
      renderer.root.findAllByProps({ testID: 'dashboard-delete-confirm' }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the dialog open and surfaces the error on failure', async () => {
    const { harness } = makeTwoDashboardHarness();
    const deleteSpy = jest.fn(async () => ({
      ok: false as const,
      error: {
        code: 'validation' as const,
        message: 'Cannot delete the last dashboard',
      },
    }));
    (
      harness.deps as unknown as { dashboardService: Record<string, unknown> }
    ).dashboardService.deleteDashboard = deleteSpy;
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-editor' })
        .props.onPress();
    });

    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-delete-dash-2' })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-delete-confirm' })
        .props.onPress();
    });

    // Failure: service was called, dialog STAYS open, error is surfaced.
    expect(deleteSpy).toHaveBeenCalledWith('dash-2');
    expect(
      renderer.root.findByProps({ testID: 'dashboard-delete-confirm' }),
    ).toBeTruthy();
    const texts: string[] = [];
    const walk = (node: TestRenderer.ReactTestInstance) => {
      if (typeof node.props.children === 'string') {
        texts.push(node.props.children);
      }
      for (const child of node.children) {
        if (typeof child === 'object') {
          walk(child as TestRenderer.ReactTestInstance);
        }
      }
    };
    walk(renderer.root);
    expect(texts.join('\n')).toContain('Cannot delete the last dashboard');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('offers no deletion for a single dashboard and none while a draft is open', async () => {
    const harness = makeCoordinatorHarness();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider mode="light">
          <SettingsCoordinator
            deps={harness.deps}
            services={harness.services}
          />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'settings-open-editor' })
        .props.onPress();
    });

    // Single dashboard → no delete affordance at all.
    expect(
      renderer.root.findAllByProps({ testID: 'dashboard-delete-main' }),
    ).toHaveLength(0);

    // Open a draft → still none (deletion never runs mid-draft).
    await act(async () => {
      harness.dashboardStore.getState().enterEdit('main', 'room-living');
    });
    expect(
      renderer.root.findAllByProps({ testID: 'dashboard-delete-main' }),
    ).toHaveLength(0);
    await act(async () => {
      renderer.unmount();
    });
  });
});
