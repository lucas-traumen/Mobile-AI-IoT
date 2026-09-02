/**
 * App-level regression tests (fix cycle 1).
 *
 * 1. Provider-order smoke: the whole App tree renders without throwing —
 *    `ThemedStatusBar` (which calls `useTheme`) must live INSIDE the
 *    `ThemeProvider`; the previous order crashed at startup with
 *    "useTheme must be used inside a ThemeProvider".
 * 2. Active-room History requery wiring: switching the room on the History
 *    screen must update the shared active room AND run the guarded history
 *    request path for the new room; a sensor-less room short-circuits
 *    through `beginRequest` (series cleared, no HTTP call, stale cards
 *    gone).
 *
 * The composition root is mocked with lightweight fakes (the factory is
 * self-contained because jest hoists jest.mock above the test body); pure
 * stores (history/device-state) and the widget registry are the REAL ones
 * so the wiring is exercised end-to-end at the seam.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { create as mockCreate } from 'zustand';
import { ok as mockOk } from '@core/errors';
import { defaultSettings as mockDefaultSettings } from '@modules/settings/api';
import { createHistoryStore as mockCreateHistoryStore } from '@modules/history/api';
import { createDeviceStateStore as mockCreateDeviceStateStore } from '@modules/devices/api';
import { createDefaultRegistry as mockCreateDefaultRegistry } from '@modules/widgets/api';

import App from '../../App';
import * as containerModule from './wiring/container';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

/**
 * Font seam: the Inter google-font package loads assets through expo-font
 * (async, native-backed). The App render gate waits for it, so the tests
 * mock it as instantly-loaded with stub font sources.
 */
jest.mock('@expo-google-fonts/inter', () => ({
  __esModule: true,
  useFonts: () => [true, null],
  Inter_300Light: 'Inter_300Light',
  Inter_400Regular: 'Inter_400Regular',
  Inter_600SemiBold: 'Inter_600SemiBold',
}));

/**
 * Safe-area seam: the real `SafeAreaProvider` renders children only after
 * the native inset event fires, which never happens under react-test-renderer
 * (no native layout). The provider is mocked as a passthrough with zero
 * insets so these tests keep exercising App's own logic (bootstrap race,
 * tab switching, history flow) with every original assertion unchanged.
 */
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { readonly children: React.ReactNode }) =>
    children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Shape of the test handle the container mock factory exposes. */
interface ContainerTestHandle {
  ensure(): {
    stores: {
      dashboardStore: { getState(): { activeRoomId: string | null } };
      historyStore: {
        getState(): {
          series: readonly { deviceId: string | null; field: string }[];
          loading: boolean;
        };
      };
    };
    spies: { query: jest.Mock; setActiveRoom: jest.Mock };
  };
}

/** Reach the factory-exposed handle through the mocked module namespace. */
const handle = () =>
  (
    containerModule as unknown as { __handle: ContainerTestHandle }
  ).__handle.ensure();

interface RaceHandle {
  deps: never;
  stores: {
    dashboardStore: { getState(): { activeRoomId: string | null } };
    devicesStore: { getState(): { snapshot: { rooms: { id: string }[] } } };
  };
  spies: { setActiveRoom: jest.Mock };
  resolveDevices: () => void;
}

/** Build the bootstrap-race scenario (fix cycle 2) and point App at it. */
const raceHandle = (
  persistedRoomIds: string[],
  persistedActiveRoomId: string,
): RaceHandle => {
  const handleNamespace = containerModule as unknown as {
    __handle: {
      makeRaceDeps: (
        rooms: { id: string; name: string }[],
        persistedActiveRoomId: string,
      ) => RaceHandle;
      useRaceDeps: (race: RaceHandle) => void;
    };
  };
  const scenario = handleNamespace.__handle.makeRaceDeps(
    persistedRoomIds.map(id => ({ id, name: id })),
    persistedActiveRoomId,
  );
  handleNamespace.__handle.useRaceDeps(scenario);
  return scenario;
};

jest.mock('./wiring/container', () => {
  const create = mockCreate;
  const ok = mockOk;
  const defaultSettings = mockDefaultSettings;
  const createHistoryStore = mockCreateHistoryStore;
  const createDeviceStateStore = mockCreateDeviceStateStore;
  const createDefaultRegistry = mockCreateDefaultRegistry;

  const query = jest.fn(async (q: { deviceIds: readonly string[] }) => {
    if (q.deviceIds.includes('sensor-01')) {
      return ok([
        {
          deviceId: 'sensor-01',
          field: 'temperature',
          points: [
            { t: 1000, value: 25 },
            { t: 2000, value: 26 },
          ],
        },
      ]);
    }
    return ok([]);
  });

  const makeDeps = () => {
    const rooms = [
      { id: 'room-a', name: 'Phòng A', order: 0, icon: 'home-outline' },
      { id: 'room-b', name: 'Phòng B', order: 1, icon: 'bed-outline' },
    ];
    const devices = [
      {
        id: 'sensor-01',
        name: 'Cảm biến A',
        roomId: 'room-a',
        type: 'sensor',
        capabilities: ['temperature'],
        binding: { kind: 'telemetry-sensor' as const },
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
    ];

    // Real-state-shape stores for the fields App + screens read.
    const dashboardStore = create(() => ({
      dashboards: [{ id: 'dash-1', name: 'Nhà', widgets: [] }],
      activeId: 'dash-1',
      activeRoomId: 'room-a',
      editMode: false,
      draftWidgets: null,
      editorRoomId: null,
    }));
    const setActiveRoom = jest.fn(async (roomId: string) => {
      dashboardStore.setState({ activeRoomId: roomId });
      return ok(undefined);
    });
    const devicesStore = create(() => ({
      snapshot: { rooms, devices, capabilities },
    }));
    const settingsStore = create(() => ({
      current: defaultSettings(),
      draft: defaultSettings(),
      errors: {},
      setCurrent: () => undefined,
      updateMqtt: () => undefined,
      updateInflux: () => undefined,
      updateUi: () => undefined,
    }));
    const telemetryStore = create(() => ({
      connection: 'disconnected' as const,
      lastErrorCode: null,
    }));
    const historyStore = createHistoryStore();

    return {
      stores: { dashboardStore, historyStore },
      spies: { query, setActiveRoom },
      deps: {
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
          debug: () => undefined,
        },
        bus: { subscribe: () => () => undefined, emit: () => undefined },
        clock: { nowMillis: () => 0, setTimeout: () => () => undefined },
        settingsService: {
          load: async () => ok(defaultSettings()),
          save: async () => ok(undefined),
          onChanged: () => () => undefined,
        },
        settingsStore,
        mqttClient: { onMessage: () => undefined },
        telemetryService: {
          start: () => undefined,
          stop: () => undefined,
          applyConfig: () => undefined,
        },
        telemetryStore,
        relayService: {
          applyPrefix: () => undefined,
          startFeedbackListener: () => undefined,
          handleFeedbackMessage: () => undefined,
          publish: async () => ok(undefined),
        },
        relayStore: create(() => ({})),
        historyAdapter: { configure: () => undefined, query },
        // The demo↔Influx selector front door (same query spy — App routes
        // every history query through it).
        historySource: { query },
        historyStore,
        devicesRepository: {},
        devicesRegistry: {
          load: async () => ok(undefined),
          getRooms: () => rooms,
          getDevices: () => devices,
          getCapabilities: () => capabilities,
          findDevice: (id: string) => devices.find(d => d.id === id),
        },
        devicesStore,
        deviceStateStore: createDeviceStateStore(),
        deviceStateSync: { start: () => undefined, stop: () => undefined },
        deviceCommandService: { sendCommand: async () => ok(undefined) },
        widgetRegistry: createDefaultRegistry(),
        dashboardRepository: {},
        dashboardService: {
          load: async () => ok(undefined),
          getActiveRoomId: () => dashboardStore.getState().activeRoomId,
          setActiveDashboard: async () => ok(undefined),
          setActiveRoom,
        },
        dashboardStore,
      },
    };
  };

  let cached: ReturnType<typeof makeDeps> | null = null;
  const ensure = () => {
    if (!cached) {
      cached = makeDeps();
    }
    return cached;
  };

  /**
   * Fix cycle 2 — bootstrap active-room race scenario: the dashboard file
   * loads immediately (its persisted active room becomes visible) while the
   * DEVICES registry load is deferred (the registry still shows the seed
   * snapshot). Readiness must wait for the devices load; the fallback must
   * never run against the seed snapshot.
   */
  const makeRaceDeps = (
    persistedRooms: { id: string; name: string }[],
    persistedActiveRoomId: string,
  ) => {
    const seedRooms = [
      { id: 'room-seed', name: 'Seed', order: 0, icon: 'home-outline' },
    ];
    const persistedCapabilities = [
      {
        type: 'temperature',
        label: 'Nhiệt độ',
        kind: 'sensor' as const,
        unit: '°C',
        builtin: true,
      },
    ];
    const dashboardStore = create(() => ({
      dashboards: [{ id: 'dash-seed', name: 'Nhà', widgets: [] }],
      activeId: 'dash-seed',
      activeRoomId: 'room-seed' as string | null,
      editMode: false,
      draftWidgets: null,
      editorRoomId: null,
    }));
    const setActiveRoom = jest.fn(async (roomId: string) => {
      dashboardStore.setState({ activeRoomId: roomId });
      return ok(undefined);
    });
    const devicesStore = create(() => ({
      snapshot: {
        rooms: seedRooms,
        devices: [] as { id: string; name: string }[],
        capabilities: [] as {
          type: string;
          label: string;
          kind: 'sensor' | 'relay';
          unit: string;
          builtin: boolean;
        }[],
      },
    }));
    const telemetryStore = create(() => ({
      connection: 'idle' as const,
      lastErrorCode: null,
    }));
    const settingsStore = create(() => ({
      current: defaultSettings(),
      draft: defaultSettings(),
      errors: {},
      setCurrent: () => undefined,
      updateMqtt: () => undefined,
      updateInflux: () => undefined,
      updateUi: () => undefined,
    }));

    let resolveDevices!: () => void;
    const devicesLoaded = new Promise<void>(resolve => {
      resolveDevices = resolve;
    });

    const deps = {
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      bus: { subscribe: () => () => undefined, emit: () => undefined },
      clock: { nowMillis: () => 0, setTimeout: () => () => undefined },
      settingsService: {
        load: async () => ok(defaultSettings()),
        save: async () => ok(undefined),
        onChanged: () => () => undefined,
      },
      settingsStore,
      mqttClient: { onMessage: () => undefined },
      telemetryService: {
        start: () => undefined,
        stop: () => undefined,
        applyConfig: () => undefined,
      },
      telemetryStore,
      relayService: {
        applyPrefix: () => undefined,
        startFeedbackListener: () => undefined,
        handleFeedbackMessage: () => undefined,
        publish: async () => ok(undefined),
      },
      relayStore: create(() => ({})),
      historyAdapter: { configure: () => undefined, query },
      historySource: { query },
      historyStore: createHistoryStore(),
      devicesRepository: {},
      devicesRegistry: {
        // Deferred persisted load: applies the persisted rooms when the
        // test releases it.
        load: () =>
          devicesLoaded.then(() => {
            devicesStore.setState({
              snapshot: {
                rooms: persistedRooms.map((room, index) => ({
                  ...room,
                  order: index,
                  icon: 'home-outline',
                })),
                devices: [],
                capabilities: persistedCapabilities,
              },
            });
            return ok(undefined);
          }),
        getRooms: () => devicesStore.getState().snapshot.rooms,
        getDevices: () => devicesStore.getState().snapshot.devices,
        getCapabilities: () => devicesStore.getState().snapshot.capabilities,
        findDevice: () => undefined,
      },
      devicesStore,
      deviceStateStore: createDeviceStateStore(),
      deviceStateSync: { start: () => undefined, stop: () => undefined },
      deviceCommandService: { sendCommand: async () => ok(undefined) },
      widgetRegistry: createDefaultRegistry(),
      dashboardRepository: {},
      dashboardService: {
        // The dashboard file load completes immediately and re-points the
        // active room to the persisted value.
        load: async () => {
          dashboardStore.setState({
            dashboards: [{ id: 'dash-x', name: 'X', widgets: [] }],
            activeId: 'dash-x',
            activeRoomId: persistedActiveRoomId,
          });
          return ok(undefined);
        },
        getActiveRoomId: () => dashboardStore.getState().activeRoomId,
        setActiveDashboard: async () => ok(undefined),
        setActiveRoom,
      },
      dashboardStore,
    };

    return {
      deps: deps as never,
      stores: { dashboardStore, devicesStore },
      spies: { setActiveRoom },
      resolveDevices,
    };
  };

  // Point the cached container at a race scenario so buildContainer()
  // (which App consumes) hands the race deps to the component.
  const useRaceDeps = (race: RaceHandle) => {
    cached = race as unknown as ReturnType<typeof makeDeps>;
  };

  return {
    __handle: { ensure, makeRaceDeps, useRaceDeps },
    // App.tsx binds `deps` at module scope, so the container must be a
    // lazy proxy: every property access resolves against the CURRENT
    // cached deps, letting the race tests swap the scenario underneath.
    buildContainer: (): ReturnType<typeof mockCreate> =>
      new Proxy({} as Record<string | symbol, unknown>, {
        get: (_target, prop) =>
          (ensure().deps as Record<string | symbol, unknown>)[prop],
      }) as unknown as ReturnType<typeof mockCreate>,
  };
});

describe('App (fix cycle 1 regressions)', () => {
  it('renders the whole tree without a provider-order crash', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    let thrown: unknown = null;
    await act(async () => {
      try {
        renderer = TestRenderer.create(<App />);
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBeNull();
    // The tab bar rendered (three tabs) — the tree mounted fully.
    expect(renderer.root.findByProps({ testID: 'tab-dashboard' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'tab-history' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'tab-settings' })).toBeTruthy();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('re-queries history (guarded) when the active room changes', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    const { stores, spies } = handle();

    // Switch to the History tab.
    await act(async () => {
      renderer.root.findByProps({ testID: 'tab-history' }).props.onPress();
    });

    // Initial mount query for the active room (room-a → sensor-01 series).
    await act(async () => {
      await Promise.resolve();
    });
    expect(spies.query).toHaveBeenCalledTimes(1);
    expect(stores.historyStore.getState().series).toHaveLength(1);
    expect(stores.historyStore.getState().series[0].deviceId).toBe('sensor-01');

    // Switch the room to room-b (no sensor device). The History tab's room
    // row is the shared RoomSelector → its chip testIDs (`dashboard-room-*`).
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'dashboard-room-chip-room-b' })
        .props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The shared active room was updated AND the guarded request path ran:
    // the sensor-less room short-circuits (series cleared, no HTTP query —
    // the stale series from room-a must not survive).
    expect(spies.setActiveRoom).toHaveBeenCalledWith('room-b');
    expect(spies.query).toHaveBeenCalledTimes(1);
    expect(stores.historyStore.getState().series).toEqual([]);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('App bootstrap active-room race (fix cycle 2)', () => {
  it('waits for persisted loads and reuses a valid persisted active room', async () => {
    const scenario = raceHandle(['room-x'], 'room-x');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    // Flush settings + dashboard loads; the devices load stays deferred.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // NOT ready yet (the devices registry is still loading)…
    expect(
      renderer.root.findAllByProps({ testID: 'tab-dashboard' }),
    ).toHaveLength(0);
    // …and the persisted active room was NOT overwritten by a seed fallback.
    expect(scenario.spies.setActiveRoom).not.toHaveBeenCalled();

    // Release the persisted devices load.
    await act(async () => {
      scenario.resolveDevices();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Ready now; the valid persisted active room is REUSED (no fallback
    // write ever happened — the seed room never overwrote it).
    expect(renderer.root.findByProps({ testID: 'tab-dashboard' })).toBeTruthy();
    expect(scenario.spies.setActiveRoom).not.toHaveBeenCalled();
    expect(scenario.stores.dashboardStore.getState().activeRoomId).toBe(
      'room-x',
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('runs the fallback once against the PERSISTED registry, not the seed', async () => {
    // Persisted active room "room-gone" no longer exists among the
    // persisted rooms ("room-y") — the fallback must fire exactly once,
    // after the loads complete, with the persisted first room.
    const scenario = raceHandle(['room-y'], 'room-gone');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(scenario.spies.setActiveRoom).not.toHaveBeenCalled();

    await act(async () => {
      scenario.resolveDevices();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scenario.spies.setActiveRoom).toHaveBeenCalledTimes(1);
    expect(scenario.spies.setActiveRoom).toHaveBeenCalledWith('room-y');
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('Qwen tester blockers (exception fix)', () => {
  it('history screen never renders raw comment prose (blocker 1)', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'tab-history' }).props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const texts: string[] = [];
    const walk = (node: TestRenderer.ReactTestInstance) => {
      const children = node.props.children;
      if (typeof children === 'string') {
        texts.push(children);
      } else if (Array.isArray(children)) {
        for (const entry of children) {
          if (typeof entry === 'string') {
            texts.push(entry);
          }
        }
      }
      for (const child of node.children) {
        if (typeof child === 'object') {
          walk(child as TestRenderer.ReactTestInstance);
        }
      }
    };
    walk(renderer.root);
    const all = texts.join('\n');

    expect(all).not.toContain('Cards are hidden');
    expect(all).not.toContain('stale series from the previously selected');
    await act(async () => {
      renderer.unmount();
    });
  });
});
