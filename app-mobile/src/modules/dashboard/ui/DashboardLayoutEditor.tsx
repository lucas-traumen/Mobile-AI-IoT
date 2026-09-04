/**
 * DashboardLayoutEditor — dashboard-owned draft editor rendered under the
 * Settings tab (CP-R2/CP-R3 + settings-information-architecture plan).
 *
 * The screen is dumb: the app-layer Settings coordinator wires it to the
 * dashboard service/store. Behavior:
 *
 * - Not editing: dashboard chips (+ inline create row, a dashboard-level
 *   mutation allowed only here), room chips and a "Sửa" button that opens
 *   the draft editor for the selected room.
 * - Editing (`editMode`): the draft holds ALL widgets of the dashboard; the
 *   canvas renders only the selected room's widgets + global widgets
 *   (`filterWidgetsForRoom(draft, editorRoomId)`). Move/resize/remove and
 *   "+ Thêm widget" mutate the draft; Save persists the whole draft
 *   atomically through `DashboardService.applyLayout` (other rooms are
 *   preserved because the room-aware layout engine scopes collisions);
 *   Cancel/back discards the draft.
 * - Room chips while editing switch `editorRoomId` without resetting the
 *   draft, so the same draft session can touch several rooms.
 * - AddWidgetFlow is editor-room authoritative: it receives the room being
 *   edited, filters device candidates to it and never asks for a room.
 * - Non-overlapping editor chrome: the grid gets `editorChrome` so the
 *   move/delete/resize controls render in a dedicated bar per card.
 * - Responsive repair (approved): the editor content is bounded and
 *   centered on wide web canvases (`maxWidth` + centered container), and
 *   the header uses flex gaps so its elements never concatenate.
 * - General operation feedback (create/save/add-widget outcomes) appears
 *   in the top-center banner; the destructive delete-dashboard action
 *   keeps its confirmation dialog with the inline error inside it.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { STRINGS } from '@core/i18n';
import { useTheme } from '@core/theme';
import {
  OperationBanner,
  useOperationFeedback,
} from '@core/ui/OperationBanner';

import {
  computeGridMetrics,
  filterWidgetsForRoom,
  gridContentHeight,
  resolveCanvasWidth,
  type AddWidgetInput,
  type Dashboard,
} from '@modules/dashboard/api';
import type {
  CapabilityDef,
  CapabilityType,
  Device,
  Room,
} from '@modules/devices/api';
import type {
  WidgetConfig,
  WidgetRegistry,
  WidgetServices,
  WidgetSize,
} from '@modules/widgets/api';
import { WidgetServicesProvider } from '@modules/widgets/api';

import { AddWidgetFlow } from './AddWidgetFlow';
import { DashboardGrid } from './DashboardGrid';

/** Maximum content width on wide canvases (web repair, approved). */
const MAX_EDITOR_WIDTH = 720;

interface DashboardLayoutEditorProps {
  /** All dashboards (chips). */
  readonly dashboards: readonly Dashboard[];
  /** Id of the active dashboard. */
  readonly activeId: string;
  /** The shared active room (default editor room / view selection). */
  readonly activeRoomId: string | null;
  /** True while a draft is open. */
  readonly editMode: boolean;
  /** The open draft (ALL widgets of the dashboard, other rooms included). */
  readonly draftWidgets: readonly WidgetConfig[] | null;
  /** Room being edited while a draft is open. */
  readonly editorRoomId: string | null;
  /** Rooms (editor room chips + AddWidgetFlow). */
  readonly rooms: readonly Room[];
  readonly devices: readonly Device[];
  /** Capability catalog (binding candidates + labels). */
  readonly capabilities?: readonly CapabilityDef[];
  /** The widget registry (resolves components + rules). */
  readonly registry: WidgetRegistry;
  /** Runtime widget services (grid re-renders live widgets in edit mode). */
  readonly services: WidgetServices;
  /** Open the draft editor for a dashboard + room. */
  readonly onEnterEdit: (dashboardId: string, roomId: string) => void;
  /** Discard the draft + leave edit mode (stays on the editor screen). */
  readonly onCancelEdit: () => void;
  /**
   * Leave the editor screen entirely (back to the Settings root). Wired by
   * the coordinator, which also cleans up any open draft — the back button
   * is always available, with or without a draft (fix cycle 1).
   */
  readonly onBack: () => void;
  /**
   * Persist the draft atomically. Resolves with the service outcome so the
   * editor can show an error and stay open on failure.
   */
  readonly onSaveLayout: () => Promise<{ ok: boolean; message: string }>;
  /** Draft move (sync; `false` → card snaps back). */
  readonly onDraftMove: (widgetId: string, x: number, y: number) => boolean;
  /** Draft resize (sync; `false` → size stays). */
  readonly onDraftResize: (widgetId: string, size: WidgetSize) => boolean;
  /** Draft remove (compacts the draft vertically, room-aware). */
  readonly onDraftRemove: (widgetId: string) => void;
  /** Repair a lost widget binding (device + capability picked by the user). */
  readonly onRebindWidget: (
    widgetId: string,
    deviceId: string,
    capability: CapabilityType,
  ) => void;
  /** Switch the active dashboard. */
  readonly onSelectDashboard: (id: string) => void;
  /** Switch the room being edited (draft preserved). */
  readonly onSelectEditorRoom: (id: string) => void;
  /** Create a new dashboard (inline name from the "+" row). The row stays
   *  open on failure and the error is shown. */
  readonly onCreateDashboard: (
    name: string,
  ) => Promise<{ ok: boolean; message: string }>;
  /**
   * Delete a dashboard (CP-R2: reachable only under Settings). Resolves
   * with the service outcome so the confirmation dialog stays open and the
   * error is shown on failure; on success the service has already re-pointed
   * the active selection to a remaining dashboard.
   */
  readonly onDeleteDashboard: (
    id: string,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Add a widget to the draft (service assembles + places it). */
  readonly onAddWidget: (
    input: AddWidgetInput,
  ) => Promise<{ ok: boolean; message: string }>;
}

/**
 * The dashboard layout editor screen.
 *
 * @param props - see {@link DashboardLayoutEditorProps}.
 */
export function DashboardLayoutEditor({
  dashboards,
  activeId,
  activeRoomId,
  editMode,
  draftWidgets,
  editorRoomId,
  rooms,
  devices,
  capabilities,
  registry,
  services,
  onEnterEdit,
  onCancelEdit,
  onBack,
  onSaveLayout,
  onDraftMove,
  onDraftResize,
  onDraftRemove,
  onRebindWidget,
  onSelectDashboard,
  onSelectEditorRoom,
  onCreateDashboard,
  onDeleteDashboard,
  onAddWidget,
}: DashboardLayoutEditorProps) {
  const { tokens } = useTheme();
  const { width, height } = useWindowDimensions();
  // Measured canvas: the grid shell's actual `onLayout` width is
  // authoritative once available; the window width is only the documented
  // fallback until the first positive layout event.
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  const [showCreateRow, setShowCreateRow] = useState(false);
  const [newName, setNewName] = useState('');
  const [showAddFlow, setShowAddFlow] = useState(false);
  // Delete-dashboard confirmation (CP-R2, fix cycle 2).
  const [deleting, setDeleting] = useState<Dashboard | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { feedback, show, clear } = useOperationFeedback();

  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const metrics = useMemo(
    () => computeGridMetrics(resolveCanvasWidth(canvasWidth, width)),
    [canvasWidth, width],
  );

  const activeDashboard =
    dashboards.find(d => d.id === activeId) ?? dashboards[0];

  // The room the editor works on: while editing use `editorRoomId`; before
  // opening the editor use the shared active room as the default selection.
  const roomBeingEdited = editMode ? editorRoomId : activeRoomId;
  const editorRoomName =
    rooms.find(room => room.id === roomBeingEdited)?.name ?? '';

  // Editing renders the draft scoped to the editor room + globals; the idle
  // state previews the same scope from the persisted dashboard.
  const canvasWidgets = useMemo(() => {
    if (editMode && draftWidgets) {
      return roomBeingEdited !== null
        ? filterWidgetsForRoom(draftWidgets, roomBeingEdited)
        : draftWidgets;
    }
    if (activeDashboard && roomBeingEdited !== null) {
      return filterWidgetsForRoom(activeDashboard.widgets, roomBeingEdited);
    }
    return [];
  }, [editMode, draftWidgets, activeDashboard, roomBeingEdited]);

  const gridShellHeight = useMemo(() => {
    const content = gridContentHeight(canvasWidgets, metrics);
    return Math.max(content, height * 0.6);
  }, [canvasWidgets, metrics, height]);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const result = await onCreateDashboard(name);
    if (!result.ok) {
      // Keep the create row open; surface the service failure (banner).
      show({ severity: 'error', message: result.message });
      return;
    }
    setNewName('');
    setShowCreateRow(false);
    show({ severity: 'success', message: 'Đã tạo dashboard' });
  };

  const handleSave = async () => {
    const result = await onSaveLayout();
    show({
      severity: result.ok ? 'success' : 'error',
      message: result.ok ? 'Đã lưu bố cục' : result.message,
    });
  };

  const handleAddWidget = async (input: AddWidgetInput) => {
    const result = await onAddWidget(input);
    if (!result.ok) {
      show({ severity: 'error', message: result.message });
      return;
    }
    setShowAddFlow(false);
  };

  const confirmDelete = async () => {
    if (!deleting) {
      return;
    }
    setDeleteError(null);
    const result = await onDeleteDashboard(deleting.id);
    if (!result.ok) {
      // Keep the dialog open and truthful about the failure.
      setDeleteError(result.message || 'Lỗi');
      return;
    }
    setDeleting(null);
    setDeleteError(null);
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, styles.headerBounded]}>
          <Pressable
            style={styles.editHeaderButton}
            testID="dashboard-editor-back"
            onPress={onBack}
          >
            <Ionicons name="arrow-back" size={18} color={tokens.primary} />
            <Text style={[styles.editHeaderText, { color: tokens.primary }]}>
              {STRINGS.settings.back}
            </Text>
          </Pressable>
          <Text
            style={[styles.screenTitle, { flexShrink: 1 }]}
            numberOfLines={1}
          >
            {STRINGS.settings.editDashboard}
          </Text>
          {editMode ? (
            <Pressable style={styles.editHeaderButton} onPress={onCancelEdit}>
              <Text style={[styles.editHeaderText, { color: tokens.danger }]}>
                {STRINGS.settings.cancel}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {!editMode ? (
          <View style={[styles.switcher, styles.bodyBounded]}>
            {dashboards.map(dashboard => {
              const deletable = dashboards.length > 1;
              return (
                <View
                  key={dashboard.id}
                  style={[
                    styles.chipShell,
                    dashboard.id === activeId && styles.chipActive,
                  ]}
                >
                  <Pressable
                    style={styles.chipLabel}
                    onPress={() => onSelectDashboard(dashboard.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        dashboard.id === activeId && styles.chipTextActive,
                      ]}
                    >
                      {dashboard.name}
                    </Text>
                  </Pressable>
                  {deletable ? (
                    <Pressable
                      style={styles.chipDelete}
                      testID={`dashboard-delete-${dashboard.id}`}
                      accessibilityLabel={`${STRINGS.dashboard.removeDashboard} ${dashboard.name}`}
                      onPress={() => {
                        setDeleteError(null);
                        setDeleting(dashboard);
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={13}
                        color={tokens.danger}
                      />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <Pressable
              style={styles.chipAdd}
              onPress={() => setShowCreateRow(v => !v)}
            >
              <Text style={styles.chipAddText}>+</Text>
            </Pressable>
          </View>
        ) : null}

        {showCreateRow ? (
          <View style={[styles.createRow, styles.bodyBounded]}>
            <TextInput
              style={styles.createInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={STRINGS.dashboard.addDashboard}
              placeholderTextColor={tokens.textSecondary}
              onSubmitEditing={submitCreate}
              autoFocus
            />
            <Pressable style={styles.createButton} onPress={submitCreate}>
              <Text style={styles.createButtonText}>{STRINGS.widgets.add}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.roomSectionLabel, styles.bodyBounded]}>
          {STRINGS.dashboard.editorRoom}
        </Text>
        <View style={[styles.roomChips, styles.bodyBounded]}>
          {rooms.map(room => {
            const active = room.id === roomBeingEdited;
            return (
              <Pressable
                key={room.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  if (editMode) {
                    onSelectEditorRoom(room.id);
                  } else if (activeDashboard) {
                    onEnterEdit(activeDashboard.id, room.id);
                  }
                }}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {room.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rooms.length === 0 ? (
          <Text style={styles.emptyHint}>{STRINGS.dashboard.noRooms}</Text>
        ) : editMode ? (
          <Text style={styles.editHint}>{STRINGS.dashboard.editHint}</Text>
        ) : null}

        {activeDashboard && rooms.length > 0 ? (
          <WidgetServicesProvider services={services}>
            <View
              style={[
                styles.gridShell,
                styles.bodyBounded,
                { height: gridShellHeight },
              ]}
              onLayout={event => {
                setCanvasWidth(event.nativeEvent.layout.width);
              }}
            >
              {canvasWidgets.length === 0 ? (
                <Text style={styles.emptyHint}>
                  {STRINGS.dashboard.noWidgetsEditor}
                </Text>
              ) : (
                <DashboardGrid
                  widgets={canvasWidgets}
                  registry={registry}
                  editMode={editMode}
                  metrics={metrics}
                  onMoveWidget={onDraftMove}
                  onResizeWidget={onDraftResize}
                  onRemoveWidget={onDraftRemove}
                  onRebindWidget={onRebindWidget}
                  editorChrome
                />
              )}
            </View>
          </WidgetServicesProvider>
        ) : null}

        {editMode ? (
          <View style={[styles.editFooter, styles.bodyBounded]}>
            <Pressable
              style={[styles.toolbarButton, styles.toolbarPrimary]}
              onPress={() => setShowAddFlow(true)}
            >
              <Text style={styles.toolbarPrimaryText}>
                + {STRINGS.dashboard.addWidget}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toolbarButton, styles.toolbarPrimary]}
              onPress={() => {
                void handleSave();
              }}
            >
              <Text style={styles.toolbarPrimaryText}>
                {STRINGS.dashboard.saveLayout}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {showAddFlow && editMode && roomBeingEdited !== null ? (
        <AddWidgetFlow
          editorRoomId={roomBeingEdited}
          editorRoomName={editorRoomName}
          devices={devices}
          capabilities={capabilities}
          widgets={
            // Duplicate prevention must track the WORKING list: while a
            // draft is open the draft hides choices, otherwise the
            // persisted layout does.
            editMode && draftWidgets !== null
              ? draftWidgets
              : activeDashboard?.widgets ?? []
          }
          onAdd={input => {
            void handleAddWidget(input);
          }}
          onCancel={() => setShowAddFlow(false)}
        />
      ) : null}

      {/* Top-center operation feedback (delete-dialog error stays inline). */}
      <OperationBanner feedback={feedback} onDismiss={clear} />

      {/* Delete-dashboard confirmation (CP-R2, Settings-owned mutation). */}
      <Modal
        visible={deleting !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleting(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: tokens.textPrimary }]}>
              {STRINGS.dashboard.removeDashboard}
            </Text>
            <Text style={[styles.modalText, { color: tokens.textSecondary }]}>
              {STRINGS.dashboard.removeDashboardConfirm.replace(
                '{name}',
                deleting?.name ?? '',
              )}
            </Text>
            {deleteError ? (
              <Text style={[styles.errorText, { color: tokens.danger }]}>
                {deleteError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { borderColor: tokens.border }]}
                onPress={() => setDeleting(null)}
              >
                <Text
                  style={[
                    styles.modalButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.settings.cancel}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: tokens.danger,
                    borderColor: tokens.danger,
                  },
                ]}
                testID="dashboard-delete-confirm"
                onPress={() => {
                  void confirmDelete();
                }}
              >
                <Text
                  style={[styles.modalButtonText, { color: tokens.onPrimary }]}
                >
                  {STRINGS.settings.confirm}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(tokens: {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  success: string;
  danger: string;
  border: string;
}) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingBottom: 80 },
    // Web width repair: bounded, centered column on wide canvases. The
    // header and body blocks align to the same max width.
    headerBounded: {
      width: '100%',
      maxWidth: MAX_EDITOR_WIDTH,
      alignSelf: 'center',
    },
    bodyBounded: {
      width: '100%',
      maxWidth: MAX_EDITOR_WIDTH,
      alignSelf: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    screenTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: tokens.textPrimary,
      flex: 1,
    },
    editHeaderButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    editHeaderText: { fontSize: 15, fontWeight: '700' },
    switcher: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    chip: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: tokens.surface,
    },
    chipActive: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    chipText: { fontSize: 13, color: tokens.textPrimary, fontWeight: '500' },
    chipTextActive: { color: tokens.onPrimary, fontWeight: '600' },
    chipAdd: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipAddText: { color: tokens.primary, fontSize: 18, fontWeight: '700' },
    createRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    createInput: {
      flex: 1,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: tokens.textPrimary,
    },
    createButton: {
      backgroundColor: tokens.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    createButtonText: {
      color: tokens.onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    roomSectionLabel: {
      fontSize: 13,
      color: tokens.textSecondary,
      fontWeight: '500',
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 8,
    },
    roomChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    editHint: {
      fontSize: 13,
      color: tokens.textSecondary,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    editFooter: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    toolbarButton: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tokens.border,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: tokens.surface,
    },
    toolbarPrimary: {
      backgroundColor: tokens.primary,
      borderColor: tokens.primary,
    },
    toolbarPrimaryText: {
      color: tokens.onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    // The explicit height is applied inline (gridShellHeight) so the shell
    // matches the canvas row extent exactly. The inline `onLayout` reports
    // the real canvas width up to `computeGridMetrics` (drag snapping uses
    // the same metrics as the rendered rects).
    gridShell: {},
    emptyHint: {
      color: tokens.textSecondary,
      textAlign: 'center',
      marginTop: 24,
      fontSize: 14,
      paddingHorizontal: 32,
    },
    errorText: {
      color: tokens.danger,
      fontSize: 13,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    chipShell: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 16,
      backgroundColor: tokens.surface,
      overflow: 'hidden',
    },
    chipLabel: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipDelete: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderLeftWidth: 1,
      borderLeftColor: tokens.border,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 8,
    },
    modalText: {
      fontSize: 14,
      lineHeight: 20,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 16,
    },
    modalButton: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    modalButtonText: { fontSize: 14, fontWeight: '600' },
  });
}
