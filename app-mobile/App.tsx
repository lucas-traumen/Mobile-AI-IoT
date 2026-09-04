/**
 * App root — composition root bootstrap + tab shell + MQTT lifecycle.
 *
 * Wires the dashboard/devices feature (V2 + CP-R recovery) on top of the
 * existing telemetry/relay/history/settings modules:
 * - ThemeProvider driven by the persisted settings theme mode; the status
 *   bar follows the effective theme (CP-R6).
 * - bootstrap loads devices + dashboards, starts DeviceStateSync and reacts
 *   to `devices:changed` (cascade removeWidgetsForDevice).
 * - WidgetServices implementation (live state, series, commands, history,
 *   connection) provided to the dashboard grid; widgets subscribe reactively
 *   through `subscribeDeviceState` (CP-R1).
 * - 3-tab shell (CP-R2): Dashboard / Lịch sử / Cài đặt. Dashboard is
 *   view-only; every mutation lives under Settings (SettingsCoordinator).
 * - One shared active room (CP-R3): Dashboard and History both read the
 *   dashboard module's persisted active room; a deleted/missing selection
 *   falls back to the first ordered room.
 * - History queries carry a HistoryQuery value object (CP-R5) with a
 *   stale-request guard in the history store.
 * - Inter fonts (M2) load at the root via `useFonts`; the render gate
 *   waits for bootstrap loads AND fonts before the first frame.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';

import { defaultSettings, type AppSettings } from '@modules/settings/api';
import type { MqttConnectionConfig } from '@modules/telemetry/api';
import { mqttConnectionLabel } from '@core/i18n';
import {
  INTER_LIGHT,
  INTER_REGULAR,
  INTER_SEMIBOLD,
  ThemeProvider,
  useTheme,
} from '@core/theme';
import type { HistoryQuery, HistoryRange } from '@modules/history/api';
import { historyQueryForRoom, sensorFieldsForRoom } from '@modules/history/api';
import { HistoryScreen } from '@modules/history/ui/HistoryScreen';
import { DashboardScreen } from '@modules/dashboard/ui/DashboardScreen';
import type { WidgetServices } from '@modules/widgets/api';
import type { CapabilityType } from '@modules/devices/api';

import { TabShell, type TabKey } from './src/app/shell/TabShell';
import { SettingsCoordinator } from './src/app/settings/SettingsCoordinator';
import { buildContainer } from './src/app/wiring/container';

/** Application singletons — created once at module load (composition root). */
const deps = buildContainer();

function toMqttConfig(settings: AppSettings): MqttConnectionConfig {
  return {
    host: settings.mqtt.host,
    port: settings.mqtt.port,
    username: settings.mqtt.username,
    password: settings.mqtt.password,
    prefix: settings.mqtt.prefix,
  };
}

/** Apply settings to telemetry / relay / history. */
function applySettings(settings: AppSettings): void {
  deps.telemetryService.applyConfig(toMqttConfig(settings));
  deps.relayService.applyPrefix(settings.mqtt.prefix);
  deps.historyAdapter.configure(
    settings.influx.url,
    settings.influx.org,
    settings.influx.bucket,
    settings.influx.token,
  );
}

/**
 * Bootstrap: load settings + devices + dashboards, wire reactions, start
 * MQTT + the sync bridge.
 *
 * Fix cycle 2 (CP-R3 race): ALL persisted loads are awaited before the
 * returned `loaded` promise resolves — App grants readiness only after
 * they complete, so the active-room fallback can never run against the
 * seed snapshot and overwrite the persisted active room. Load failures are
 * reported through the logger; start behavior (services, sync bridge,
 * subscriptions, AppState lifecycle) is preserved.
 */
function bootstrap(): { loaded: Promise<void>; cleanup: () => void } {
  /**
   * Re-apply the persisted settings and start the real services. The store
   * adoption seam is parameterized (user-authorized exceptional fix): full
   * events adopt the snapshot wholesale via `setCurrent`, while UI-only
   * events (theme) use `applyPersistedUi` so a divergent unsaved technical
   * draft survives the theme round-trip. Services always reconfigure from
   * the persisted technical values — a UI-only event carries technical
   * fields identical to the previously persisted ones, so re-applying them
   * is a no-op for MQTT/Influx behavior.
   */
  const startServices = (
    settings: AppSettings,
    adoptStore: (persisted: AppSettings) => void,
  ) => {
    applySettings(settings);
    adoptStore(settings);
    deps.telemetryService.start();
    deps.relayService.startFeedbackListener();
  };
  const adoptFull = (persisted: AppSettings) => {
    deps.settingsStore.getState().setCurrent(persisted);
  };
  const adoptUiOnly = (persisted: AppSettings) => {
    deps.settingsStore.getState().applyPersistedUi(persisted);
  };

  const loaded = Promise.all([
    deps.settingsService.load(),
    deps.devicesRegistry.load(),
    deps.dashboardService.load(),
  ]).then(([settingsResult, devicesResult, dashboardsResult]) => {
    const settings: AppSettings = settingsResult.ok
      ? settingsResult.value
      : defaultSettings();
    // Bootstrap is a FULL persisted adoption: current and draft sync.
    startServices(settings, adoptFull);
    if (!devicesResult.ok) {
      deps.logger.warn(`Devices load failed: ${devicesResult.error.message}`);
    }
    if (!dashboardsResult.ok) {
      deps.logger.warn(
        `Dashboards load failed: ${dashboardsResult.error.message}`,
      );
    }
  });

  // The sync bridge re-reads the registry per event, so it can start
  // alongside the loads (unchanged timing).
  deps.deviceStateSync.start();

  // React to settings changes.
  const unsubscribeSettings = deps.settingsService.onChanged(snapshot => {
    const settings: AppSettings = {
      mqtt: {
        host: snapshot.mqtt.host,
        port: snapshot.mqtt.port,
        username: snapshot.mqtt.username,
        password: snapshot.mqtt.password,
        prefix: snapshot.mqtt.prefix,
      },
      influx: {
        url: snapshot.influx.url,
        org: snapshot.influx.org,
        bucket: snapshot.influx.bucket,
        token: snapshot.influx.token,
      },
      ui: {
        theme: snapshot.ui.theme,
      },
    };
    if (snapshot.changeScope === 'ui-only') {
      // UI-only persistence (theme): services reconfigure from the
      // persisted technical values, but the settings store must KEEP the
      // divergent unsaved technical draft — a full setCurrent here would
      // erase it (user-authorized exceptional fix for the draft-loss
      // defect).
      startServices(settings, adoptUiOnly);
      return;
    }
    startServices(settings, adoptFull);
  });

  // Cascade: when a device is removed, drop its widgets from every dashboard
  // and its live values/series from the device state store. When only ONE
  // projected sensor metric of a surviving legacy multi-capability device is
  // removed, the cascade is binding-level: only that metric's widgets and
  // ephemeral state are cleaned (approved room-sensor rework).
  const unsubscribeDevicesChanged = deps.bus.subscribe(
    'devices:changed',
    event => {
      for (const deviceId of event.removedDeviceIds) {
        void deps.dashboardService.removeWidgetsForDevice(deviceId);
        deps.deviceStateStore.getState().removeDevice(deviceId);
      }
      for (const binding of event.removedBindings) {
        void deps.dashboardService.removeWidgetsForBinding(
          binding.deviceId,
          binding.capability,
        );
        deps.deviceStateStore
          .getState()
          .clearCapability(binding.deviceId, binding.capability);
      }
    },
  );

  // Forward relay feedback messages from the shared MQTT stream.
  deps.mqttClient.onMessage(message => {
    deps.relayService.handleFeedbackMessage(message);
  });

  // AppState lifecycle: disconnect on background, reconnect on foreground.
  const handleAppState = (next: AppStateStatus) => {
    if (next === 'background' || next === 'inactive') {
      deps.telemetryService.stop();
    } else if (next === 'active') {
      deps.telemetryService.start();
    }
  };
  const appStateSub = AppState.addEventListener('change', handleAppState);

  return {
    loaded,
    cleanup: () => {
      unsubscribeSettings();
      unsubscribeDevicesChanged();
      appStateSub.remove();
      deps.deviceStateSync.stop();
      deps.telemetryService.stop();
    },
  };
}

/** Status bar that follows the effective theme (CP-R6). */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const bootstrapped = useRef(false);

  // Inter custom font (M2): loaded once at the root; the render gate below
  // waits for it so the first frame never flashes the system font. The map
  // keys are the family names used by styles (core/theme/typography).
  const [fontsLoaded] = useFonts({
    [INTER_LIGHT]: Inter_300Light,
    [INTER_REGULAR]: Inter_400Regular,
    [INTER_SEMIBOLD]: Inter_600SemiBold,
  });

  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;

    // Readiness is granted ONLY after every persisted load completed (fix
    // cycle 2): the fallback below must never observe the seed snapshot.
    const { loaded, cleanup } = bootstrap();
    void loaded.then(() => {
      setReady(true);
    });
    return cleanup;
  }, []);

  // Reactive store subscriptions (zustand) so the UI re-renders on updates.
  const themeMode = useStore(
    deps.settingsStore,
    state => state.current.ui.theme,
  );
  const dashboards = useStore(deps.dashboardStore, state => state.dashboards);
  const activeId = useStore(deps.dashboardStore, state => state.activeId);
  const activeRoomId = useStore(
    deps.dashboardStore,
    state => state.activeRoomId,
  );
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);
  const devices = useStore(deps.devicesStore, state => state.snapshot.devices);
  const capabilities = useStore(
    deps.devicesStore,
    state => state.snapshot.capabilities,
  );
  const connection = useStore(deps.telemetryStore, state => state.connection);
  const lastErrorCode = useStore(
    deps.telemetryStore,
    state => state.lastErrorCode,
  );
  const historyRange = useHistoryRange();
  const historySeries = useHistorySeries();
  const historyLoading = useHistoryLoading();
  const historyError = useHistoryError();

  // CP-R3: one shared active room. First run / deleted room / empty
  // selection fall back to the first ordered room; the no-room state is
  // handled by the screens' empty hints. Fix cycle 2: gated on `ready` —
  // the persisted loads must have completed so this write can never run
  // against the seed snapshot and overwrite the persisted active room.
  useEffect(() => {
    if (!ready) {
      return;
    }
    if (rooms.length === 0) {
      return;
    }
    const valid =
      activeRoomId !== null && rooms.some(room => room.id === activeRoomId);
    if (!valid) {
      const first = [...rooms].sort((a, b) => a.order - b.order)[0]!;
      void deps.dashboardService.setActiveRoom(first.id);
    }
  }, [ready, rooms, activeRoomId]);

  // CP-R5: the active room has no telemetry sensor device → empty state,
  // no query.
  const historyNoSensors =
    activeRoomId !== null &&
    historyQueryForRoom(devices, capabilities, activeRoomId, historyRange) ===
      null;

  /**
   * Run the room history query for a room + range with the CP-R5 stale
   * guard: `beginRequest` invalidates older in-flight requests, so a slow
   * older response can never overwrite a newer room/range result. Rooms
   * without sensor devices short-circuit to an empty series set (also
   * through beginRequest, invalidating anything still in flight). The data
   * source is the selectable front door: demo data while the Settings
   * toggle is ON, InfluxDB otherwise (default).
   */
  const runHistoryQuery = (roomId: string | null, range: HistoryRange) => {
    const store = deps.historyStore.getState();
    const requestId = store.beginRequest();
    const query = historyQueryForRoom(devices, capabilities, roomId, range);
    if (!query) {
      store.setSeriesIfCurrent(requestId, []);
      return;
    }
    void deps.historySource.query(query).then(result => {
      if (result.ok) {
        deps.historyStore
          .getState()
          .setSeriesIfCurrent(requestId, result.value);
      } else {
        deps.historyStore
          .getState()
          .setErrorIfCurrent(requestId, result.error.message);
      }
    });
  };

  // WidgetServices: the runtime bridge widgets consume through context (D8).
  const widgetServices = useMemo<WidgetServices>(
    () => ({
      getState: (deviceId, capability: CapabilityType) => {
        const key = `${deviceId}:${capability}`;
        return deps.deviceStateStore.getState().values[key];
      },
      getSeries: (deviceId, capability) =>
        deps.deviceStateStore.getState().getSeriesPoints(deviceId, capability),
      sendCommand: (deviceId, capability, value) =>
        deps.deviceCommandService.sendCommand(deviceId, capability, value),
      queryHistory: (query: HistoryQuery) => deps.historySource.query(query),
      getRooms: () => deps.devicesRegistry.getRooms(),
      getDevices: () => deps.devicesRegistry.getDevices(),
      getCapabilities: () => deps.devicesRegistry.getCapabilities(),
      getActiveRoomId: () => deps.dashboardService.getActiveRoomId(),
      subscribeDeviceState: listener =>
        deps.deviceStateStore.subscribe(listener),
    }),
    [],
  );

  // Render gate: bootstrap loads AND fonts must both be ready (no FOUT /
  // system-font flash; also keeps the room fallback ordering guarantees).
  if (!ready || !fontsLoaded) {
    return null;
  }

  return (
    // Root safe-area provider: must wrap every `useSafeAreaInsets` consumer
    // (TabShell owns applying the runtime top/bottom insets exactly once).
    <SafeAreaProvider>
      <ThemeProvider mode={themeMode}>
        {/* StatusBar must live INSIDE ThemeProvider — it reads the effective
            theme through useTheme (fix cycle 1, provider-order regression). */}
        <ThemedStatusBar />
        <TabShell
          renderScreen={(tab: TabKey) => {
            switch (tab) {
              case 'dashboard':
                return (
                  <DashboardScreen
                    dashboards={dashboards}
                    activeId={activeId}
                    activeRoomId={activeRoomId}
                    connection={{
                      state: connection,
                      label: mqttConnectionLabel(connection),
                      errorCode: lastErrorCode ?? undefined,
                    }}
                    onSelectRoom={id => {
                      void deps.dashboardService.setActiveRoom(id);
                    }}
                    rooms={rooms}
                    registry={deps.widgetRegistry}
                    services={widgetServices}
                  />
                );
              case 'history':
                return (
                  <HistoryScreen
                    range={historyRange}
                    series={historySeries}
                    loading={historyLoading}
                    error={historyError}
                    rooms={rooms}
                    registeredFields={sensorFieldsForRoom(
                      devices,
                      capabilities,
                      activeRoomId,
                    )}
                    capabilities={capabilities}
                    roomId={activeRoomId}
                    noSensors={historyNoSensors}
                    onRangeChange={range => {
                      deps.historyStore.getState().setRange(range);
                      runHistoryQuery(activeRoomId, range);
                    }}
                    onRoomChange={roomId => {
                      // Updates the shared active room (dashboard module)
                      // AND immediately re-queries history for the new room
                      // (fix cycle 1: stale cards from the previous room
                      // must not survive a room switch; a sensor-less room
                      // short-circuits through beginRequest, clearing the
                      // in-flight/previous series).
                      void deps.dashboardService.setActiveRoom(roomId);
                      runHistoryQuery(roomId, historyRange);
                    }}
                    onMount={() => {
                      if (
                        !historyLoading &&
                        historySeries.length === 0 &&
                        !historyError
                      ) {
                        runHistoryQuery(activeRoomId, historyRange);
                      }
                    }}
                  />
                );
              case 'settings':
                return (
                  <SettingsCoordinator deps={deps} services={widgetServices} />
                );
            }
          }}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function useHistoryRange() {
  return useStore(deps.historyStore, state => state.range);
}
function useHistorySeries() {
  return useStore(deps.historyStore, state => state.series);
}
function useHistoryLoading() {
  return useStore(deps.historyStore, state => state.loading);
}
function useHistoryError() {
  return useStore(deps.historyStore, state => state.error);
}
