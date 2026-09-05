/**
 * EditRoomDashboardScreen — the room-scoped draft editor (official
 * hierarchy, deepest level): ONE draft owns exactly ONE Template-room
 * layout. Header actions are `Hủy` (discard) and `Lưu` (atomic save); card
 * controls provide drag (a drop onto an occupied same-section cell SWAPS
 * the two positions — fix cycle 8 L; free cells move as before), resize
 * (chrome bar) and an overflow menu with rename, configure/rebind,
 * duplicate-to-room, move-to-room and delete; `+ Thêm widget` opens the
 * room-authoritative add flow.
 *
 * Draft semantics (atomic Save/Cancel):
 * - the draft is a working copy of the Template's widgets; the editor
 *   renders/edits only the selected room's scope (`filterWidgetsForRoom`),
 * - `Lưu` commits the WHOLE draft end-state (the edited room PLUS any
 *   cross-room duplicate/move destinations) through
 *   `DashboardService.applyTemplateLayouts` in ONE atomic multi-room save —
 *   authoritative about uniqueness, bindings and layout; unlisted rooms
 *   stay byte-equivalent,
 * - `Hủy`, Android/native back (with an explicit discard confirmation when
 *   the draft is dirty) and tab leave never persist the draft — Cancel
 *   restores the exact pre-edit layout, unknown custom fields included.
 *
 * Reuse: the grid/widget modules (`DashboardGrid`, `WidgetRenderer`,
 * `AddWidgetFlow`) and the pure layout engine are shared with the view
 * screen; this screen adds NO persistence logic of its own.
 */

import React, { useMemo, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  resolveCanvasWidth,
} from '../internal/domain/gridMetrics';
import { filterWidgetsForRoom } from '../internal/domain/roomFilter';
import {
  groupWidgets,
  sectionBaseY,
  sectionContentHeight,
} from '../internal/domain/sectionGroups';
import type { DashboardTemplate } from '../internal/domain/dashboardSchema';
import type { AddWidgetInput } from '../internal/services/dashboardService';
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
import {
  effectiveCapabilities,
  WidgetServicesProvider,
} from '@modules/widgets/api';
import { useEffect } from 'react';

import { AddWidgetFlow } from './AddWidgetFlow';
import { ConfirmDialog, type ActionOutcome } from './ConfirmDialog';
import { DashboardGrid } from './DashboardGrid';

interface EditRoomDashboardScreenProps {
  /** The Template owning the room reference. */
  readonly template: DashboardTemplate | undefined;
  /** The referenced physical room id. */
  readonly roomId: string;
  /** All physical rooms (header name + candidate filtering). */
  readonly rooms: readonly Room[];
  readonly devices: readonly Device[];
  /** Capability catalog (binding candidates + labels). */
  readonly capabilities?: readonly CapabilityDef[];
  /** The widget registry (resolves components + rules). */
  readonly registry: WidgetRegistry;
  /** Runtime widget services (live widgets render inside the editor). */
  readonly services: WidgetServices;
  /** True while a draft is open (store editMode). */
  readonly editMode: boolean;
  /** The open draft (ALL widgets of the Template, other rooms included). */
  readonly draftWidgets: readonly WidgetConfig[] | null;
  /** Open the draft (enterEdit) — called by the navigator on mount. */
  readonly onOpenDraft: () => void;
  /** Hủy: discard the draft + leave the editor (single discard flow). */
  readonly onCancel: () => void;
  /** Lưu: commit the whole draft end-state atomically (stays open on
   * failure; after success the editor stays open in a clean state). */
  readonly onSave: () => Promise<ActionOutcome>;
  /** Draft move (sync; `false` → card snaps back). */
  readonly onDraftMove: (widgetId: string, x: number, y: number) => boolean;
  /**
   * Draft position SWAP between two same-section widgets (fix cycle 8 L —
   * drag-to-swap): dropping a card onto an occupied cell exchanges the two
   * positions in the DRAFT. `false` → rejected (both cards snap back).
   */
  readonly onDraftSwapPositions: (
    widgetIdA: string,
    widgetIdB: string,
  ) => boolean;
  /** Draft resize (sync; `false` → size stays). */
  readonly onDraftResize: (widgetId: string, size: WidgetSize) => boolean;
  /** Draft remove. */
  readonly onDraftRemove: (widgetId: string) => void;
  /** Draft rename (title). */
  readonly onDraftRename: (widgetId: string, title: string) => void;
  /** Draft rebind (device + capability). */
  readonly onDraftRebind: (
    widgetId: string,
    deviceId: string,
    capability: CapabilityType,
  ) => void;
  /**
   * Draft binding SWAP between two same-room widgets (fix cycle 7 G): the
   * explicit resolution for the room's one-source-per-room uniqueness
   * rule. `false` → the swap was rejected (draft untouched).
   */
  readonly onDraftSwapBindings: (
    widgetIdA: string,
    widgetIdB: string,
  ) => boolean;
  /** Add a widget to the draft (service assembles + places it). */
  readonly onAddWidget: (input: AddWidgetInput) => Promise<ActionOutcome>;
  /** Duplicate a draft widget into another room of this Template. */
  readonly onDuplicateWidget: (
    widgetId: string,
    targetRoomId: string,
  ) => Promise<ActionOutcome>;
  /** Move a draft widget to another room of this Template (atomic). */
  readonly onMoveWidget: (
    widgetId: string,
    targetRoomId: string,
  ) => Promise<ActionOutcome>;
}

/**
 * The room-scoped edit screen.
 *
 * @param props - see {@link EditRoomDashboardScreenProps}.
 */
export function EditRoomDashboardScreen({
  template,
  roomId,
  rooms,
  devices,
  capabilities = [],
  registry,
  services,
  editMode,
  draftWidgets,
  onOpenDraft,
  onCancel,
  onSave,
  onDraftMove,
  onDraftSwapPositions,
  onDraftResize,
  onDraftRemove,
  onDraftRename,
  onDraftRebind,
  onDraftSwapBindings,
  onAddWidget,
  onDuplicateWidget,
  onMoveWidget,
}: EditRoomDashboardScreenProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { feedback, exiting, show, clear } = useOperationFeedback();

  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [configTitle, setConfigTitle] = useState('');
  // Swap-confirm state (fix cycle 7 G): set when the user picks a source
  // ANOTHER widget in the room already holds — confirming exchanges the
  // two widgets' bindings (draft-level; Save persists atomically).
  const [swapPending, setSwapPending] = useState<{
    readonly holderId: string;
    readonly holderName: string;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [pickingRoomFor, setPickingRoomFor] = useState<{
    readonly widgetId: string;
    readonly mode: 'duplicate' | 'move';
  } | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const roomName = rooms.find(room => room.id === roomId)?.name ?? roomId;

  // The edited scope: draft widgets of THIS room (globals cannot exist in
  // the Template model — every placement lives in a room reference).
  const roomWidgets = useMemo(
    () =>
      (editMode && draftWidgets
        ? filterWidgetsForRoom(draftWidgets, roomId)
        : []
      ).filter(widget => widget.roomId === roomId),
    [editMode, draftWidgets, roomId],
  );

  // Dirty check: the FULL draft vs the Template's persisted widget set
  // (JSON so unknown custom fields count too). The draft spans the whole
  // Template — a cross-room duplicate/move changes OTHER rooms' slices
  // while this room's slice may stay identical, so the exit guards
  // (Android back here, beforeRemove on the route) must compare the whole
  // draft end-state, not just the edited room's slice.
  const dirty = useMemo(() => {
    if (!editMode || !draftWidgets || !template) {
      return false;
    }
    const persisted = template.rooms.flatMap(room => room.widgets);
    return JSON.stringify(draftWidgets) !== JSON.stringify(persisted);
  }, [editMode, draftWidgets, template]);

  const metrics = useMemo(
    () => computeGridMetrics(resolveCanvasWidth(canvasWidth, 720)),
    [canvasWidth],
  );
  // Section-aware editor layout (fix cycle 7 H — WYSIWYG): the editor
  // renders the SAME two sections as the view screens ("Môi trường" =
  // sensor-value, "Thiết bị" = switch + others) with the SAME
  // section-local row rebase (layoutYOffset = sectionBaseY). Persisted
  // coordinates stay dashboard-absolute and canonical — the rebase is
  // presentation-only, exactly like view mode. A widget's section is
  // decided by its TYPE, so a widget can never visually cross sections.
  const sections = useMemo(() => groupWidgets(roomWidgets), [roomWidgets]);
  const envBaseY = useMemo(
    () => sectionBaseY(sections.environment),
    [sections.environment],
  );
  const deviceBaseY = useMemo(
    () => sectionBaseY(sections.devices),
    [sections.devices],
  );
  const envHeight = useMemo(
    () => sectionContentHeight(sections.environment, metrics),
    [sections.environment, metrics],
  );
  const deviceHeight = useMemo(
    () => sectionContentHeight(sections.devices, metrics),
    [sections.devices, metrics],
  );
  const gridShellHeight = useMemo(() => {
    // Each non-empty section reserves its rebased content extent + the
    // section label row; empty sections render nothing (as in view mode).
    let height = 0;
    if (sections.environment.length > 0) {
      height += envHeight + SECTION_LABEL_ROW;
    }
    if (sections.devices.length > 0) {
      height += deviceHeight + SECTION_LABEL_ROW;
    }
    return Math.max(height, 320);
  }, [sections, envHeight, deviceHeight]);

  // Open the draft exactly once per editor visit (the screen owns one
  // Template-room draft for its lifetime).
  useEffect(() => {
    if (!editMode) {
      onOpenDraft();
    }
  }, [editMode, onOpenDraft]);

  const leaveEditor = () => {
    onCancel();
  };

  // Android/native back during an unsaved edit: request explicit discard
  // confirmation when dirty; otherwise cancel silently (never persist).
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (dirty) {
          setDiscardConfirm(true);
          return true;
        }
        leaveEditor();
        return true;
      },
    );
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const handleSave = async () => {
    const result = await onSave();
    show({
      severity: result.ok ? 'success' : 'error',
      message: result.ok ? STRINGS.templates.savedLayout : result.message,
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

  const menuWidget = roomWidgets.find(w => w.id === menuFor) ?? null;

  /** Other room references of this Template (duplicate/move destinations). */
  const targetRooms = (widget: WidgetConfig | null): readonly string[] => {
    if (!template || !widget) {
      return [];
    }
    return template.rooms
      .filter(room => room.roomId !== roomId)
      .map(room => room.roomId)
      .filter(targetRoomId => {
        if (!widget.binding) {
          // Unbound (no binding) — compatible with every room.
          return true;
        }
        const boundDevice = devices.find(
          device => device.id === widget.binding?.deviceId,
        );
        // Unknown device (lost binding) → let the user choose; the service
        // remains the authoritative validation seam.
        return !boundDevice || boundDevice.roomId === targetRoomId;
      });
  };

  const pickRoom = async (targetRoomId: string) => {
    if (!pickingRoomFor) {
      return;
    }
    const { widgetId, mode } = pickingRoomFor;
    setPickingRoomFor(null);
    const result =
      mode === 'duplicate'
        ? await onDuplicateWidget(widgetId, targetRoomId)
        : await onMoveWidget(widgetId, targetRoomId);
    if (!result.ok) {
      show({ severity: 'error', message: result.message });
    }
  };

  const submitRename = () => {
    if (!renaming) {
      return;
    }
    onDraftRename(renaming, renameValue);
    setRenaming(null);
  };

  const submitConfigure = () => {
    if (!configuring) {
      return;
    }
    onDraftRename(configuring, configTitle);
    closeConfigureDialog();
  };

  const configureCandidateList = useMemo(
    () =>
      configureCandidates(
        configuring,
        roomWidgets,
        devices,
        capabilities,
        registry,
      ),
    [configuring, roomWidgets, devices, capabilities, registry],
  );

  /**
   * The OTHER widget of this room currently holding the candidate source
   * (room-level uniqueness rule: one widget per source) — `null` when the
   * source is free (or held by the configured widget itself).
   */
  const bindingHolderFor = (
    deviceId: string,
    capability: string,
  ): WidgetConfig | null => {
    if (!configuring) {
      return null;
    }
    return (
      roomWidgets.find(
        widget =>
          widget.id !== configuring &&
          widget.binding?.deviceId === deviceId &&
          widget.binding?.capability === capability,
      ) ?? null
    );
  };

  const closeConfigureDialog = () => {
    setConfiguring(null);
    setSwapPending(null);
  };

  if (!template) {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onCancel} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={tokens.primary} />
          </Pressable>
          <Text style={styles.title}>{STRINGS.templates.backToTemplates}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <OperationBanner
        feedback={feedback}
        exiting={exiting}
        onDismiss={clear}
      />
      {/* Header: Hủy | title | Lưu (specified actions). */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerAction}
          onPress={leaveEditor}
          testID="room-edit-cancel"
          accessibilityRole="button"
        >
          <Text style={[styles.headerActionText, { color: tokens.danger }]}>
            {STRINGS.templates.cancel}
          </Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {roomName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {STRINGS.dashboard.editTitle} · {template.name}
          </Text>
        </View>
        <Pressable
          style={styles.headerAction}
          onPress={() => {
            void handleSave();
          }}
          testID="room-edit-save"
          accessibilityRole="button"
        >
          <Text style={[styles.headerActionText, { color: tokens.primary }]}>
            {STRINGS.templates.save}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <WidgetServicesProvider services={services}>
          <View
            style={[styles.gridShell, { height: gridShellHeight }]}
            onLayout={event => {
              setCanvasWidth(event.nativeEvent.layout.width);
            }}
          >
            {roomWidgets.length === 0 ? (
              <Text style={styles.emptyHint}>
                {STRINGS.dashboard.noWidgetsEditor}
              </Text>
            ) : (
              <>
                {/* "Môi trường" (sensor-value) — the SAME section split +
                    section-local rebase as the view screens (WYSIWYG):
                    persisted coords stay dashboard-absolute, the grid
                    rebases section-local drag rows back to absolute. */}
                {sections.environment.length > 0 ? (
                  <>
                    <View style={styles.sectionLabel}>
                      <Text style={styles.sectionLabelText}>
                        {STRINGS.dashboard.environment}
                      </Text>
                    </View>
                    <View style={{ height: envHeight }}>
                      <DashboardGrid
                        widgets={sections.environment}
                        registry={registry}
                        editMode
                        metrics={metrics}
                        layoutYOffset={envBaseY}
                        onMoveWidget={onDraftMove}
                        onSwapWidgets={onDraftSwapPositions}
                        onResizeWidget={(widgetId, size) =>
                          onDraftResize(widgetId, size)
                        }
                        onRemoveWidget={onDraftRemove}
                        editorChrome
                        onWidgetMenu={widgetId => {
                          setMenuFor(widgetId);
                        }}
                      />
                    </View>
                  </>
                ) : null}
                {/* "Thiết bị" (switch + others). */}
                {sections.devices.length > 0 ? (
                  <>
                    <View style={styles.sectionLabel}>
                      <Text style={styles.sectionLabelText}>
                        {STRINGS.dashboard.devices}
                      </Text>
                    </View>
                    <View style={{ height: deviceHeight }}>
                      <DashboardGrid
                        widgets={sections.devices}
                        registry={registry}
                        editMode
                        metrics={metrics}
                        layoutYOffset={deviceBaseY}
                        onMoveWidget={onDraftMove}
                        onSwapWidgets={onDraftSwapPositions}
                        onResizeWidget={(widgetId, size) =>
                          onDraftResize(widgetId, size)
                        }
                        onRemoveWidget={onDraftRemove}
                        editorChrome
                        onWidgetMenu={widgetId => {
                          setMenuFor(widgetId);
                        }}
                      />
                    </View>
                  </>
                ) : null}
              </>
            )}
          </View>
        </WidgetServicesProvider>

        <Pressable
          style={[styles.addWidgetButton, { backgroundColor: tokens.primary }]}
          onPress={() => setShowAddFlow(true)}
          testID="room-edit-add-widget"
          accessibilityRole="button"
          accessibilityLabel={STRINGS.dashboard.addWidget}
        >
          <Text style={[styles.addWidgetText, { color: tokens.onPrimary }]}>
            + {STRINGS.dashboard.addWidget}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Add-widget flow (editor-room authoritative, one tap). */}
      {showAddFlow && editMode ? (
        <AddWidgetFlow
          editorRoomId={roomId}
          editorRoomName={roomName}
          devices={devices}
          capabilities={capabilities}
          widgets={draftWidgets ?? []}
          onAdd={input => {
            void handleAddWidget(input);
          }}
          onCancel={() => setShowAddFlow(false)}
        />
      ) : null}

      {/* Widget overflow menu (rename/configure/duplicate/move/delete). */}
      <Modal
        visible={menuFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuFor(null)}>
          <View
            style={[
              styles.menuCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.menuTitle, { color: tokens.textSecondary }]}>
              {menuWidget?.title ?? menuWidget?.type ?? ''}
            </Text>
            <Pressable
              style={styles.menuRow}
              testID="widget-menu-rename"
              onPress={() => {
                setRenameValue(menuWidget?.title ?? '');
                setRenaming(menuFor);
                setMenuFor(null);
              }}
            >
              <Ionicons
                name="pencil-outline"
                size={16}
                color={tokens.textPrimary}
              />
              <Text style={[styles.menuRowText, { color: tokens.textPrimary }]}>
                {STRINGS.templates.renameWidget}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              testID="widget-menu-configure"
              onPress={() => {
                setConfigTitle(menuWidget?.title ?? '');
                setConfiguring(menuFor);
                setMenuFor(null);
              }}
            >
              <Ionicons
                name="settings-outline"
                size={16}
                color={tokens.textPrimary}
              />
              <Text style={[styles.menuRowText, { color: tokens.textPrimary }]}>
                {STRINGS.templates.configureWidget}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              testID="widget-menu-duplicate"
              onPress={() => {
                if (menuFor) {
                  setPickingRoomFor({ widgetId: menuFor, mode: 'duplicate' });
                }
                setMenuFor(null);
              }}
            >
              <Ionicons
                name="copy-outline"
                size={16}
                color={tokens.textPrimary}
              />
              <Text style={[styles.menuRowText, { color: tokens.textPrimary }]}>
                {STRINGS.templates.duplicateWidget}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              testID="widget-menu-move"
              onPress={() => {
                if (menuFor) {
                  setPickingRoomFor({ widgetId: menuFor, mode: 'move' });
                }
                setMenuFor(null);
              }}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={16}
                color={tokens.textPrimary}
              />
              <Text style={[styles.menuRowText, { color: tokens.textPrimary }]}>
                {STRINGS.templates.moveWidget}
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              testID="widget-menu-delete"
              onPress={() => {
                setConfirmingDelete(menuFor);
                setMenuFor(null);
              }}
            >
              <Ionicons name="trash-outline" size={16} color={tokens.danger} />
              <Text style={[styles.menuRowText, { color: tokens.danger }]}>
                {STRINGS.dashboard.deleteWidget}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Rename dialog (draft-only; persisted at Save). */}
      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(null)}
      >
        <View style={styles.menuBackdrop}>
          <View
            style={[
              styles.dialogCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.dialogTitle, { color: tokens.textPrimary }]}>
              {STRINGS.templates.renameWidget}
            </Text>
            <TextInput
              style={styles.input}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={STRINGS.templates.renameWidgetTitle}
              placeholderTextColor={tokens.textSecondary}
              autoFocus
              testID="widget-rename-input"
            />
            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.dialogButton, { borderColor: tokens.border }]}
                onPress={() => setRenaming(null)}
              >
                <Text
                  style={[
                    styles.dialogButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.templates.cancel}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogButton,
                  {
                    backgroundColor: tokens.primary,
                    borderColor: tokens.primary,
                  },
                ]}
                testID="widget-rename-submit"
                onPress={submitRename}
              >
                <Text
                  style={[styles.dialogButtonText, { color: tokens.onPrimary }]}
                >
                  {STRINGS.templates.save}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Configure dialog: title + room-compatible binding picker. A pick
          whose source another widget holds offers an explicit SWAP instead
          of a guaranteed save failure (uniqueness stays authoritative). */}
      <Modal
        visible={configuring !== null}
        transparent
        animationType="fade"
        onRequestClose={closeConfigureDialog}
      >
        <View style={styles.menuBackdrop}>
          <View
            style={[
              styles.dialogCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.dialogTitle, { color: tokens.textPrimary }]}>
              {STRINGS.templates.configureWidget}
            </Text>
            <TextInput
              style={styles.input}
              value={configTitle}
              onChangeText={setConfigTitle}
              placeholder={STRINGS.templates.renameWidgetTitle}
              placeholderTextColor={tokens.textSecondary}
              testID="widget-config-title"
            />
            <Text style={[styles.dialogHint, { color: tokens.textSecondary }]}>
              {STRINGS.widgets.chooseDevice} · {roomName}
            </Text>
            <ScrollView style={styles.pickerList}>
              {configureCandidateList.map(candidate => (
                <View key={candidate.device.id} style={styles.pickerDeviceRow}>
                  <Text
                    style={[
                      styles.pickerDeviceName,
                      { color: tokens.textPrimary },
                    ]}
                  >
                    {candidate.device.name}
                  </Text>
                  <View style={styles.pickerCapRow}>
                    {candidate.capabilities.map(capability => {
                      const holder = bindingHolderFor(
                        candidate.device.id,
                        capability,
                      );
                      return (
                        <Pressable
                          key={capability}
                          style={[
                            styles.capChip,
                            holder
                              ? { borderColor: tokens.primary }
                              : { borderColor: tokens.border },
                          ]}
                          testID={`widget-config-bind-${candidate.device.id}-${capability}`}
                          accessibilityLabel={
                            holder
                              ? `${capabilityLabel(
                                  capability,
                                  capabilities,
                                )} — ${STRINGS.widgets.swapBindingAction}`
                              : capabilityLabel(capability, capabilities)
                          }
                          onPress={() => {
                            if (!configuring) {
                              return;
                            }
                            if (holder) {
                              setSwapPending({
                                holderId: holder.id,
                                holderName:
                                  holder.title ??
                                  capabilityLabel(
                                    holder.binding?.capability ?? capability,
                                    capabilities,
                                  ),
                              });
                              return;
                            }
                            onDraftRebind(
                              configuring,
                              candidate.device.id,
                              capability,
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.capChipText,
                              { color: tokens.textPrimary },
                            ]}
                          >
                            {capabilityLabel(capability, capabilities)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              {configuring !== null && configureCandidateList.length === 0 ? (
                <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                  {STRINGS.widgets.disabled}
                </Text>
              ) : null}
            </ScrollView>
            {/* Swap confirmation: the picked source is held by another
                widget — Hoán đổi exchanges the two bindings (titles and
                positions unchanged); the uniqueness rule stays the
                authority and the swap is its explicit resolution. */}
            {swapPending ? (
              <View
                style={[styles.swapConfirmCard, { borderColor: tokens.border }]}
                testID="widget-config-swap"
              >
                <Text
                  style={[styles.dialogHint, { color: tokens.textSecondary }]}
                >
                  {STRINGS.widgets.swapBindingTitle} ·{' '}
                  {STRINGS.widgets.swapBindingConfirm.replace(
                    '{name}',
                    swapPending.holderName,
                  )}
                </Text>
                <View style={styles.dialogActions}>
                  <Pressable
                    style={[
                      styles.dialogButton,
                      { borderColor: tokens.border },
                    ]}
                    testID="widget-config-swap-dismiss"
                    onPress={() => setSwapPending(null)}
                  >
                    <Text
                      style={[
                        styles.dialogButtonText,
                        { color: tokens.textSecondary },
                      ]}
                    >
                      {STRINGS.templates.cancel}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.dialogButton,
                      {
                        backgroundColor: tokens.primary,
                        borderColor: tokens.primary,
                      },
                    ]}
                    testID="widget-config-swap-confirm"
                    onPress={() => {
                      if (configuring) {
                        onDraftSwapBindings(configuring, swapPending.holderId);
                      }
                      setSwapPending(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dialogButtonText,
                        { color: tokens.onPrimary },
                      ]}
                    >
                      {STRINGS.widgets.swapBindingAction}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.dialogButton, { borderColor: tokens.border }]}
                onPress={closeConfigureDialog}
              >
                <Text
                  style={[
                    styles.dialogButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.templates.close}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogButton,
                  {
                    backgroundColor: tokens.primary,
                    borderColor: tokens.primary,
                  },
                ]}
                testID="widget-config-submit"
                onPress={submitConfigure}
              >
                <Text
                  style={[styles.dialogButtonText, { color: tokens.onPrimary }]}
                >
                  {STRINGS.templates.save}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Duplicate/move destination picker (compatible rooms only). */}
      <Modal
        visible={pickingRoomFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickingRoomFor(null)}
      >
        <View style={styles.menuBackdrop}>
          <View
            style={[
              styles.dialogCard,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
          >
            <Text style={[styles.dialogTitle, { color: tokens.textPrimary }]}>
              {STRINGS.templates.chooseTargetRoom}
            </Text>
            {pickingRoomFor !== null &&
            targetRooms(
              roomWidgets.find(w => w.id === pickingRoomFor.widgetId) ?? null,
            ).length === 0 ? (
              <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                {STRINGS.templates.noCompatibleRoom}
              </Text>
            ) : null}
            <ScrollView style={styles.pickerList}>
              {pickingRoomFor !== null
                ? targetRooms(
                    roomWidgets.find(w => w.id === pickingRoomFor.widgetId) ??
                      null,
                  ).map(targetRoomId => (
                    <Pressable
                      key={targetRoomId}
                      style={[
                        styles.menuRow,
                        { borderWidth: 1, borderRadius: 10, marginBottom: 6 },
                        { borderColor: tokens.border },
                      ]}
                      testID={`widget-target-room-${targetRoomId}`}
                      onPress={() => {
                        void pickRoom(targetRoomId);
                      }}
                    >
                      <Ionicons
                        name="bed-outline"
                        size={16}
                        color={tokens.primary}
                      />
                      <Text
                        style={[
                          styles.menuRowText,
                          { color: tokens.textPrimary },
                        ]}
                      >
                        {rooms.find(room => room.id === targetRoomId)?.name ??
                          targetRoomId}
                      </Text>
                    </Pressable>
                  ))
                : null}
            </ScrollView>
            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.dialogButton, { borderColor: tokens.border }]}
                onPress={() => setPickingRoomFor(null)}
              >
                <Text
                  style={[
                    styles.dialogButtonText,
                    { color: tokens.textSecondary },
                  ]}
                >
                  {STRINGS.templates.cancel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete-widget confirmation (draft removal — persisted at Save). */}
      <ConfirmDialog
        visible={confirmingDelete !== null}
        title={STRINGS.dashboard.deleteWidget}
        message={
          confirmingDelete
            ? `${STRINGS.dashboard.deleteWidget}: ${
                roomWidgets.find(w => w.id === confirmingDelete)?.title ??
                confirmingDelete
              }?`
            : ''
        }
        onConfirm={() => {
          if (confirmingDelete) {
            onDraftRemove(confirmingDelete);
          }
          setConfirmingDelete(null);
        }}
        onDismiss={() => setConfirmingDelete(null)}
      />

      {/* Discard confirmation for Android/native back with a dirty draft. */}
      <ConfirmDialog
        visible={discardConfirm}
        title={STRINGS.templates.discardChanges}
        message={STRINGS.dashboard.editHint}
        destructive
        confirmLabel={STRINGS.templates.discardConfirm}
        onConfirm={() => {
          setDiscardConfirm(false);
          leaveEditor();
        }}
        onDismiss={() => setDiscardConfirm(false)}
      />
    </View>
  );
}

/** Binding candidates for the configure dialog (room-compatible only). */
function configureCandidates(
  widgetId: string | null,
  roomWidgets: readonly WidgetConfig[],
  devices: readonly Device[],
  capabilities: readonly CapabilityDef[],
  registry: WidgetRegistry,
): readonly {
  readonly device: Device;
  readonly capabilities: readonly CapabilityType[];
}[] {
  const widget = roomWidgets.find(w => w.id === widgetId);
  if (!widget) {
    return [];
  }
  const definition = registry.get(widget.type);
  if (!definition) {
    // Unknown custom type — no registry binding rules to configure.
    return [];
  }
  const supported = effectiveCapabilities(definition, capabilities);
  return devices
    .filter(device => device.roomId === widget.roomId)
    .map(device => ({
      device,
      capabilities: device.capabilities.filter(capability =>
        supported.includes(capability),
      ),
    }))
    .filter(candidate => candidate.capabilities.length > 0);
}

function capabilityLabel(
  capability: CapabilityType,
  capabilities: readonly CapabilityDef[],
): string {
  return (
    capabilities.find(entry => entry.type === capability)?.label ?? capability
  );
}

/**
 * Reserved vertical space of ONE section label row (pill: fontSize 12 +
 * vertical padding 5×2 + marginBottom 10 + a small gap) — matches the
 * view screens' `sectionLabel` recipe.
 */
const SECTION_LABEL_ROW = 36;

const makeStyles = (tokens: {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  chipActiveBg: string;
}) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: tokens.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    headerAction: { paddingVertical: 6, paddingHorizontal: 4 },
    headerActionText: { fontSize: 15, fontWeight: '700' },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: tokens.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 11,
      color: tokens.textSecondary,
      textAlign: 'center',
      marginTop: 1,
    },
    backButton: { padding: 4 },
    content: { padding: 12, paddingBottom: 60 },
    gridShell: {},
    addWidgetButton: {
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 12,
      marginTop: 12,
    },
    addWidgetText: { fontWeight: '700', fontSize: 14 },
    menuAnchor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
    },
    menuAnchorText: { fontSize: 12, color: tokens.textSecondary, flex: 1 },
    emptyHint: {
      color: tokens.textSecondary,
      textAlign: 'center',
      marginTop: 40,
      fontSize: 14,
      paddingHorizontal: 32,
    },
    menuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    menuCard: {
      width: '100%',
      maxWidth: 320,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 8,
    },
    menuTitle: {
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    menuRowText: { fontSize: 14, fontWeight: '500' },
    dialogCard: {
      width: '100%',
      borderRadius: 14,
      borderWidth: 1,
      padding: 16,
    },
    dialogTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
    dialogHint: { fontSize: 12, marginTop: 8, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: tokens.textPrimary,
      fontSize: 14,
    },
    dialogActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 14,
    },
    dialogButton: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    dialogButtonText: { fontSize: 14, fontWeight: '600' },
    pickerList: { maxHeight: 200 },
    pickerDeviceRow: { marginBottom: 10 },
    pickerDeviceName: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    pickerCapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    capChip: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    capChipText: { fontSize: 12, fontWeight: '500' },
    // Section label pill (same recipe as the view screens — WYSIWYG).
    sectionLabel: {
      alignSelf: 'flex-start',
      borderRadius: 9,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.chipActiveBg,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 10,
    },
    sectionLabelText: {
      fontSize: 12,
      fontWeight: '600',
      color: tokens.textSecondary,
    },
    // Swap confirmation block (fix cycle 7 G): framed inside the Configure
    // dialog above its action row.
    swapConfirmCard: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
    },
  });
