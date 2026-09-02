/**
 * Settings coordinator — the app-layer navigation state machine for the
 * Settings tab (CP-R2).
 *
 * "Inside Settings" is a product/navigation rule, not a transfer of
 * persistence ownership: the settings module keeps owning MQTT/Influx/UI
 * preferences; the devices module keeps owning rooms/devices/capabilities;
 * the dashboard module keeps owning dashboards/widgets/layout. This
 * coordinator only composes the module-owned screens and wires their
 * callbacks to the module facades/services resolved in the composition root.
 *
 * The route machine itself is a pure function ({@link navigateSettings}) so
 * it can be unit-tested without React.
 */

import React from 'react';
import { useStore } from 'zustand';

import { STRINGS } from '@core/i18n';
import type { Result } from '@core/errors';
import type { WidgetServices } from '@modules/widgets/api';
import type {
  DevicePatch,
  NewCapabilityInput,
  NewDeviceInput,
} from '@modules/devices/api';
import type { AddWidgetInput } from '@modules/dashboard/api';
import { DashboardLayoutEditor } from '@modules/dashboard/ui/DashboardLayoutEditor';
import { SettingsScreen } from '@modules/settings/ui/SettingsScreen';
import {
  DeviceManagementScreen,
  type ActionOutcome,
} from '@modules/devices/ui/DevicesScreen';

import type { AppDependencies } from '../wiring/container';
import { navigateSettings, type SettingsRoute } from './routeMachine';

export type { SettingsRoute, SettingsRouteName } from './routeMachine';

interface SettingsCoordinatorProps {
  /** Composition-root singletons (services + stores). */
  readonly deps: AppDependencies;
  /** The runtime widget services (the editor grid renders live widgets). */
  readonly services: WidgetServices;
}

/**
 * The Settings tab content: root screen + nested management screens.
 *
 * @param props - see {@link SettingsCoordinatorProps}.
 */
export function SettingsCoordinator({
  deps,
  services,
}: SettingsCoordinatorProps) {
  const [route, setRoute] = React.useState<SettingsRoute>({ name: 'root' });

  // Demo history data (in-memory, not persisted): the selector owns the
  // flag; local state mirrors it so the Switch re-renders on toggle. The
  // selector resets to OFF on app restart (composition root is rebuilt).
  const [demoHistory, setDemoHistory] = React.useState(() =>
    deps.historySource.isDemoEnabled(),
  );

  // Mirror-store subscriptions for the nested screens.
  const settingsDraft = useStore(deps.settingsStore, state => state.draft);
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);
  const devices = useStore(deps.devicesStore, state => state.snapshot.devices);
  const capabilities = useStore(
    deps.devicesStore,
    state => state.snapshot.capabilities,
  );
  const dashboards = useStore(deps.dashboardStore, state => state.dashboards);
  const activeId = useStore(deps.dashboardStore, state => state.activeId);
  const activeRoomId = useStore(
    deps.dashboardStore,
    state => state.activeRoomId,
  );
  const editMode = useStore(deps.dashboardStore, state => state.editMode);
  const draftWidgets = useStore(
    deps.dashboardStore,
    state => state.draftWidgets,
  );
  const editorRoomId = useStore(
    deps.dashboardStore,
    state => state.editorRoomId,
  );
  const connection = useStore(deps.telemetryStore, state => state.connection);
  const lastErrorCode = useStore(
    deps.telemetryStore,
    state => state.lastErrorCode,
  );
  const settingsErrors = useStore(deps.settingsStore, state => state.errors);

  /**
   * Map a registry/service Result to the UI outcome shape (fix cycle 1:
   * the failure text lives on `result.error.message` — never on the Result
   * itself; an empty message falls back to the generic error label).
   */
  const toOutcome = (result: Result<void>): ActionOutcome =>
    result.ok
      ? { ok: true, message: '' }
      : { ok: false, message: result.error.message || 'Lỗi' };

  /**
   * Leave the editor screen: discard any open draft first so the next
   * visit starts clean (no orphan draft), then return to the Settings root.
   */
  const leaveEditorToRoot = () => {
    const store = deps.dashboardStore.getState();
    if (store.editMode) {
      store.cancelEdit();
    }
    setRoute(current => navigateSettings(current, 'root'));
  };

  // Draft cleanup on unmount / tab leave: a draft left open when the
  // Settings tab unmounts would orphan the editor state.
  React.useEffect(() => {
    return () => {
      const store = deps.dashboardStore.getState();
      if (store.editMode) {
        store.cancelEdit();
      }
    };
  }, [deps.dashboardStore]);

  switch (route.name) {
    case 'device-management':
      return (
        <DeviceManagementScreen
          onBack={() => setRoute(current => navigateSettings(current, 'root'))}
          rooms={rooms}
          devices={devices}
          capabilities={capabilities}
          onAddRoom={async name => {
            const result = await deps.devicesRegistry.addRoom(name);
            return toOutcome(result);
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
          onRemoveCapability={async type => {
            const result = await deps.devicesRegistry.removeCapability(type);
            return toOutcome(result);
          }}
        />
      );
    case 'dashboard-editor': {
      const dashboardStore = deps.dashboardStore.getState();
      return (
        <DashboardLayoutEditor
          dashboards={dashboards}
          activeId={activeId}
          activeRoomId={activeRoomId}
          editMode={editMode}
          draftWidgets={draftWidgets}
          editorRoomId={editorRoomId}
          rooms={rooms}
          devices={devices}
          capabilities={capabilities}
          registry={deps.widgetRegistry}
          services={services}
          onEnterEdit={(dashboardId, roomId) =>
            dashboardStore.enterEdit(dashboardId, roomId)
          }
          onCancelEdit={() => dashboardStore.cancelEdit()}
          onBack={leaveEditorToRoot}
          onSaveLayout={async () => {
            const draft = deps.dashboardStore.getState().draftWidgets;
            if (!draft) {
              return { ok: false, message: 'Không có bản nháp nào đang mở' };
            }
            const result = await deps.dashboardService.applyLayout(
              activeId,
              draft,
            );
            if (result.ok) {
              deps.dashboardStore.getState().cancelEdit();
              return { ok: true, message: '' };
            }
            return { ok: false, message: result.error.message };
          }}
          onDraftMove={(widgetId, x, y) =>
            deps.dashboardStore.getState().moveWidget(widgetId, x, y)
          }
          onDraftResize={(widgetId, size) =>
            deps.dashboardStore.getState().resizeWidget(widgetId, size)
          }
          onDraftRemove={widgetId =>
            deps.dashboardStore.getState().removeWidget(widgetId)
          }
          onRebindWidget={(widgetId, deviceId, capability) =>
            deps.dashboardStore
              .getState()
              .rebindDraftWidget(widgetId, deviceId, capability)
          }
          onSelectDashboard={id => {
            void deps.dashboardService.setActiveDashboard(id);
          }}
          onSelectEditorRoom={id => {
            deps.dashboardStore.getState().setEditorRoom(id);
          }}
          onCreateDashboard={async name => {
            const result = await deps.dashboardService.createDashboard(name);
            return toOutcome(result);
          }}
          onDeleteDashboard={async id => {
            // CP-R2 (fix cycle 2): dashboard deletion is reachable only
            // under Settings (the editor); the Dashboard tab stays
            // view-only. The service re-points the active selection on
            // success; the dialog stays open on failure with the error.
            const result = await deps.dashboardService.deleteDashboard(id);
            return toOutcome(result);
          }}
          onAddWidget={async (input: AddWidgetInput) => {
            const result = await deps.dashboardService.addWidget(
              activeId,
              input,
            );
            return toOutcome(result);
          }}
        />
      );
    }
    default:
      return (
        <SettingsScreen
          settings={settingsDraft}
          onSave={async candidate => {
            const result = await deps.settingsService.save(candidate);
            return {
              ok: result.ok,
              message: result.ok
                ? STRINGS.settings.saved
                : result.error.message,
            };
          }}
          errors={settingsErrors}
          onUpdateMqtt={patch => {
            deps.settingsStore.getState().updateMqtt(patch);
          }}
          onUpdateInflux={patch => {
            deps.settingsStore.getState().updateInflux(patch);
          }}
          onUpdateUi={patch => {
            deps.settingsStore.getState().updateUi(patch);
          }}
          onCheckConnection={async () => {
            // CP-R5: non-room-specific Influx probe (no device filter,
            // default fields) + the live MQTT state.
            const influxResult = await deps.historyAdapter.query({
              measurement: 'sensors',
              range: '1h',
              fields: [],
              deviceIds: [],
            });
            const mqttConnected =
              deps.telemetryStore.getState().connection === 'connected';
            return {
              mqtt: mqttConnected ? 'ok' : 'fail',
              influx: influxResult.ok ? 'ok' : 'fail',
            };
          }}
          onOpenDeviceManagement={() =>
            setRoute(current => navigateSettings(current, 'device-management'))
          }
          onOpenDashboardEditor={() =>
            setRoute(current => navigateSettings(current, 'dashboard-editor'))
          }
          demoHistory={demoHistory}
          onToggleDemoHistory={enabled => {
            deps.historySource.setDemoEnabled(enabled);
            setDemoHistory(enabled);
          }}
          connectionState={connection}
          lastErrorCode={lastErrorCode}
        />
      );
  }
}
