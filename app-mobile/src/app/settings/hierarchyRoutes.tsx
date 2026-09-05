/**
 * Settings hierarchy route components — the Template → Room → Widget
 * management screens re-parented from the v1 Dashboard-tab navigator into
 * the Settings tab's single typed stack.
 *
 * The screens stay dumb (props in, callbacks out); each route component
 * subscribes to the mirror stores (Templates file, devices registry,
 * telemetry connection, draft state) so its screen re-renders from state,
 * and wires the callbacks to the composition-root services. This is app
 * (`src/app/`) navigation wiring — module persistence ownership is
 * unchanged.
 *
 * Navigation truthfulness: a create/duplicate/delete action navigates or
 * recovers ONLY after its service call succeeded (atomic persistence); a
 * deletion of the active/selected Template re-points the route to the
 * service's deterministic fallback Template.
 */

import React, { useMemo } from 'react';
import { useStore } from 'zustand';
import { NavigationAction, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { STRINGS, mqttConnectionLabel } from '@core/i18n';

import type { AddWidgetInput } from '@modules/dashboard/api';
import type { CapabilityType } from '@modules/devices/api';
import type { WidgetServices, WidgetSize } from '@modules/widgets/api';
import { TemplateListScreen } from '@modules/dashboard/ui/TemplateListScreen';
import { CreateTemplateScreen } from '@modules/dashboard/ui/CreateTemplateScreen';
import { RoomListScreen } from '@modules/dashboard/ui/RoomListScreen';
import {
  CreateRoomScreen,
  type CreateRoomOutcome,
} from '@modules/dashboard/ui/CreateRoomScreen';
import { RoomDashboardScreen } from '@modules/dashboard/ui/RoomDashboardScreen';
import { EditRoomDashboardScreen } from '@modules/dashboard/ui/EditRoomDashboardScreen';
import { ConfirmDialog } from '@modules/dashboard/ui/ConfirmDialog';

import type { AppDependencies } from '../wiring/container';
import type { SettingsStackParams } from './routes';
import { createRoomAndAddToTemplate } from './addRoomToTemplate';

/** Map a service Result to the screens' outcome shape. */
export const toOutcome = (result: {
  ok: boolean;
  error?: { message: string };
}) =>
  result.ok
    ? { ok: true, message: '' }
    : { ok: false, message: result.error?.message || 'Lỗi' };

/** Shared route props: composition-root singletons + runtime services. */
interface HierarchyRouteBase {
  readonly deps: AppDependencies;
  /** Runtime widget services (live state, commands) for widget grids. */
  readonly services: WidgetServices;
}

type RouteProps<Name extends keyof SettingsStackParams> = HierarchyRouteBase &
  NativeStackScreenProps<SettingsStackParams, Name>;

/** Navigation prop of one Settings stack route (no `route` payload). */
type RouteNav<Name extends keyof SettingsStackParams> = NativeStackScreenProps<
  SettingsStackParams,
  Name
>['navigation'];

/**
 * TemplateList — management hierarchy root: the Template card list.
 *
 * Active-Template selection is AWAITED: on a storage failure the route
 * STAYS (no navigation — the Dashboard tab's active Template is unchanged)
 * and the actual service error is surfaced truthfully in a dialog.
 */
export function TemplateListRoute({
  deps,
  navigation,
}: HierarchyRouteBase & { readonly navigation: RouteNav<'TemplateList'> }) {
  const templates = useStore(deps.dashboardStore, state => state.templates);
  const connection = useStore(deps.telemetryStore, state => state.connection);
  const lastErrorCode = useStore(
    deps.telemetryStore,
    state => state.lastErrorCode,
  );
  const [openError, setOpenError] = React.useState<string | null>(null);

  return (
    <>
      <TemplateListScreen
        templates={templates}
        connection={{
          state: connection,
          label: mqttConnectionLabel(connection),
          errorCode: lastErrorCode ?? undefined,
        }}
        onBack={() => navigation.goBack()}
        onOpenTemplate={async templateId => {
          const result = await deps.dashboardService.setActiveTemplate(
            templateId,
          );
          if (!result.ok) {
            setOpenError(result.error.message || 'Lỗi');
            return { ok: false, message: result.error.message || 'Lỗi' };
          }
          navigation.navigate('RoomList', { templateId });
          return { ok: true, message: '' };
        }}
        onCreateTemplate={() => navigation.navigate('CreateTemplate')}
        onRenameTemplate={async (id, name) =>
          toOutcome(await deps.dashboardService.renameTemplate(id, name))
        }
        onDuplicateTemplate={async id => {
          const result = await deps.dashboardService.duplicateTemplate(id);
          return toOutcome(result);
        }}
        onDeleteTemplate={async id => {
          const result = await deps.dashboardService.deleteTemplate(id);
          return toOutcome(result);
        }}
      />
      {/* Selection failure dialog (confirm/dismiss both just close it). */}
      <ConfirmDialog
        visible={openError !== null}
        title={STRINGS.templates.openTemplate}
        message={openError ?? ''}
        destructive={false}
        confirmLabel={STRINGS.templates.close}
        confirmTestID="template-open-error-confirm"
        dismissTestID="template-open-error-dismiss"
        onConfirm={() => setOpenError(null)}
        onDismiss={() => setOpenError(null)}
      />
    </>
  );
}

/** CreateTemplate — the create form; success opens the new room list. */
export function CreateTemplateRoute({
  deps,
  navigation,
}: HierarchyRouteBase & { readonly navigation: RouteNav<'CreateTemplate'> }) {
  return (
    <CreateTemplateScreen
      onSubmit={async name => {
        const result = await deps.dashboardService.createTemplate(name);
        if (result.ok) {
          // Open the new Template's room list after persistence.
          navigation.replace('RoomList', {
            templateId: result.value.id,
          });
          return { ok: true, message: '' };
        }
        return toOutcome(result);
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}

/** RoomList — one Template's room-card grid (+ reorder/menus). */
export function RoomListRoute({
  deps,
  route,
  navigation,
}: RouteProps<'RoomList'>) {
  const templates = useStore(deps.dashboardStore, state => state.templates);
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);
  const devices = useStore(deps.devicesStore, state => state.snapshot.devices);
  const capabilities = useStore(
    deps.devicesStore,
    state => state.snapshot.capabilities,
  );

  return (
    <RoomListScreen
      template={templates.find(
        template => template.id === route.params.templateId,
      )}
      allTemplates={templates}
      rooms={rooms}
      devices={devices}
      capabilities={capabilities}
      onBack={() => navigation.goBack()}
      onOpenRoom={roomId =>
        navigation.navigate('RoomDashboard', {
          templateId: route.params.templateId,
          roomId,
        })
      }
      onAddRoom={() =>
        navigation.navigate('CreateRoom', {
          templateId: route.params.templateId,
        })
      }
      onRenameRoom={async (roomId, name) =>
        toOutcome(await deps.devicesRegistry.updateRoom(roomId, { name }))
      }
      onDuplicateRoom={async (roomId, targetTemplateId) =>
        toOutcome(
          await deps.dashboardService.duplicateRoomReference(
            route.params.templateId,
            roomId,
            targetTemplateId,
          ),
        )
      }
      onReorder={async orderedRoomIds =>
        toOutcome(
          await deps.dashboardService.reorderRoomReferences(
            route.params.templateId,
            orderedRoomIds,
          ),
        )
      }
      onRemoveRoom={async roomId =>
        toOutcome(
          await deps.dashboardService.removeRoomReference(
            route.params.templateId,
            roomId,
          ),
        )
      }
    />
  );
}

/** CreateRoom — add an existing reference or create a new physical room. */
export function CreateRoomRoute({
  deps,
  route,
  navigation,
}: RouteProps<'CreateRoom'>) {
  const templates = useStore(deps.dashboardStore, state => state.templates);
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);

  return (
    <CreateRoomScreen
      availableRooms={
        rooms.filter(
          room =>
            !templates
              .find(template => template.id === route.params.templateId)
              ?.rooms.some(reference => reference.roomId === room.id),
        ) ?? []
      }
      onAddExisting={async roomId =>
        toOutcome(
          await deps.dashboardService.addRoomReference(
            route.params.templateId,
            roomId,
          ),
        )
      }
      onCreateNew={async (name): Promise<CreateRoomOutcome> => {
        const outcome = await createRoomAndAddToTemplate(
          deps,
          route.params.templateId,
          name,
        );
        if (outcome.ok) {
          navigation.goBack();
        }
        return outcome;
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}

/** RoomDashboard — the preview of exactly ONE Template-room layout. */
export function RoomDashboardRoute({
  deps,
  services,
  route,
  navigation,
}: RouteProps<'RoomDashboard'>) {
  const templates = useStore(deps.dashboardStore, state => state.templates);
  const activeId = useStore(deps.dashboardStore, state => state.activeId);
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);

  return (
    <RoomDashboardScreen
      template={
        templates.find(template => template.id === route.params.templateId) ??
        templates.find(template => template.id === activeId)
      }
      roomId={route.params.roomId}
      rooms={rooms}
      registry={deps.widgetRegistry}
      services={services}
      onBack={() => navigation.goBack()}
      onEdit={() =>
        navigation.navigate('EditRoomDashboard', {
          templateId: route.params.templateId,
          roomId: route.params.roomId,
        })
      }
    />
  );
}

/**
 * EditRoomDashboard — the room-scoped draft editor (Hủy/Lưu contract).
 *
 * Draft atomicity: duplicate/move are DRAFT operations (the service
 * validates against and mutates the working copy — nothing persists) and
 * `saveDraft` commits the WHOLE draft end-state (source room + destination
 * rooms) through `applyTemplateLayouts` in ONE atomic service commit.
 *
 * Exit guard: `usePreventRemove(dirty, …)` — the native-stack-supported
 * removal-prevention mechanism (the screen's native preventRemove is wired
 * through the automatic PreventRemoveProvider) — covers EVERY pop path the
 * screen's Android `BackHandler` does not consume (iOS swipe gesture,
 * programmatic pops). A dirty draft → explicit discard confirmation (same
 * ConfirmDialog recipe); confirm discards then replays the prevented
 * removal; dismiss stays. A clean draft pops freely. ALL discards route
 * through ONE function (`discardAndPop`) that discards first and performs
 * the pop from an effect AFTER the guard disabled itself — exactly ONE
 * confirmation per discard, never a self-blocked double prompt. Tab-leave
 * is also a DISCARD path (never a persistence path): leaving the Settings
 * tab runs the composition root's `onSettingsLeave` (→ `cancelEdit`) and
 * resets the stack to its root — the draft is thrown away, never silently
 * persisted.
 */
export function EditRoomDashboardRoute({
  deps,
  services,
  route,
  navigation,
}: RouteProps<'EditRoomDashboard'>) {
  const templates = useStore(deps.dashboardStore, state => state.templates);
  const activeId = useStore(deps.dashboardStore, state => state.activeId);
  const rooms = useStore(deps.devicesStore, state => state.snapshot.rooms);
  const devices = useStore(deps.devicesStore, state => state.snapshot.devices);
  const capabilities = useStore(
    deps.devicesStore,
    state => state.snapshot.capabilities,
  );
  const editMode = useStore(deps.dashboardStore, state => state.editMode);
  const draftWidgets = useStore(
    deps.dashboardStore,
    state => state.draftWidgets,
  );

  const template =
    templates.find(template => template.id === route.params.templateId) ??
    templates.find(template => template.id === activeId);

  // FULL-draft dirty check (JSON so unknown custom fields count too): the
  // draft spans the whole Template — a cross-room duplicate/move changes
  // OTHER rooms' slices while this room's slice may stay identical.
  const dirty = useMemo(() => {
    if (!editMode || !draftWidgets) {
      return false;
    }
    const persisted = template?.rooms.flatMap(room => room.widgets) ?? [];
    return JSON.stringify(draftWidgets) !== JSON.stringify(persisted);
  }, [editMode, draftWidgets, template]);

  /**
   * Persist the draft end-state atomically (Save).
   *
   * Route-scoped: the draft must belong to THIS Template-room route — a
   * stale draft from another scope is REJECTED (never persisted anywhere),
   * deterministically. On success the whole draft (every room reference of
   * the Template) commits through the service in ONE atomic save.
   */
  const saveDraft = async (): Promise<{ ok: boolean; message: string }> => {
    const store = deps.dashboardStore.getState();
    if (!store.editMode || store.draftWidgets === null) {
      return { ok: false, message: 'Không có bản nháp nào đang mở' };
    }
    if (
      store.editorTemplateId !== route.params.templateId ||
      store.editorRoomId !== route.params.roomId
    ) {
      return {
        ok: false,
        message:
          'Bản nháp không còn khớp màn hình đang mở — hãy đóng và mở lại.',
      };
    }
    // Group the full draft by room reference (in Template room order,
    // preserving each room's widget order).
    const draft = store.draftWidgets;
    const layouts = (template?.rooms ?? []).map(room => ({
      roomId: room.roomId,
      widgets: draft.filter(widget => widget.roomId === room.roomId),
    }));
    const result = await deps.dashboardService.applyTemplateLayouts(
      route.params.templateId,
      layouts,
    );
    if (result.ok) {
      // The draft now EQUALS the persisted end-state: edit mode stays on
      // (no discard/re-open flicker), `dirty` is false, and the user exits
      // via Hủy/back (a clean pop) or keeps editing.
      return { ok: true, message: '' };
    }
    return { ok: false, message: result.error.message };
  };

  // Route-scoped pop guard — NATIVE-STACK-COMPATIBLE: `usePreventRemove`
  // (re-exported by @react-navigation/native from core) wires the screen's
  // native `preventRemove` through the automatic PreventRemoveProvider, so
  // the iOS swipe gesture is blocked at the NATIVE layer until JS decides
  // (a plain `beforeRemove` listener cannot reliably prevent the native
  // dismissal). While the draft is dirty, ANY removal attempt (Android
  // back, iOS swipe, programmatic pop) opens the explicit discard
  // confirmation; the prevented removal action is replayed on confirm.
  const [discardPop, setDiscardPop] = React.useState(false);
  const pendingPopRef = React.useRef<NavigationAction | null>(null);
  usePreventRemove(dirty, event => {
    pendingPopRef.current = event.data.action ?? null;
    setDiscardPop(true);
  });

  /**
   * THE one discard path — every confirmed discard (Hủy button, the
   * screen's Android back-confirm, the pop-guard confirm) routes through
   * here: the draft is discarded FIRST, then the exit is REQUESTED as
   * state and performed by the effect below — AFTER the re-render cleared
   * `dirty` and usePreventRemove disabled itself. That ordering guarantees
   * exactly ONE confirmation per discard and an unobstructed pop (the
   * previous synchronous `cancelEdit() + goBack()` re-entered the still-
   * enabled guard and double-prompted).
   */
  const discardAndPop = (replay?: NavigationAction) => {
    deps.dashboardStore.getState().cancelEdit();
    setPendingExit({ action: replay ?? null });
  };
  const [pendingExit, setPendingExit] = React.useState<{
    readonly action: NavigationAction | null;
  } | null>(null);
  React.useEffect(() => {
    if (pendingExit === null) {
      return;
    }
    setPendingExit(null);
    if (pendingExit.action) {
      // Replay the PREVENTED removal (native swipe / dispatched pop).
      navigation.dispatch(pendingExit.action);
    } else {
      navigation.goBack();
    }
  }, [pendingExit, navigation]);

  // Exit invalidation: when THIS editor route leaves the stack for any
  // reason (a pop that bypassed the guard, replacement, teardown), a draft
  // still open for its scope is discarded — no stale draft can ever
  // outlive its editor. Tab-leave discards the draft BEFORE anything else:
  // the composition root's `onSettingsLeave` runs `cancelEdit()` on blur
  // and the stack reset pops one macrotask later (the editor's re-render
  // clears `dirty` first — no discard dialog on tab leave), so this
  // unmount cleanup stays as the backstop for pops that bypass both paths;
  // the draft is in every case discarded, never persisted.
  const scopeRef = React.useRef({
    templateId: route.params.templateId,
    roomId: route.params.roomId,
  });
  React.useEffect(
    () => () => {
      const store = deps.dashboardStore.getState();
      if (
        store.editMode &&
        store.editorTemplateId === scopeRef.current.templateId &&
        store.editorRoomId === scopeRef.current.roomId
      ) {
        store.cancelEdit();
      }
    },
    [deps.dashboardStore],
  );

  return (
    <>
      <EditRoomDashboardScreen
        template={template}
        roomId={route.params.roomId}
        rooms={rooms}
        devices={devices}
        capabilities={capabilities}
        registry={deps.widgetRegistry}
        services={services}
        editMode={editMode}
        draftWidgets={draftWidgets}
        onOpenDraft={() =>
          deps.dashboardStore
            .getState()
            .enterEdit(route.params.templateId, route.params.roomId)
        }
        onCancel={() => {
          // Hủy/back: discard the draft FIRST, then leave via THE one
          // discard path — never persists (the exact pre-edit layout
          // remains) and never double-prompts.
          discardAndPop();
        }}
        onSave={saveDraft}
        onAddWidget={async (input: AddWidgetInput) =>
          toOutcome(
            await deps.dashboardService.addWidget(
              route.params.templateId,
              route.params.roomId,
              input,
            ),
          )
        }
        onDuplicateWidget={async (widgetId, targetRoomId) =>
          toOutcome(
            await deps.dashboardService.duplicateWidgetToRoom(
              route.params.templateId,
              route.params.roomId,
              widgetId,
              targetRoomId,
            ),
          )
        }
        onMoveWidget={async (widgetId, targetRoomId) =>
          toOutcome(
            await deps.dashboardService.moveWidgetToRoom(
              route.params.templateId,
              route.params.roomId,
              widgetId,
              targetRoomId,
            ),
          )
        }
        onDraftMove={(widgetId, x, y) =>
          deps.dashboardStore.getState().moveWidget(widgetId, x, y)
        }
        onDraftSwapPositions={(widgetIdA, widgetIdB) =>
          deps.dashboardStore
            .getState()
            .swapDraftPositions(widgetIdA, widgetIdB)
        }
        onDraftResize={(widgetId, size: WidgetSize) =>
          deps.dashboardStore.getState().resizeWidget(widgetId, size)
        }
        onDraftRemove={widgetId =>
          deps.dashboardStore.getState().removeWidget(widgetId)
        }
        onDraftRename={(widgetId, title) =>
          deps.dashboardStore.getState().renameDraftWidget(widgetId, title)
        }
        onDraftRebind={(widgetId, deviceId, capability: CapabilityType) =>
          deps.dashboardStore
            .getState()
            .rebindDraftWidget(widgetId, deviceId, capability)
        }
        onDraftSwapBindings={(widgetIdA, widgetIdB) =>
          deps.dashboardStore.getState().swapDraftBindings(widgetIdA, widgetIdB)
        }
      />
      {/* Pop-guard dialog: discard the dirty draft and complete the pop,
          or stay in the editor (nothing is persisted either way). */}
      <ConfirmDialog
        visible={discardPop}
        title={STRINGS.templates.discardChanges}
        message={STRINGS.dashboard.editHint}
        destructive
        confirmLabel={STRINGS.templates.discardConfirm}
        confirmTestID="room-edit-discard-confirm"
        dismissTestID="room-edit-discard-dismiss"
        onConfirm={() => {
          setDiscardPop(false);
          const action = pendingPopRef.current;
          pendingPopRef.current = null;
          discardAndPop(action ?? undefined);
        }}
        onDismiss={() => {
          setDiscardPop(false);
          pendingPopRef.current = null;
        }}
      />
    </>
  );
}
