/**
 * SettingsNavigator — the Settings tab's ONE typed native stack (official
 * single navigation system; the hand-written `routeMachine` is retired and
 * its transition coverage replaced by {@link ./SettingsNavigator.test.tsx}):
 *
 *   root (settings summary) → advanced
 *                           → device-management
 *                           → TemplateList → CreateTemplate
 *                                          → RoomList → CreateRoom
 *                                                     → RoomDashboard
 *                                                     → EditRoomDashboard
 *
 * The Template → Room → Widget management hierarchy lives INSIDE Settings
 * (one management entry on the root screen) — the Dashboard tab stays the
 * view-only surface. The management screens are dumb (props in, callbacks
 * out); this navigator is the only place they meet React Navigation and the
 * composition-root services (module persistence ownership is unchanged).
 *
 * Back behavior: Android/native back pops the stack (React Navigation); the
 * editor route's Hủy path discards the draft BEFORE leaving (never silent
 * persistence — see {@link ./hierarchyRoutes.tsx}).
 *
 * Connection truthfulness: the MQTT retry action drives the REAL telemetry
 * service lifecycle (no parallel MQTT client); the explicit Influx probe
 * queries the RAW `historyAdapter` — never the demo history source.
 */

import React from 'react';
import { useStore } from 'zustand';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

import { STRINGS } from '@core/i18n';
import type { WidgetServices } from '@modules/widgets/api';
import type {
  DevicePatch,
  NewCapabilityInput,
  NewDeviceInput,
} from '@modules/devices/api';
import { SettingsScreen } from '@modules/settings/ui/SettingsScreen';
import { AdvancedSettingsScreen } from '@modules/settings/ui/AdvancedSettingsScreen';
import { DeviceManagementScreen } from '@modules/devices/ui/DevicesScreen';

import type { AppDependencies } from '../wiring/container';
import type { SettingsStackParams } from './routes';
import {
  CreateRoomRoute,
  CreateTemplateRoute,
  EditRoomDashboardRoute,
  RoomDashboardRoute,
  RoomListRoute,
  TemplateListRoute,
  toOutcome,
} from './hierarchyRoutes';

const Stack = createNativeStackNavigator<SettingsStackParams>();

interface SettingsNavigatorProps {
  /** Composition-root singletons (services + stores). */
  readonly deps: AppDependencies;
  /** The runtime widget services (widget grids render live state). */
  readonly services: WidgetServices;
}

/**
 * The Settings tab content: one native stack from the root summary screen
 * through the management hierarchy.
 *
 * @param props - see {@link SettingsNavigatorProps}.
 */
export function SettingsNavigator({ deps, services }: SettingsNavigatorProps) {
  // Demo history data (in-memory, not persisted): the selector owns the
  // flag; local state mirrors it so the Switch re-renders on toggle. The
  // selector resets to OFF on app restart (composition root is rebuilt).
  const [demoHistory, setDemoHistory] = React.useState(() =>
    deps.historySource.isDemoEnabled(),
  );

  // Mirror-store subscriptions for the root/advanced/device screens (the
  // hierarchy routes subscribe inside their own route components).
  const settingsDraft = useStore(deps.settingsStore, state => state.draft);
  const settingsCurrent = useStore(deps.settingsStore, state => state.current);
  const settingsErrors = useStore(deps.settingsStore, state => state.errors);
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

  /**
   * Draft-vs-persisted dirtiness for the advanced diagnostics contract.
   * (Service Results map to UI outcomes through the shared `toOutcome`
   * imported from {@link ./hierarchyRoutes.tsx}.)
   */
  const settingsEqual = (
    a: { mqtt: unknown; influx: unknown },
    b: { mqtt: unknown; influx: unknown },
  ): boolean =>
    JSON.stringify(a.mqtt) === JSON.stringify(b.mqtt) &&
    JSON.stringify(a.influx) === JSON.stringify(b.influx);
  const mqttDirty = !settingsEqual(
    { mqtt: settingsDraft.mqtt, influx: {} },
    { mqtt: settingsCurrent.mqtt, influx: {} },
  );
  const influxDirty = !settingsEqual(
    { mqtt: {}, influx: settingsDraft.influx },
    { mqtt: {}, influx: settingsCurrent.influx },
  );

  return (
    <Stack.Navigator
      initialRouteName="root"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="root">
        {({
          navigation,
        }: NativeStackScreenProps<SettingsStackParams, 'root'>) => (
          <SettingsScreen
            settings={settingsDraft.ui}
            onUpdateUi={patch => {
              deps.settingsStore.getState().updateUi(patch);
            }}
            onOpenDashboardManager={() => navigation.navigate('TemplateList')}
            onOpenDeviceManagement={() =>
              navigation.navigate('device-management')
            }
            onOpenAdvanced={() => navigation.navigate('advanced')}
            demoHistory={demoHistory}
            onToggleDemoHistory={enabled => {
              deps.historySource.setDemoEnabled(enabled);
              setDemoHistory(enabled);
            }}
            connectionState={connection}
            lastErrorCode={lastErrorCode}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="advanced">
        {({
          navigation,
        }: NativeStackScreenProps<SettingsStackParams, 'advanced'>) => (
          <AdvancedSettingsScreen
            onBack={() => navigation.goBack()}
            settings={settingsDraft}
            // The probe tests the raw history adapter, which is configured
            // from the LAST PERSISTED settings (`settings:changed`) — pass
            // that config so probe results are fingerprinted against their
            // true target.
            persistedInflux={settingsCurrent.influx}
            errors={settingsErrors}
            onUpdateMqtt={patch => {
              deps.settingsStore.getState().updateMqtt(patch);
            }}
            onUpdateInflux={patch => {
              deps.settingsStore.getState().updateInflux(patch);
            }}
            onSave={async candidate => {
              const result = await deps.settingsService.save(candidate);
              return {
                ok: result.ok,
                message: result.ok
                  ? STRINGS.settings.saved
                  : result.error.message,
              };
            }}
            connectionState={connection}
            lastErrorCode={lastErrorCode}
            mqttDirty={mqttDirty}
            influxDirty={influxDirty}
            onMqttRetry={() => {
              // Real lifecycle only (approved contract): stop → start the
              // actual telemetry service. NO parallel MQTT client exists.
              deps.telemetryService.stop();
              deps.telemetryService.start();
            }}
            onCheckInflux={async () => {
              // Raw explicit probe against the InfluxDB adapter — no room
              // filter (`roomId: null`), default fields. The demo history
              // source is never consulted — a demo dataset must not fake a
              // connectivity check.
              const influxResult = await deps.historyAdapter.query({
                measurement: 'sensors',
                range: '1h',
                fields: [],
                roomId: null,
              });
              return influxResult.ok ? 'ok' : 'fail';
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="device-management">
        {({
          navigation,
        }: NativeStackScreenProps<
          SettingsStackParams,
          'device-management'
        >) => (
          <DeviceManagementScreen
            onBack={() => navigation.goBack()}
            rooms={rooms}
            devices={devices}
            capabilities={capabilities}
            onAddRoom={async name => {
              // Room-first device management: the created room is returned
              // so the screen can open its detail immediately on success.
              const result = await deps.devicesRegistry.addRoom(name);
              return result.ok
                ? { ok: true, message: '', roomId: result.value.id }
                : { ok: false, message: result.error.message || 'Lỗi' };
            }}
            onRenameRoom={async (roomId, name) => {
              const result = await deps.devicesRegistry.updateRoom(roomId, {
                name,
              });
              return toOutcome(result);
            }}
            onRemoveRoom={async (roomId, target) => {
              const result = await deps.devicesRegistry.removeRoomWithMigration(
                roomId,
                target,
              );
              return toOutcome(result);
            }}
            onAddDevice={async (input: NewDeviceInput) => {
              const result = await deps.devicesRegistry.addDevice(input);
              return toOutcome(result);
            }}
            onUpdateDevice={async (id: string, patch: DevicePatch) => {
              const result = await deps.devicesRegistry.updateDevice(id, patch);
              return toOutcome(result);
            }}
            onRemoveDevice={async (id: string) => {
              const result = await deps.devicesRegistry.removeDevice(id);
              return toOutcome(result);
            }}
            onAddCapability={async (input: NewCapabilityInput) => {
              const result = await deps.devicesRegistry.addCapability(input);
              return toOutcome(result);
            }}
            onRemoveDeviceCapability={async (
              deviceId: string,
              field: string,
            ) => {
              const result = await deps.devicesRegistry.removeDeviceCapability(
                deviceId,
                field,
              );
              return toOutcome(result);
            }}
          />
        )}
      </Stack.Screen>

      {/* Template → Room → Widget management hierarchy (view-only tab is
          the Dashboard; mutations live only here). */}
      <Stack.Screen name="TemplateList">
        {({
          navigation,
        }: NativeStackScreenProps<SettingsStackParams, 'TemplateList'>) => (
          <TemplateListRoute
            deps={deps}
            services={services}
            navigation={navigation}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateTemplate">
        {({
          navigation,
        }: NativeStackScreenProps<SettingsStackParams, 'CreateTemplate'>) => (
          <CreateTemplateRoute
            deps={deps}
            services={services}
            navigation={navigation}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="RoomList">
        {({
          navigation,
          route,
        }: NativeStackScreenProps<SettingsStackParams, 'RoomList'>) => (
          <RoomListRoute
            deps={deps}
            services={services}
            navigation={navigation}
            route={route}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateRoom">
        {({
          navigation,
          route,
        }: NativeStackScreenProps<SettingsStackParams, 'CreateRoom'>) => (
          <CreateRoomRoute
            deps={deps}
            services={services}
            navigation={navigation}
            route={route}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="RoomDashboard">
        {({
          navigation,
          route,
        }: NativeStackScreenProps<SettingsStackParams, 'RoomDashboard'>) => (
          <RoomDashboardRoute
            deps={deps}
            services={services}
            navigation={navigation}
            route={route}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="EditRoomDashboard">
        {({
          navigation,
          route,
        }: NativeStackScreenProps<
          SettingsStackParams,
          'EditRoomDashboard'
        >) => (
          <EditRoomDashboardRoute
            deps={deps}
            services={services}
            navigation={navigation}
            route={route}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
